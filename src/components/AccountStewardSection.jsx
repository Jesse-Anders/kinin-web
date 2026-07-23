import { Button, FormRow, Frame, TextInput } from "../theme";

/** Designate / manage the single Account Steward for the signed-in owner. */
export default function AccountStewardSection({
  accountExecutor,
  setAccountExecutor,
  profileBusy = false,
  interviewSealed = false,
  executorStatus = "",
  saveAccountExecutor,
  resendAccountExecutorInvite,
  removeAccountExecutor,
}) {
  const resolvedExecutorStatus = executorStatus || accountExecutor?.status || "";
  const executorStatusNorm = String(resolvedExecutorStatus).trim().toLowerCase();
  const stewardConfirmed =
    executorStatusNorm === "confirmed" || !!accountExecutor?.confirmed_at;
  const hasInviteBeenSent =
    !!accountExecutor?.last_invite_sent_at ||
    executorStatusNorm === "pending" ||
    stewardConfirmed;
  const hasExecutorDetails = !!((accountExecutor?.name || "").trim() || (accountExecutor?.email || "").trim());
  const stewardOnFile =
    !!((accountExecutor?.name || "").trim() && (accountExecutor?.email || "").trim()) &&
    (!!executorStatusNorm || hasInviteBeenSent || stewardConfirmed);
  const executorEmailNorm = (accountExecutor?.email || "").trim().toLowerCase();
  const executorConfirmEmailNorm = (accountExecutor?.confirm_email || "").trim().toLowerCase();
  const showExecutorEmailMismatch =
    !!executorEmailNorm && !!executorConfirmEmailNorm && executorEmailNorm !== executorConfirmEmailNorm;

  let executorStatusLabel = "";
  if (stewardConfirmed) {
    executorStatusLabel = "Confirmed";
  } else if (executorStatusNorm === "saved_not_invited") {
    executorStatusLabel = "Saved (not invited yet)";
  } else if (hasInviteBeenSent || executorStatusNorm === "pending") {
    executorStatusLabel = "Invite sent (awaiting confirmation)";
  } else if (resolvedExecutorStatus) {
    executorStatusLabel = resolvedExecutorStatus;
  }
  const resendButtonLabel = hasInviteBeenSent ? "Resend invite" : "Send invite";

  return (
    <Frame label="Your Account Steward">
      <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
        <p>
          Optional but strongly encouraged. Name one family member or close
          friend as your Account Steward — someone who can look after your
          biography if you can no longer maintain it. Confirming the invite
          does not give them access yet. Stewardship begins only if you hand
          the biography off, or through a verified request later.
        </p>
        <p>
          If you already steward other people’s biographies, those care
          responsibilities pass to your Account Steward when Stewardship of
          your account becomes active. They continue the same chain — there is
          no separate successor role.
        </p>
      </div>

      {stewardOnFile ? (
        <>
          <div className="km-prose" style={{ maxWidth: 560 }}>
            <p>
              <strong>Your Account Steward</strong>
              <br />
              {(accountExecutor?.name || "").trim() || "Named steward"}
              {(accountExecutor?.email || "").trim()
                ? ` · ${(accountExecutor.email || "").trim()}`
                : ""}
            </p>
            {executorStatusLabel ? (
              <p className="km-form-help" style={{ fontStyle: "normal", marginTop: 4 }}>
                Status: <strong>{executorStatusLabel}</strong>
              </p>
            ) : null}
            <p className="km-form-help" style={{ fontStyle: "normal", marginTop: 8 }}>
              Only one Account Steward can be named at a time. Remove this
              steward before naming someone else.
            </p>
          </div>
          <div className="km-row" style={{ marginTop: 18, flexWrap: "wrap", gap: 8 }}>
            {!stewardConfirmed && !interviewSealed ? (
              <Button
                variant="primary"
                onClick={resendAccountExecutorInvite}
                disabled={profileBusy}
              >
                {resendButtonLabel}
              </Button>
            ) : null}
            <Button onClick={removeAccountExecutor} disabled={profileBusy || interviewSealed}>
              Remove steward
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="km-form-grid">
            <FormRow label="Steward name">
              <TextInput
                value={accountExecutor?.name || ""}
                onChange={(e) => setAccountExecutor((p) => ({ ...p, name: e.target.value }))}
                disabled={profileBusy || interviewSealed}
              />
            </FormRow>
            <FormRow label="Steward email">
              <TextInput
                value={accountExecutor?.email || ""}
                onChange={(e) => setAccountExecutor((p) => ({ ...p, email: e.target.value }))}
                disabled={profileBusy || interviewSealed}
                inputMode="email"
              />
            </FormRow>
            <FormRow
              label="Confirm steward email"
              error={showExecutorEmailMismatch ? "Email addresses do not match." : ""}
            >
              <TextInput
                value={accountExecutor?.confirm_email || ""}
                onChange={(e) => setAccountExecutor((p) => ({ ...p, confirm_email: e.target.value }))}
                disabled={profileBusy || interviewSealed}
                inputMode="email"
              />
            </FormRow>
          </div>
          <div className="km-row" style={{ marginTop: 18, flexWrap: "wrap", gap: 8 }}>
            <Button
              variant="primary"
              onClick={() =>
                saveAccountExecutor({
                  sendInvite: true,
                  notice: "Account Steward saved and invitation email sent.",
                })
              }
              disabled={profileBusy || interviewSealed || !hasExecutorDetails}
            >
              Save and send invite
            </Button>
            <Button
              onClick={() => saveAccountExecutor({ sendInvite: false })}
              disabled={profileBusy || interviewSealed || !hasExecutorDetails}
            >
              Save without inviting
            </Button>
          </div>
        </>
      )}

      {interviewSealed ? (
        <div className="km-form-help" style={{ fontStyle: "normal", marginTop: 14 }}>
          Stewardship is active and this biography is sealed. Interview, Journal,
          Pins, and Review are permanently closed here. Your Account Steward can
          explore the biography and manage family access from their Stewardship
          settings.
        </div>
      ) : null}
    </Frame>
  );
}
