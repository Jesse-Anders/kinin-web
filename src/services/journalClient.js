// Client for the Journal API (kinin-lambda). All calls require a bearer token
// (Cognito access token). The Lambda proxy sometimes double-envelopes responses
// ({ body: "<json string>" }), so parse defensively.

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
    const err = new Error(`API error ${res.status}: ${detail}`);
    err.status = res.status;
    err.payload = parsed;
    throw err;
  }
  return parsed;
}

export async function listEntries({ apiBase, token, status = "all", limit = 50, startKey } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (limit) params.set("limit", String(limit));
  if (startKey) {
    params.set("start_key", typeof startKey === "string" ? startKey : JSON.stringify(startKey));
  }
  const qs = params.toString();
  return request(apiBase, token, `/journal${qs ? `?${qs}` : ""}`);
}

export async function getEntry({ apiBase, token, entryId } = {}) {
  return request(apiBase, token, `/journal/${encodeURIComponent(entryId)}`);
}

export async function createEntry({ apiBase, token, title, body } = {}) {
  return request(apiBase, token, "/journal", { method: "POST", body: { title, body } });
}

export async function updateEntry({ apiBase, token, entryId, updates } = {}) {
  return request(apiBase, token, `/journal/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    body: updates,
  });
}

export async function deleteEntry({ apiBase, token, entryId } = {}) {
  return request(apiBase, token, `/journal/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  });
}

export async function reviewEntry({ apiBase, token, entryId, mode, title, body } = {}) {
  return request(apiBase, token, `/journal/${encodeURIComponent(entryId)}/review`, {
    method: "POST",
    body: { mode, title, body },
  });
}

export async function saveEntry({ apiBase, token, entryId, title, body } = {}) {
  return request(apiBase, token, `/journal/${encodeURIComponent(entryId)}/save`, {
    method: "POST",
    body: { title, body },
  });
}
