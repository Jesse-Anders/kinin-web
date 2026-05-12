import { useEffect, useMemo, useState } from "react";

function parseParams() {
  const p = new URLSearchParams(window.location.search || "");
  return {
    owner_user_id: (p.get("owner_user_id") || "").trim(),
    email: (p.get("email") || "").trim().toLowerCase(),
    exp: (p.get("exp") || "").trim(),
    token: (p.get("token") || "").trim(),
  };
}

export default function ExecutorAcceptPage({ apiBase }) {
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const params = useMemo(() => parseParams(), []);
  const hasInputs = !!(params.owner_user_id && params.email && params.exp && params.token);

  useEffect(() => {
    async function runAccept() {
      if (!hasInputs) return;
      setBusy(true);
      setStatusText("");
      setErrorText("");
      try {
        const res = await fetch(`${apiBase}/account_executor/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
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
        const out = parsed || {};
        if (out.status === "already_confirmed") {
          setStatusText("This account executor request was already confirmed.");
        } else {
          setStatusText("You have confirmed this account executor request.");
        }
      } catch (e) {
        setErrorText(e.message || String(e));
      } finally {
        setBusy(false);
      }
    }
    runAccept();
  }, [apiBase, hasInputs, params]);

  return (
    <div style={{ padding: 16, maxWidth: 760 }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Account Executor Confirmation</div>
      {!hasInputs ? (
        <div style={{ color: "#b00020" }}>
          This confirmation link is missing required parameters. Please use the full link from your email.
        </div>
      ) : null}
      {busy ? <div>Confirming...</div> : null}
      {statusText ? <div style={{ marginTop: 12, color: "#0a6a3b" }}>{statusText}</div> : null}
      {errorText ? <div style={{ marginTop: 12, color: "#b00020" }}>{errorText}</div> : null}
    </div>
  );
}
