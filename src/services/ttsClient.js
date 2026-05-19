import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

async function getIdToken() {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) throw new Error("Missing idToken. Are you logged in?");
  return idToken;
}

function base64ToBlob(base64, contentType) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType || "audio/mpeg" });
}

/**
 * Synthesize Kinin's text to speech via the /tts endpoint.
 *
 * Returns an object with a playable object URL plus metadata:
 *   { objectUrl, contentType, durationS, elapsedMs }
 *
 * Callers are responsible for revoking `objectUrl` via URL.revokeObjectURL
 * once playback finishes, to free memory.
 */
export async function synthesizeTts({
  text,
  voiceUuid,
  model,
  voicePrompt,
  signal,
} = {}) {
  if (!API_BASE) throw new Error("VITE_API_BASE_URL is not set");
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("text is required");
  }

  const idToken = await getIdToken();
  const body = { text };
  if (voiceUuid) body.voice_uuid = voiceUuid;
  if (model) body.model = model;
  if (voicePrompt) body.voice_prompt = voicePrompt;

  const res = await fetch(`${API_BASE}/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed?.ok) {
    const err = new Error(parsed?.error || `tts_http_${res.status}`);
    err.status = res.status;
    err.detail = parsed?.detail;
    throw err;
  }

  const blob = base64ToBlob(parsed.audio_base64, parsed.content_type);
  const objectUrl = URL.createObjectURL(blob);
  return {
    objectUrl,
    contentType: parsed.content_type,
    durationS: parsed.duration_s ?? null,
    elapsedMs: parsed.elapsed_ms ?? null,
  };
}

/**
 * Fire a "warm" /tts request that returns immediately on the backend
 * without invoking Resemble. Used to wake the Lambda container during
 * the user's toggle-ON gesture so the next real synthesis avoids
 * paying ~1s of cold-start. Errors are swallowed (best-effort).
 */
export async function warmTts({ signal } = {}) {
  if (!API_BASE) return;
  let idToken;
  try {
    idToken = await getIdToken();
  } catch {
    return;
  }
  try {
    await fetch(`${API_BASE}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ warm: true }),
      signal,
    });
  } catch {
    // Best-effort pre-warm; ignore failures.
  }
}
