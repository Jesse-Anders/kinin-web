// Tiny shared client for admin metrics endpoints. Wraps the bearer-auth +
// JSON-body convention used elsewhere and unwraps the Lambda-proxy double
// envelope ({statusCode, body: "json-string"}) that some endpoints return.

export async function postAdminApi({
  apiBase,
  path,
  body,
  getAccessToken,
}) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body || {}),
  });
  return parseAdminResponse(res);
}

export async function getAdminApi({ apiBase, path, getAccessToken }) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${apiBase}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseAdminResponse(res);
}

export async function deleteAdminApi({ apiBase, path, body, getAccessToken }) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${apiBase}${path}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body || {}),
  });
  return parseAdminResponse(res);
}

export async function putAdminApi({ apiBase, path, body, getAccessToken }) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${apiBase}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body || {}),
  });
  return parseAdminResponse(res);
}

async function parseAdminResponse(res) {
  const text = await res.text();
  let data = null;
  try {
    const outer = JSON.parse(text);
    data = typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    data = null;
  }
  if (!res.ok) {
    let detail = data && typeof data === "object" ? JSON.stringify(data) : text;
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return data;
}
