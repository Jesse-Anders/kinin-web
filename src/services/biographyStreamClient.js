// WebSocket client for streaming biography replies (route "biography.stream").
//
// Mirrors turnStreamClient/streamTurn but for the stateless biography chat: it
// sends a single message, forwards token deltas via onDelta, and resolves with
// the final payload (response text + memories_used + citations). Business
// errors (e.g. no_memories_available) reject with an Error carrying `.code`,
// `.detail`, and `.display_name` so the caller can render the same soft states
// as the HTTP path; transport failures reject with a generic code so the caller
// can fall back to HTTP.
export function streamBiography({
  wsUrl,
  accessToken,
  biographyOwnerUserId,
  message,
  history,
  clientRequestId,
  onDelta,
  timeoutMs = 30000,
}) {
  return new Promise((resolve, reject) => {
    if (!wsUrl) {
      reject(makeErr("stream_ws_url_missing"));
      return;
    }
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      reject(e);
      return;
    }
    let closed = false;
    let finalPayload = null;
    const timer = setTimeout(() => {
      if (closed) return;
      closed = true;
      try {
        ws.close();
      } catch {
        // Ignore close failures.
      }
      reject(makeErr("stream_timeout"));
    }, timeoutMs);

    function done(fn) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // Ignore.
      }
      fn();
    }

    ws.onopen = () => {
      const payload = {
        action: "biography.stream",
        access_token: accessToken,
        biography_owner_user_id: biographyOwnerUserId,
        message,
      };
      if (Array.isArray(history) && history.length) payload.history = history;
      if (clientRequestId) payload.client_request_id = clientRequestId;
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      let parsed = null;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        parsed = null;
      }
      if (!parsed || typeof parsed !== "object") return;
      const type = parsed.type;
      if (type === "stream.delta") {
        const delta = typeof parsed.delta === "string" ? parsed.delta : "";
        if (delta && typeof onDelta === "function") onDelta(delta);
        return;
      }
      if (type === "stream.final") {
        finalPayload = parsed;
        return;
      }
      if (type === "stream.error") {
        const err = makeErr(parsed.error || "stream_error");
        err.detail = parsed.detail;
        err.display_name = parsed.display_name;
        done(() => reject(err));
        return;
      }
      if (type === "stream.done") {
        if (parsed.ok && finalPayload) {
          done(() => resolve(finalPayload));
        } else if (parsed.ok) {
          done(() => resolve(parsed));
        } else {
          done(() => reject(makeErr("stream_done_not_ok")));
        }
      }
    };

    ws.onerror = () => {
      done(() => reject(makeErr("stream_socket_error")));
    };

    ws.onclose = () => {
      if (!closed) {
        done(() => reject(makeErr("stream_socket_closed")));
      }
    };
  });
}

function makeErr(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// Transport/availability failures where retrying over HTTP makes sense.
// Business errors (access denied, no memories, disabled) are NOT here — those
// mean HTTP would fail identically, so the caller should render the soft state.
const TRANSPORT_ERROR_CODES = new Set([
  "stream_ws_url_missing",
  "stream_timeout",
  "stream_socket_error",
  "stream_socket_closed",
  "stream_done_not_ok",
  "stream_error",
  "streaming_disabled",
  "missing_user_id",
]);

export function isStreamTransportError(err) {
  const code = err && typeof err === "object" ? err.code : null;
  return !code || TRANSPORT_ERROR_CODES.has(code);
}
