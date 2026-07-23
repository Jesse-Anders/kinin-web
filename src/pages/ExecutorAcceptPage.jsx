import { useEffect, useMemo, useState } from "react";
import { Banner, Frame, Section, Spinner } from "../theme";

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
  // New links carry only a self-contained `token`. Legacy links also include
  // owner_user_id/email/exp (still forwarded below for backward compatibility).
  const hasInputs = !!params.token;

  useEffect(() => {
    async function runAccept() {
      if (!hasInputs) return;
      if (!apiBaseNorm) {
        setErrorText(
          "Confirmation service is not configured for this site variant. Please contact support and include this link.",
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
          setStatusText("This Account Steward invitation was already confirmed.");
        } else {
          setStatusText("Thank you — you have confirmed this Account Steward invitation.");
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
    <Section
      eyebrow="Account Steward"
      title={
        <>
          A letter of<br /><em>confirmation.</em>
        </>
      }
    >
      <Frame label="Account Steward invitation">
        <div className="km-prose" style={{ maxWidth: 640 }}>
          <p>
            {params.owner_name
              ? <>Thank you for agreeing to be <strong>{params.owner_name}'s</strong> Account Steward on Kinin.</>
              : "Thank you for agreeing to be an Account Steward on Kinin."}
          </p>
          <p>
            Kinin is an AI biographer where people share their stories,
            memories, and life experiences over time. An Account Steward is
            someone trusted to look after the record of a life if the account
            holder can no longer do so themselves.
          </p>
          <p>
            Confirming this invitation does <strong>not</strong> give you access
            to their biography yet. Stewardship activates only through a clear
            handoff from them, or through a verified request when the time comes.
            Until then, nothing changes on their account.
          </p>
        </div>

        {!hasInputs ? (
          <div style={{ marginTop: 18 }}>
            <Banner tone="danger">
              <span>
                This confirmation link is missing required parameters. Please use the full link from your email.
              </span>
            </Banner>
          </div>
        ) : null}

        {busy ? (
          <div className="km-row" style={{ marginTop: 18 }}>
            <Spinner /> <span className="km-mono-label">Confirming...</span>
          </div>
        ) : null}

        {statusText ? (
          <div style={{ marginTop: 18 }}>
            <Banner tone="info">{statusText}</Banner>
          </div>
        ) : null}
        {errorText ? (
          <div style={{ marginTop: 18 }}>
            <Banner tone="danger">{errorText}</Banner>
          </div>
        ) : null}
      </Frame>
    </Section>
  );
}
