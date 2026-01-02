import os
import json
import time
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key

# -----------------------------
# Clients / resources (pin region)
# -----------------------------
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
s3 = boto3.client("s3", region_name=AWS_REGION)
bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)

# -----------------------------
# Env config
# -----------------------------
USERSTATE_TABLE = os.environ["USERSTATE_TABLE"]
TURNS_TABLE = os.environ["TURNS_TABLE"]
ARCHIVE_BUCKET = os.environ["ARCHIVE_BUCKET"]
MODEL_ID = os.environ["BEDROCK_MODEL_ID"]

userstate_tbl = dynamodb.Table(USERSTATE_TABLE)
turns_tbl = dynamodb.Table(TURNS_TABLE)

# -----------------------------
# API functions
# -----------------------------
import base64

def get_jwt_claims(event: dict) -> dict:
    return (
        event.get("requestContext", {})
             .get("authorizer", {})
             .get("jwt", {})
             .get("claims", {})
    )

def parse_json_body(event: dict) -> dict:
    body = event.get("body")
    if body is None:
        return {}
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    if isinstance(body, str):
        return json.loads(body)
    # Sometimes tools invoke Lambda with a dict already
    if isinstance(body, dict):
        return body
    return {}


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_context_pack(user_state: dict, recent_turns: list[dict]) -> str:
    """
    Keep this small and intentional.
    """
    profile = user_state.get("profile_snapshot", {})
    active_threads = user_state.get("active_threads", [])
    open_loops = user_state.get("open_loops", [])

    turns_text = []
    for t in recent_turns:
        role = t.get("role", "unknown")
        content = t.get("content", "")
        turns_text.append(f"{role.upper()}: {content}")

    context = {
        "profile_snapshot": profile,
        "active_threads": active_threads,
        "open_loops": open_loops,
        "recent_turns": turns_text[-20:]
    }
    return json.dumps(context, ensure_ascii=False)

def bedrock_chat(message: str, context_pack_json: str) -> str:
    system_prompt = (
        "You are The Interviewer, a warm, persistent biographical interviewer. "
        "You ask one thoughtful question at a time, keep it concise, and build on prior context. "
        "Avoid repeating questions already answered. Use the provided context pack."
    )

    prompt = (
        f"{system_prompt}\n\n"
        f"CONTEXT_PACK_JSON:\n{context_pack_json}\n\n"
        #f"User: {message}\n"
        #f"Bot:"
    )

    body = {
        "inputText": prompt,
        "textGenerationConfig": {
            "maxTokenCount": 350,
            "temperature": 0.7,
            "topP": 0.9,
            "stopSequences": ["User:", "\nUser:"]
        }
    }

    try:
        resp = bedrock.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps(body).encode("utf-8"),
            accept="application/json",
            contentType="application/json",
        )
        raw = resp["body"].read()
        data = json.loads(raw)

        results = data.get("results", [])
        if results and isinstance(results, list):
            return (results[0].get("outputText") or "").strip()

        return json.dumps(data)[:5000]

    except ClientError as e:
        raise RuntimeError(f"Bedrock invoke_model failed: {e}") from e

# def bedrock_chat(message: str, context_pack_json: str) -> str:
#     """
#     Anthropic Claude request shape for Bedrock invoke_model.
#     """
#     system_prompt = (
#         "You are The Interviewer, a warm, persistent biographical interviewer. "
#         "You ask one thoughtful question at a time, keep it concise, and build on prior context. "
#         "Avoid repeating questions already answered. Use the provided context pack."
#     )

#     body = {
#         "anthropic_version": "bedrock-2023-05-31",
#         "max_tokens": 350,
#         "temperature": 0.7,
#         "system": f"{system_prompt}\n\nCONTEXT_PACK_JSON:\n{context_pack_json}",
#         "messages": [
#             {
#                 "role": "user",
#                 "content": [{"type": "text", "text": message}]
#             }
#         ],
#     }

#     try:
#         resp = bedrock.invoke_model(
#             modelId=MODEL_ID,
#             body=json.dumps(body).encode("utf-8"),
#             accept="application/json",
#             contentType="application/json",
#         )
#         raw = resp["body"].read()
#         data = json.loads(raw)

#         # Typical Anthropic response: {"content":[{"type":"text","text":"..."}], ...}
#         content = data.get("content", [])
#         if isinstance(content, list):
#             for block in content:
#                 if isinstance(block, dict) and block.get("type") == "text":
#                     return (block.get("text") or "").strip()

#         # fallback (helps debugging)
#         return json.dumps(data)[:5000]

#     except ClientError as e:
#         # Bubble up a readable error for logs
#         raise RuntimeError(f"Bedrock invoke_model failed: {e}") from e


