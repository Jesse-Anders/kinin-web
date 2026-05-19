import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

async function getIdToken() {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) throw new Error("Missing idToken. Are you logged in?");
  return idToken;
}

/**
 * Fetch the Resemble Voice Settings Presets that the configured Resemble
 * API key can see. Returns:
 *   {
 *     customPresets: [{uuid, name, settings, ...}, ...],
 *     defaultPresets: [...],
 *     elapsedMs: number | null,
 *   }
 *
 * Throws on auth or non-2xx errors.
 */
export async function listTtsPresets({ signal } = {}) {
  if (!API_BASE) throw new Error("VITE_API_BASE_URL is not set");
  const idToken = await getIdToken();
  const res = await fetch(`${API_BASE}/tts/presets`, {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken}` },
    signal,
  });

  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed?.ok) {
    const err = new Error(parsed?.error || `tts_presets_http_${res.status}`);
    err.status = res.status;
    err.detail = parsed?.detail;
    throw err;
  }

  return {
    customPresets: Array.isArray(parsed.custom_presets)
      ? parsed.custom_presets
      : [],
    defaultPresets: Array.isArray(parsed.default_presets)
      ? parsed.default_presets
      : [],
    elapsedMs: parsed.elapsed_ms ?? null,
  };
}
