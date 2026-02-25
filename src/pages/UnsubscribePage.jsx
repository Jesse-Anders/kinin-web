import { useEffect, useMemo, useState } from "react";

function parseUnsubscribeParams() {
  const hash = window.location.hash || "";
  const hashQueryIdx = hash.indexOf("?");
  if (hashQueryIdx >= 0) {
    const search = hash.slice(hashQueryIdx + 1);
    const p = new URLSearchParams(search);
    return {
      email: (p.get("email") || "").trim().toLowerCase(),
      exp: (p.get("exp") || "").trim(),
      token: (p.get("token") || "").trim(),
    };
  }
  const p = new URLSearchParams(window.location.search || "");
  return {
    email: (p.get("email") || "").trim().toLowerCase(),
    exp: (p.get("exp") || "").trim(),
    token: (p.get("token") || "").trim(),
  };
}

async function postEmailPrefs(apiBase, endpoint, payload) {
  const res = await fetch(`${apiBase}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed = null;
  try {
    const outer = JSON.parse(text);
    parsed = typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const detail = parsed ? JSON.stringify(parsed) : text;
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return parsed || {};
}

export default function UnsubscribePage({ apiBase }) {
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [globalUnsubscribed, setGlobalUnsubscribed] = useState(null);

  const params = useMemo(() => parseUnsubscribeParams(), []);
  const hasTokenInputs = !!(params.email && params.exp && params.token);

  useEffect(() => {
    async function runAutoUnsubscribe() {
      if (!hasTokenInputs) return;
      setBusy(true);
      setErrorText("");
      setStatusText("");
      try {
        const payload = {
          email: params.email,
          exp: params.exp,
          token: params.token,
        };
        const out = await postEmailPrefs(apiBase, "/email_prefs/unsubscribe", payload);
        setGlobalUnsubscribed(!!out.global_unsubscribed);
        setStatusText("You have been unsubscribed from non-essential Kinin emails.");
      } catch (e) {
        setErrorText(e.message || String(e));
      } finally {
        setBusy(false);
      }
    }
    runAutoUnsubscribe();
  }, [apiBase, hasTokenInputs, params.email, params.exp, params.token]);

  async function doResubscribe() {
    setBusy(true);
    setErrorText("");
    setStatusText("");
    try {
      const payload = {
        email: params.email,
        exp: params.exp,
        token: params.token,
      };
      const out = await postEmailPrefs(apiBase, "/email_prefs/resubscribe", payload);
      setGlobalUnsubscribed(!!out.global_unsubscribed);
      setStatusText("You are resubscribed. Non-essential emails are enabled again.");
    } catch (e) {
      setErrorText(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!hasTokenInputs) return;
    setBusy(true);
    setErrorText("");
    try {
      const payload = {
        email: params.email,
        exp: params.exp,
        token: params.token,
      };
      const out = await postEmailPrefs(apiBase, "/email_prefs/status", payload);
      setGlobalUnsubscribed(!!out.global_unsubscribed);
    } catch (e) {
      setErrorText(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 760 }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Email Preferences</div>

      {!hasTokenInputs ? (
        <div style={{ color: "#b00020" }}>
          This unsubscribe link is missing required parameters. Please use the full link from your email.
        </div>
      ) : null}

      {hasTokenInputs ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 14 }}>
            Email: <b>{params.email}</b>
          </div>
          <div style={{ opacity: 0.8 }}>
            {globalUnsubscribed === true
              ? "Current status: unsubscribed from non-essential emails."
              : globalUnsubscribed === false
                ? "Current status: subscribed to non-essential emails."
                : "Checking status..."}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={doResubscribe} disabled={busy}>
              {busy ? "Working..." : "Resubscribe"}
            </button>
            <button onClick={refreshStatus} disabled={busy}>
              {busy ? "Working..." : "Refresh Status"}
            </button>
          </div>
        </div>
      ) : null}

      {statusText ? <div style={{ marginTop: 12, color: "#0a6a3b" }}>{statusText}</div> : null}
      {errorText ? <div style={{ marginTop: 12, color: "#b00020" }}>{errorText}</div> : null}
    </div>
  );
}
