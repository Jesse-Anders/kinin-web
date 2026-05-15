import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Frame, Section, Spinner } from "../theme";

function parseUnsubscribeParams() {
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
        const payload = { email: params.email, exp: params.exp, token: params.token };
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
      const payload = { email: params.email, exp: params.exp, token: params.token };
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
      const payload = { email: params.email, exp: params.exp, token: params.token };
      const out = await postEmailPrefs(apiBase, "/email_prefs/status", payload);
      setGlobalUnsubscribed(!!out.global_unsubscribed);
    } catch (e) {
      setErrorText(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      eyebrow="Email preferences"
      title={
        <>
          Your<br /><em>inbox, your call.</em>
        </>
      }
    >
      {!hasTokenInputs ? (
        <Banner tone="danger">
          <span>
            This unsubscribe link is missing required parameters. Please use the full link from your email.
          </span>
        </Banner>
      ) : null}

      {hasTokenInputs ? (
        <Frame label="Subscription status">
          <div className="km-stack" style={{ gap: 16 }}>
            <div>
              <div className="km-mono-label" style={{ marginBottom: 6 }}>Email</div>
              <div className="km-field-value">{params.email}</div>
            </div>
            <div>
              <div className="km-mono-label" style={{ marginBottom: 6 }}>Current status</div>
              <div className="km-prose" style={{ margin: 0 }}>
                {globalUnsubscribed === true ? (
                  <>You're <strong>unsubscribed</strong> from non-essential emails.</>
                ) : globalUnsubscribed === false ? (
                  <>You're <strong>subscribed</strong> to non-essential emails.</>
                ) : (
                  <>Checking status...</>
                )}
              </div>
            </div>
            <div className="km-row">
              <Button variant="primary" onClick={doResubscribe} disabled={busy}>
                {busy ? (
                  <>
                    <Spinner /> Working...
                  </>
                ) : (
                  "Resubscribe"
                )}
              </Button>
              <Button onClick={refreshStatus} disabled={busy}>
                Refresh status
              </Button>
            </div>
          </div>
        </Frame>
      ) : null}

      {statusText ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="info">{statusText}</Banner>
        </div>
      ) : null}
      {errorText ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="danger">{errorText}</Banner>
        </div>
      ) : null}
    </Section>
  );
}
