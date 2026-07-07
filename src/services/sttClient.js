import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

async function getIdToken() {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) throw new Error("Missing idToken. Are you logged in?");
  return idToken;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("read_failed"));
    reader.onloadend = () => {
      const result = reader.result || "";
      // result is a data URL: "data:<mime>;base64,<payload>"
      const comma = String(result).indexOf(",");
      resolve(comma >= 0 ? String(result).slice(comma + 1) : String(result));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcribe recorded audio to text via the /stt endpoint.
 *
 * @param {Object} args
 * @param {Blob} args.blob        Recorded audio blob (from MediaRecorder).
 * @param {string} [args.mimeType] Override mime type; defaults to blob.type.
 * @param {string} [args.language] Optional ISO-639-1 hint, e.g. "en".
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{ text: string, elapsedMs: number|null }>}
 */
export async function transcribeAudio({ blob, mimeType, language, signal } = {}) {
  if (!API_BASE) throw new Error("VITE_API_BASE_URL is not set");
  if (!blob || !blob.size) throw new Error("No audio to transcribe");

  const idToken = await getIdToken();
  const audioBase64 = await blobToBase64(blob);
  const body = {
    audio_base64: audioBase64,
    mime_type: mimeType || blob.type || "audio/webm",
  };
  if (language) body.language = language;

  const res = await fetch(`${API_BASE}/stt`, {
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
    const err = new Error(parsed?.error || `stt_http_${res.status}`);
    err.status = res.status;
    err.detail = parsed?.detail;
    throw err;
  }

  return {
    text: parsed.text || "",
    elapsedMs: parsed.elapsed_ms ?? null,
  };
}
