import { useEffect, useMemo, useState } from "react";

function parseParams() {
  const p = new URLSearchParams(window.location.search || "");
  const hash = String(window.location.hash || "");
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const hp = new URLSearchParams(hashQuery);
  const fromEither = (key) => (p.get(key) || hp.get(key) || "").trim();
  return {
    owner_user_id: fromEither("owner_user_id"),
    email: fromEither("email").toLowerCase(),
    exp: fromEither("exp"),
    token: fromEither("token"),
    owner_name: fromEither("owner_name"),
  };
}

export default function ExecutorAcceptPage({ apiBase }) {
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const params = useMemo(() => parseParams(), []);
  const apiBaseNorm = String(apiBase || "").trim();
  const hasInputs = !!(params.owner_user_id && params.email && params.exp && params.token);

  useEffect(() => {
    async function runAccept() {
      if (!hasInputs) return;
      if (!apiBaseNorm) {
        setErrorText(
          "Confirmation service is not configured for this site variant. Please contact support and include this link."
        );
        return;
      }
      setBusy(true);
      setStatusText("");
      setErrorText("");
      try {
        const res = await fetch(`${apiBaseNorm}/account_executor/accept`, {
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
        const raw = e?.message || String(e);
        const generic =
          "We could not confirm this request right now. Please retry from the email link in a moment.";
        if (
          String(raw).toLowerCase().includes("failed to fetch") ||
          String(raw).toLowerCase().includes("load failed")
        ) {
          setErrorText(`${generic} This usually means the confirmation API is unreachable from this site.`);
        } else {
          setErrorText(raw);
        }
      } finally {
        setBusy(false);
      }
    }
    runAccept();
  }, [apiBaseNorm, hasInputs, params]);

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 16,
          maxWidth: 760,
          margin: "0 auto",
        }}
      >
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Account Executor Confirmation</div>
      <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.45, marginBottom: 8 }}>
        {params.owner_name
          ? `Thank you for being ${params.owner_name}'s trusted account executor in Kinin.`
          : "Thank you for being a trusted account executor in Kinin."}
      </div>
      <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.45, marginBottom: 12 }}>
        Kinin is an AI biographer where people share their stories, memories, and life experiences over time.
      </div>
      {!hasInputs ? (
        <div style={{ color: "#b00020" }}>
          This confirmation link is missing required parameters. Please use the full link from your email.
        </div>
      ) : null}
      {busy ? <div>Confirming...</div> : null}
      {statusText ? <div style={{ marginTop: 12, color: "#0a6a3b" }}>{statusText}</div> : null}
      {errorText ? <div style={{ marginTop: 12, color: "#b00020" }}>{errorText}</div> : null}
      </div>
    </div>
  );
}
