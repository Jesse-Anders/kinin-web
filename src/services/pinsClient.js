// Client for the Memory Pins API (kinin-lambda). All calls require a bearer
// token (Cognito access token). The Lambda proxy sometimes double-envelopes
// responses ({ body: "<json string>" }), so parse defensively.

function parseApiPayload(text) {
  try {
    const outer = JSON.parse(text);
    return typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    return null;
  }
}

async function request(apiBase, token, path, { method = "GET", body } = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = parseApiPayload(text);
  if (!res.ok) {
    const detail = parsed ? JSON.stringify(parsed) : text;
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return parsed;
}

export async function listPins({ apiBase, token, status = "active", limit = 50, startKey } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (limit) params.set("limit", String(limit));
  if (startKey) {
    params.set("start_key", typeof startKey === "string" ? startKey : JSON.stringify(startKey));
  }
  const qs = params.toString();
  return request(apiBase, token, `/pins${qs ? `?${qs}` : ""}`);
}

export async function createPin({ apiBase, token, text } = {}) {
  return request(apiBase, token, "/pins", { method: "POST", body: { text } });
}

export async function updatePin({ apiBase, token, pinId, updates } = {}) {
  return request(apiBase, token, `/pins/${encodeURIComponent(pinId)}`, {
    method: "PATCH",
    body: updates,
  });
}

export async function deletePin({ apiBase, token, pinId } = {}) {
  return request(apiBase, token, `/pins/${encodeURIComponent(pinId)}`, {
    method: "DELETE",
  });
}
