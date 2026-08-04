import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmResetPassword, resetPassword, signInWithRedirect } from "aws-amplify/auth";
import {
  Banner,
  Button,
  FormRow,
  Frame,
  Section,
  Spinner,
  TextInput,
} from "../theme";

function parseResetParams() {
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

// Mirrors the Cognito v3 pool password policy (min 8, upper, lower, number,
// symbol). Kept client-side so users get instant feedback before submitting.
function passwordProblems(pw) {
  const value = String(pw || "");
  const problems = [];
  if (value.length < 8) problems.push("at least 8 characters");
  if (!/[A-Z]/.test(value)) problems.push("an uppercase letter");
  if (!/[a-z]/.test(value)) problems.push("a lowercase letter");
  if (!/[0-9]/.test(value)) problems.push("a number");
  if (!/[^A-Za-z0-9]/.test(value)) problems.push("a symbol");
  return problems;
}

function classifyError(err) {
  const name = String(err?.name || "");
  const message = String(err?.message || err || "");
  const lower = message.toLowerCase();
  if (name === "CodeMismatchException" || /invalid verification code/i.test(lower)) {
    return "code_mismatch";
  }
  if (name === "ExpiredCodeException" || /expired/i.test(lower)) {
    return "code_expired";
  }
  if (name === "LimitExceededException" || /attempt limit exceeded/i.test(lower)) {
    return "rate_limited";
  }
  if (name === "InvalidPasswordException" || /password did not conform|password not long enough/i.test(lower)) {
    return "weak_password";
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
    case "weak_password":
      return "That password doesn't meet the requirements. Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and a symbol.";
    case "user_not_found":
      return "We couldn't find an account for that email. Check the address, or email Jesse@kinin.ai for help.";
    default:
      return raw || "Something went wrong. Please try again or send a new code.";
  }
}

export default function ResetPasswordPage() {
  const initial = useMemo(() => parseResetParams(), []);
  const [email, setEmail] = useState(initial.email);
  const [code, setCode] = useState(initial.code);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [signinBusy, setSigninBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [resentNotice, setResentNotice] = useState("");
  const [errorText, setErrorText] = useState("");
  const autoSentRef = useRef(false);

  const pwProblems = passwordProblems(password);
  const pwMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    !!email && !!code && pwProblems.length === 0 && !pwMismatch && !busy;

  const doResend = useCallback(async (emailValue, { silent = false } = {}) => {
    const emailNorm = (emailValue || "").trim().toLowerCase();
    if (!emailNorm) {
      if (!silent) setErrorText("Enter your email address so we know where to send the code.");
      return;
    }
    setResendBusy(true);
    setErrorText("");
    setResentNotice("");
    try {
      await resetPassword({ username: emailNorm });
      setResentNotice(
        `A fresh code is on its way to ${emailNorm}. Check your inbox (and spam folder).`,
      );
    } catch (e) {
      setErrorText(errorBannerText(classifyError(e), e?.message || String(e)));
    } finally {
      setResendBusy(false);
    }
  }, []);

  // If the user landed here with an email but no code (e.g. they clicked an
  // old link, or typed the URL), proactively send them a code once.
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!initial.email || initial.code) return;
    autoSentRef.current = true;
    void doResend(initial.email, { silent: true });
  }, [initial.email, initial.code, doResend]);

  async function doConfirm(e) {
    if (e) e.preventDefault();
    const emailNorm = (email || "").trim().toLowerCase();
    const codeNorm = (code || "").trim();
    if (!emailNorm || !codeNorm) {
      setErrorText("Enter both your email and the code from your email.");
      return;
    }
    if (pwProblems.length > 0) {
      setErrorText(`Your new password needs ${pwProblems.join(", ")}.`);
      return;
    }
    if (password !== confirmPassword) {
      setErrorText("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setErrorText("");
    setResentNotice("");
    try {
      await confirmResetPassword({
        username: emailNorm,
        confirmationCode: codeNorm,
        newPassword: password,
      });
      setDone(true);
    } catch (err) {
      setErrorText(errorBannerText(classifyError(err), err?.message || String(err)));
    } finally {
      setBusy(false);
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

  if (done) {
    return (
      <Section
        eyebrow="Account security"
        title={
          <>
            Your password is<br /><em>set.</em>
          </>
        }
      >
        <Frame label="All set">
          <div className="km-prose" style={{ maxWidth: 560 }}>
            <p>
              Thanks{email ? <> — <strong>{email}</strong></> : null} is ready to go.
              Sign in with your new password and everything you've shared with Kinin
              will be right where you left it.
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
      eyebrow="Account security"
      title={
        <>
          Set your new<br /><em>password.</em>
        </>
      }
    >
      <Frame label="Password reset">
        <div className="km-prose" style={{ maxWidth: 560 }}>
          <p>
            We've upgraded the way you sign in to Kinin. Set a new password below to
            finish — your stories, biography, and interview progress are all safe and
            waiting for you. If you arrived here from the link in your email, your code
            is already filled in.
          </p>
        </div>

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
          onSubmit={doConfirm}
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
          <FormRow label="Code from your email" required>
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
          <FormRow label="New password" required>
            <TextInput
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder="Choose a strong password"
            />
          </FormRow>
          <FormRow label="Confirm new password" required>
            <TextInput
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
              placeholder="Re-enter your password"
            />
          </FormRow>
          <label
            className="km-row"
            style={{ gap: 8, alignItems: "center", cursor: "pointer", fontSize: 14, color: "#555" }}
          >
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              disabled={busy}
            />
            Show password
          </label>

          <div className="km-prose" style={{ maxWidth: 420, fontSize: 13, color: "#666" }}>
            {password.length > 0 && pwProblems.length > 0 ? (
              <p style={{ margin: 0 }}>Still needs {pwProblems.join(", ")}.</p>
            ) : (
              <p style={{ margin: 0 }}>
                Use at least 8 characters with an uppercase letter, a lowercase letter,
                a number, and a symbol.
              </p>
            )}
            {pwMismatch ? (
              <p style={{ margin: "4px 0 0", color: "#b00" }}>The two passwords don't match.</p>
            ) : null}
          </div>

          <div className="km-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {busy ? (
                <><Spinner /> Setting password...</>
              ) : (
                "Set new password"
              )}
            </Button>
            <Button
              type="button"
              onClick={() => { void doResend(email); }}
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
          <p style={{ margin: 0, color: "#666" }}>
            Need help? Email <a href="mailto:Jesse@kinin.ai">Jesse@kinin.ai</a>.
          </p>
        </div>
      </Frame>
    </Section>
  );
}