def query_recent_turns(user_id: str, limit: int = 12) -> list[dict]:
    """
    Requires ConversationTurns table schema:
      PK: user_id
      SK: ts#session_id#turn_id
    """
    try:
        resp = turns_tbl.query(
            KeyConditionExpression=Key("user_id").eq(user_id),
            ScanIndexForward=False,  # newest first (by sort key)
            Limit=limit
        )
        return resp.get("Items", [])
    except ClientError as e:
        raise RuntimeError(f"DynamoDB query failed: {e}") from e


def put_turn(user_id: str, sk: str, item: dict) -> None:
    try:
        turns_tbl.put_item(
            Item={
                "user_id": user_id,
                "ts#session_id#turn_id": sk,
                **item
            }
        )
    except ClientError as e:
        raise RuntimeError(f"DynamoDB put_item (turn) failed: {e}") from e


def write_turn_to_s3(user_id: str, session_id: str, line: dict) -> None:
    """
    Write one object per turn (no overwrite, no fake "append").
    """
    now = utc_iso()
    turn_id = uuid.uuid4().hex[:12]
    key = f"{user_id}/sessions/{session_id}/turns/{now}_{turn_id}.json"

    try:
        s3.put_object(
            Bucket=ARCHIVE_BUCKET,
            Key=key,
            Body=json.dumps(line, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json"
        )
    except ClientError as e:
        raise RuntimeError(f"S3 put_object failed: {e}") from e


def lambda_handler(event, context):
    """
    Supports direct test invokes and HTTP API (Cognito JWT) invokes.
    """
    start = time.time()

    # --- Support both direct test invokes AND HTTP API invokes ---
    claims = get_jwt_claims(event)
    body = parse_json_body(event)

    # If called through Cognito+API, user_id comes from JWT 'sub'
    user_id = claims.get("sub") or event.get("user_id")

    # session_id/message can be in body (HTTP API) or top-level (direct invoke)
    session_id = body.get("session_id") or event.get("session_id") or f"sess_{uuid.uuid4().hex[:10]}"
    message = body.get("message") or event.get("message")

    if not user_id:
        return {"statusCode": 401, "body": json.dumps({"error": "Unauthorized: missing user identity"})}

    if not message:
        return {"statusCode": 400, "body": json.dumps({"error": "message required"})}

    # Optional: capture email for later profile use
    email = claims.get("email")

    try:
        # 1) Load UserState (or default)
        user_state_resp = userstate_tbl.get_item(Key={"user_id": user_id})
        user_state = user_state_resp.get("Item") or {
            "user_id": user_id,
            "profile_snapshot": {},
            "active_threads": [],
            "open_loops": [],
            "interview_mode": "guided",
            "updated_at": utc_iso()
        }

        # Debug/seed profile email when available
        if email:
            profile = user_state.get("profile_snapshot", {}) or {}
            if "email" not in profile:
                profile["email"] = email
            user_state["profile_snapshot"] = profile

        # 2) Pull recent turns
        recent_turns = query_recent_turns(user_id, limit=12)

        # 3) Build context pack
        context_pack = build_context_pack(user_state, recent_turns)

        # 4) Call Bedrock
        assistant_text = bedrock_chat(message, context_pack)

        # 5) Write turns to DynamoDB
        now = utc_iso()
        turn_id_user = uuid.uuid4().hex[:8]
        turn_id_asst = uuid.uuid4().hex[:8]

        sk_user = f"{now}#{session_id}#{turn_id_user}"
        sk_asst = f"{now}#{session_id}#{turn_id_asst}"

        put_turn(user_id, sk_user, {
            "session_id": session_id,
            "timestamp": now,
            "role": "user",
            "content": message
        })

        put_turn(user_id, sk_asst, {
            "session_id": session_id,
            "timestamp": now,
            "role": "assistant",
            "content": assistant_text,
            "model_id": MODEL_ID
        })

        # 6) Update user state “last seen”
        user_state["updated_at"] = now
        user_state["last_session_id"] = session_id
        userstate_tbl.put_item(Item=user_state)

        # 7) Archive to S3 (one object per turn pair)
        archive_line = {
            "timestamp": now,
            "user_id": user_id,
            "session_id": session_id,
            "user_message": message,
            "assistant_message": assistant_text,
            "model_id": MODEL_ID
        }
        write_turn_to_s3(user_id, session_id, archive_line)

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "statusCode": 200,
            "body": json.dumps({
                "session_id": session_id,
                "assistant": assistant_text,
                "elapsed_ms": elapsed_ms
            })
        }

    except Exception as e:
        # Ensure Lambda returns a clean 500 while logging full error in CloudWatch
        print(f"ERROR: {repr(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }

