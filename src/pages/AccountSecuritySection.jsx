import { Banner, Button, FormRow, Frame, TextInput } from "../theme";

// Sign-in & security controls: current email display, change-email (with code
// confirmation), and change-password. All backed by Cognito self-service APIs
// in App.jsx. Federated (e.g. Google) users can't change either here — the
// identity provider owns those — so we show an explanatory note instead.
export default function AccountSecuritySection({
  email,
  isFederatedUser,
  emailForm,
  setEmailForm,
  emailStage,
  emailBusy,
  emailError,
  emailNotice,
  requestEmailChange,
  confirmEmailChange,
  resendEmailChangeCode,
  cancelEmailChange,
  passwordForm,
  setPasswordForm,
  passwordBusy,
  passwordError,
  passwordNotice,
  changePassword,
}) {
  return (
    <Frame label="Sign-in & security">
      <div className="km-form-grid" style={{ gap: 20 }}>
        <FormRow label="Current email">
          <div style={{ fontWeight: 600 }}>{email || "—"}</div>
        </FormRow>

        {isFederatedUser ? (
          <Banner tone="info">
            <span>
              Your sign-in is managed by your identity provider (e.g. Google).
              Change your email or password with that provider.
            </span>
          </Banner>
        ) : (
          <>
            {/* --- Change email --- */}
            {emailStage === "confirm" ? (
              <>
                {emailNotice ? <Banner tone="info">{emailNotice}</Banner> : null}
                {emailError ? (
                  <Banner tone="danger">
                    <span><strong>Error.</strong> {emailError}</span>
                  </Banner>
                ) : null}
                <FormRow
                  label="Verification code"
                  help="Enter the code we emailed to your new address."
                >
                  <TextInput
                    value={emailForm.code}
                    onChange={(e) =>
                      setEmailForm((f) => ({ ...f, code: e.target.value }))
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    disabled={emailBusy}
                  />
                </FormRow>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button
                    variant="primary"
                    onClick={() => confirmEmailChange()}
                    disabled={emailBusy}
                  >
                    {emailBusy ? "Confirming…" : "Confirm new email"}
                  </Button>
                  <Button onClick={() => resendEmailChangeCode()} disabled={emailBusy}>
                    Resend code
                  </Button>
                  <Button onClick={() => cancelEmailChange()} disabled={emailBusy}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                {emailNotice ? <Banner tone="info">{emailNotice}</Banner> : null}
                {emailError ? (
                  <Banner tone="danger">
                    <span><strong>Error.</strong> {emailError}</span>
                  </Banner>
                ) : null}
                <FormRow
                  label="New email"
                  help="We'll send a verification code to the new address before switching."
                >
                  <TextInput
                    type="email"
                    value={emailForm.newEmail}
                    onChange={(e) =>
                      setEmailForm((f) => ({ ...f, newEmail: e.target.value }))
                    }
                    autoComplete="email"
                    disabled={emailBusy}
                  />
                </FormRow>
                <div>
                  <Button
                    variant="primary"
                    onClick={() => requestEmailChange()}
                    disabled={emailBusy}
                  >
                    {emailBusy ? "Sending…" : "Change email"}
                  </Button>
                </div>
              </>
            )}

            {/* --- Change password --- */}
            <div
              style={{
                borderTop: "1px solid var(--km-border, rgba(0,0,0,0.1))",
                paddingTop: 16,
                marginTop: 4,
              }}
            />
            {passwordNotice ? (
              <Banner tone="info">{passwordNotice}</Banner>
            ) : null}
            {passwordError ? (
              <Banner tone="danger">
                <span><strong>Error.</strong> {passwordError}</span>
              </Banner>
            ) : null}
            <FormRow label="Current password">
              <TextInput
                type="password"
                value={passwordForm.current}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, current: e.target.value }))
                }
                autoComplete="current-password"
                disabled={passwordBusy}
              />
            </FormRow>
            <FormRow
              label="New password"
              help="At least 8 characters, with an uppercase and lowercase letter, a number, and a symbol."
            >
              <TextInput
                type="password"
                value={passwordForm.next}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, next: e.target.value }))
                }
                autoComplete="new-password"
                disabled={passwordBusy}
              />
            </FormRow>
            <FormRow label="Confirm new password">
              <TextInput
                type="password"
                value={passwordForm.confirm}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, confirm: e.target.value }))
                }
                autoComplete="new-password"
                disabled={passwordBusy}
              />
            </FormRow>
            <div>
              <Button
                variant="primary"
                onClick={() => changePassword()}
                disabled={passwordBusy}
              >
                {passwordBusy ? "Updating…" : "Update password"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Frame>
  );
}
