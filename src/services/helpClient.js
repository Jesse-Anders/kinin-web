// Client for the Kinin meta help agent (POST /help).
//
// Help conversations are fully separate from the biographical interview: they
// live in their own backend store and never enter the interview/memory/journey
// pipelines. Non-streamed request/response (unlike the interview turn, which
// streams over the websocket).

import { throwIfUnauthorized } from "./authSession";

export async function sendHelpTurn({ apiBase, token, message, helpSessionId }) {
  if (!apiBase) throw new Error("help_api_base_missing");
  const body = { message };
  if (helpSessionId) body.help_session_id = helpSessionId;

  const res = await fetch(`${apiBase}/help`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  await throwIfUnauthorized(res);
  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.error || err?.detail || "";
    } catch {
      // Ignore parse failures; fall back to status code.
    }
    throw new Error(detail || `help_http_${res.status}`);
  }

  const data = await res.json();
  // Some deployments wrap the JSON body as a string under `body`.
  const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
  return parsed; // { ok, help_session_id, answer, kb_version }
}
