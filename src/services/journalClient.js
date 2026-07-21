// Client for the Journal API (kinin-lambda). All calls require a bearer token
// (Cognito access token). The Lambda proxy sometimes double-envelopes responses
// ({ body: "<json string>" }), so parse defensively.

import { throwIfUnauthorized } from "./authSession";

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
  await throwIfUnauthorized(res);
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

export async function findEntriesByPin({ apiBase, token, pinId } = {}) {
  const qs = new URLSearchParams({ source_pin_id: pinId }).toString();
  return request(apiBase, token, `/journal?${qs}`);
}

export async function createEntry({ apiBase, token, title, body, sourcePinId } = {}) {
  const payload = { title, body };
  if (sourcePinId) payload.source_pin_id = sourcePinId;
  return request(apiBase, token, "/journal", { method: "POST", body: payload });
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

// --- Media attachments (journal photos) --------------------------------------

// Step 1: ask the server for a presigned S3 PUT URL for one photo.
export async function presignPhoto({ apiBase, token, entryId, mime, bytes, filename } = {}) {
  return request(apiBase, token, `/journal/${encodeURIComponent(entryId)}/media/presign`, {
    method: "POST",
    body: { mime, bytes, filename },
  });
}

// Step 2: upload the bytes straight to S3. No Authorization header — the URL is
// pre-signed. The Content-Type MUST match what was signed (the photo's mime).
export async function uploadPhotoToS3({ uploadUrl, file, mime } = {}) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime || file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const err = new Error(`Photo upload failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
}

// Step 3: confirm the upload so the server records attachment metadata.
export async function confirmPhoto({ apiBase, token, entryId, photoId, mime, width, height, caption } = {}) {
  return request(apiBase, token, `/journal/${encodeURIComponent(entryId)}/media`, {
    method: "POST",
    body: { photo_id: photoId, mime, width, height, caption },
  });
}

export async function updatePhotoCaption({ apiBase, token, entryId, photoId, caption } = {}) {
  return request(
    apiBase,
    token,
    `/journal/${encodeURIComponent(entryId)}/media/${encodeURIComponent(photoId)}`,
    { method: "PATCH", body: { caption } }
  );
}

export async function deletePhoto({ apiBase, token, entryId, photoId } = {}) {
  return request(
    apiBase,
    token,
    `/journal/${encodeURIComponent(entryId)}/media/${encodeURIComponent(photoId)}`,
    { method: "DELETE" }
  );
}
