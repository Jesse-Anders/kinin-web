import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmSignUp, resendSignUpCode, signInWithRedirect } from "aws-amplify/auth";
import {
  Banner,
  Button,
  FormRow,
  Frame,
  Section,
  Spinner,
  TextInput,
} from "../theme";

function parseConfirmParams() {
  const search = new URLSearchParams(window.location.search || "");
  const hash = String(window.location.hash || "");
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const hashParams = new URLSearchParams(hashQuery);
  const fromEither = (key) =>
    (search.get(key) || hashParams.get(key) || "").trim();
  return {
    email: fromEither("email").toLowerCase(),
    code: fromEither("code"),
  };
}

function classifyError(err) {
  const name = String(err?.name || "");
  const message = String(err?.message || err || "");
  const lower = message.toLowerCase();
  if (
    name === "NotAuthorizedException" &&
    /current status is confirmed/i.test(message)
  ) {
    return "already_confirmed";
  }
  if (/already confirmed/i.test(lower)) return "already_confirmed";
  if (name === "CodeMismatchException" || /invalid verification code/i.test(lower)) {
    return "code_mismatch";
  }
  if (name === "ExpiredCodeException" || /expired/i.test(lower)) {
    return "code_expired";
  }
  if (name === "LimitExceededException" || /attempt limit exceeded/i.test(lower)) {
    return "rate_limited";
  }
  if (name === "UserNotFoundException" || /user.*not.*found/i.test(lower)) {
    return "user_not_found";
  }
  return "unknown";
}

function errorBannerText(kind, raw) {
  switch (kind) {
    case "code_mismatch":
      return "That code didn't match. Double-check the code in your email, or send a new one below.";
    case "code_expired":
      return "That code has expired. Send a fresh code below and try again.";
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "user_not_found":
      return "We couldn't find an account for that email. Try signing up again from the sign-in page.";
    case "already_confirmed":
      return null; // handled as a success-style state
    default:
      return raw || "Something went wrong. Please try again or send a new code.";
  }
}

export default function ConfirmEmailPage() {
  const initial = useMemo(() => parseConfirmParams(), []);
  const [email, setEmail] = useState(initial.email);
  const [code, setCode] = useState(initial.code);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [signinBusy, setSigninBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [resentNotice, setResentNotice] = useState("");
  const [errorText, setErrorText] = useState("");
  const autoRanRef = useRef(false);

  const doConfirm = useCallback(async (emailValue, codeValue) => {
    const emailNorm = (emailValue || "").trim().toLowerCase();
    const codeNorm = (codeValue || "").trim();
    if (!emailNorm || !codeNorm) {
      setErrorText("Enter both your email and the verification code.");
      return;
    }
    setBusy(true);
    setErrorText("");
    setResentNotice("");
    try {
      await confirmSignUp({
        username: emailNorm,
        confirmationCode: codeNorm,
      });
      setConfirmed(true);
    } catch (e) {
      const kind = classifyError(e);
      if (kind === "already_confirmed") {
        setConfirmed(true);
        return;
      }
      setErrorText(errorBannerText(kind, e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }, []);

  // Auto-submit when both email and code arrived via the magic link.
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!initial.email || !initial.code) return;
    autoRanRef.current = true;
    void doConfirm(initial.email, initial.code);
  }, [initial.email, initial.code, doConfirm]);

  async function doResend() {
    const emailNorm = (email || "").trim().toLowerCase();
    if (!emailNorm) {
      setErrorText("Enter your email address so we know where to send the code.");
      return;
    }
    setResendBusy(true);
    setErrorText("");
    setResentNotice("");
    try {
      await resendSignUpCode({ username: emailNorm });
      setResentNotice(
        `A fresh verification code is on its way to ${emailNorm}. Check your inbox (and spam folder).`,
      );
    } catch (e) {
      const kind = classifyError(e);
      if (kind === "already_confirmed") {
        setConfirmed(true);
        return;
      }
      setErrorText(errorBannerText(kind, e?.message || String(e)));
    } finally {
      setResendBusy(false);
    }
  }

  async function doGoSignIn() {
    setSigninBusy(true);
    try {
      await signInWithRedirect();
    } catch (e) {
      setSigninBusy(false);
      setErrorText(e?.message || String(e));
    }
  }

  function onSubmitConfirmForm(e) {
    e.preventDefault();
    void doConfirm(email, code);
  }

  if (confirmed) {
    return (
      <Section
        eyebrow="Email verification"
        title={
          <>
            Your email is<br /><em>confirmed.</em>
          </>
        }
      >
        <Frame label="All set">
          <div className="km-prose" style={{ maxWidth: 560 }}>
            <p>
              Thanks for confirming{email ? <> <strong>{email}</strong></> : null}.
              You can sign in now to start your first interview.
            </p>
          </div>
          <div className="km-row" style={{ marginTop: 18 }}>
            <Button
              variant="primary"
              onClick={() => { void doGoSignIn(); }}
              disabled={signinBusy}
            >
              {signinBusy ? (
                <><Spinner /> Redirecting...</>
              ) : (
                "Go to sign in"
              )}
            </Button>
          </div>
        </Frame>
      </Section>
    );
  }

  return (
    <Section
      eyebrow="Email verification"
      title={
        <>
          Confirm your<br /><em>email.</em>
        </>
      }
    >
      <Frame label="Verification">
        <div className="km-prose" style={{ maxWidth: 560 }}>
          <p>
            Enter the 6-digit code we emailed you to finish setting up your Kinin
            account. If you arrived here from the link in that email, this happens
            automatically.
          </p>
        </div>

        {busy ? (
          <div className="km-row" style={{ marginTop: 18 }}>
            <Spinner /> <span className="km-mono-label">Confirming your email...</span>
          </div>
        ) : null}

        {errorText ? (
          <div style={{ marginTop: 18 }}>
            <Banner tone="danger">{errorText}</Banner>
          </div>
        ) : null}

        {resentNotice ? (
          <div style={{ marginTop: 18 }}>
            <Banner tone="info">{resentNotice}</Banner>
          </div>
        ) : null}

        <form
          onSubmit={onSubmitConfirmForm}
          style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}
        >
          <FormRow label="Email" required>
            <TextInput
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              placeholder="you@example.com"
            />
          </FormRow>
          <FormRow label="Verification code" required>
            <TextInput
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              placeholder="6-digit code"
              maxLength={10}
            />
          </FormRow>
          <div className="km-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !email || !code}
            >
              {busy ? (
                <><Spinner /> Confirming...</>
              ) : (
                "Confirm email"
              )}
            </Button>
            <Button
              type="button"
              onClick={() => { void doResend(); }}
              disabled={resendBusy || !email}
            >
              {resendBusy ? (
                <><Spinner /> Sending...</>
              ) : (
                "Send a new code"
              )}
            </Button>
          </div>
        </form>

        <div className="km-prose" style={{ maxWidth: 560, marginTop: 22, fontSize: 14 }}>
          <p style={{ marginBottom: 6 }}>
            Already confirmed?{" "}
            <button
              type="button"
              onClick={() => { void doGoSignIn(); }}
              disabled={signinBusy}
              className="km-link-button"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "inherit",
                textDecoration: "underline",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              Go to sign in
            </button>.
          </p>
          <p style={{ margin: 0, color: "#666" }}>
            Need help? Email <a href="mailto:Jesse@kinin.ai">Jesse@kinin.ai</a>.
          </p>
        </div>
      </Frame>
    </Section>
  );
}
