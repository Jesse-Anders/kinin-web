import { Banner, Button, FormRow, Frame, Section, Skeleton, TextInput } from "../theme";
import AccountSecuritySection from "./AccountSecuritySection";

function deriveAgeFromDateOfBirth(dateOfBirth) {
  const text = String(dateOfBirth || "").trim();
  if (!text) return null;
  const dob = new Date(`${text}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) years -= 1;
  if (years < 0 || years > 120) return null;
  return years;
}

function formatDateLong(dateOfBirth) {
  const text = String(dateOfBirth || "").trim();
  if (!text) return "";
  const dt = new Date(`${text}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(dt);
}

// "My Account" — identity, sign-in/security, trusted contact, and the danger
// zone. Category settings (voice, reminders, biographies, interview) live on the
// separate Settings pages. Each section saves on its own so a partial save
// never clobbers another section.
export default function MyAccountPage({
  profileSchema,
  bioProfile,
  setBioProfile,
  accountExecutor,
  setAccountExecutor,
  profileBusy,
  profileNotice,
  profileError,
  security,
  saveBioProfile,
  saveAccountExecutor,
  resendAccountExecutorInvite,
  removeAccountExecutor,
  interviewSealed = false,
  executorStatus,
  onOpenStewardship,
  onOpenDangerZone,
  onClose,
}) {
  const showInitialLoader = profileBusy && !profileSchema;
  const selectedDobText = formatDateLong(bioProfile.date_of_birth);
  const derivedAge = deriveAgeFromDateOfBirth(bioProfile.date_of_birth);

  const executorStatus = accountExecutor?.status || "";
  const executorStatusNorm = String(executorStatus).trim().toLowerCase();
  const hasInviteBeenSent =
    !!accountExecutor?.last_invite_sent_at ||
    executorStatusNorm === "pending" ||
    executorStatusNorm === "confirmed";
  const hasExecutorDetails = !!((accountExecutor?.name || "").trim() || (accountExecutor?.email || "").trim());
  const hasExistingExecutor =
    !!((accountExecutor?.name || "").trim() && (accountExecutor?.email || "").trim()) &&
    (hasInviteBeenSent || !!executorStatusNorm || !!accountExecutor?.confirmed_at);
  const executorEmailNorm = (accountExecutor?.email || "").trim().toLowerCase();
  const executorConfirmEmailNorm = (accountExecutor?.confirm_email || "").trim().toLowerCase();
  const showExecutorEmailMismatch =
    !!executorEmailNorm && !!executorConfirmEmailNorm && executorEmailNorm !== executorConfirmEmailNorm;
  let executorStatusLabel = "";
  if (executorStatusNorm === "confirmed" || !!accountExecutor?.confirmed_at) {
    executorStatusLabel = "Confirmed";
  } else if (executorStatusNorm === "saved_not_invited") {
    executorStatusLabel = "Saved (not invited yet)";
  } else if (hasInviteBeenSent) {
    executorStatusLabel = "Invite sent (awaiting confirmation)";
  } else if (executorStatus) {
    executorStatusLabel = executorStatus;
  }
  const resendButtonLabel = hasInviteBeenSent ? "Resend invite" : "Send invite";

  return (
    <Section
      eyebrow="My Account"
      title={
        <>
          Your <em>account</em>,
          <br />in one place.
        </>
      }
    >
      {profileError ? (
        <div style={{ marginBottom: 20 }}>
          <Banner tone="danger">
            <span><strong>Something went wrong.</strong> {profileError}</span>
          </Banner>
        </div>
      ) : null}

      {profileNotice ? (
        <div style={{ marginBottom: 20 }}>
          <Banner tone="info">{profileNotice}</Banner>
        </div>
      ) : null}

      {showInitialLoader ? (
        <div style={{ display: "grid", gap: 10, maxWidth: 480, marginBottom: 24 }}>
          <Skeleton />
          <Skeleton short />
          <Skeleton />
        </div>
      ) : null}

      <div className="km-stack" style={{ gap: 32 }}>
        <Frame label="Profile">
          <div className="km-form-grid">
            <FormRow label="Preferred name" required>
              <TextInput
                value={bioProfile.preferred_name}
                onChange={(e) => setBioProfile((p) => ({ ...p, preferred_name: e.target.value }))}
                disabled={profileBusy}
              />
            </FormRow>
            <FormRow
              label="Date of birth"
              required
              help="Use the calendar picker to avoid day/month ordering mistakes. Kinin derives your current age from this date."
            >
              <TextInput
                type="date"
                value={bioProfile.date_of_birth}
                onChange={(e) => setBioProfile((p) => ({ ...p, date_of_birth: e.target.value }))}
                disabled={profileBusy}
                max={new Date().toISOString().slice(0, 10)}
              />
              {selectedDobText ? (
                <div className="km-form-help" style={{ fontStyle: "normal" }}>
                  Selected date: <strong>{selectedDobText}</strong>
                  {derivedAge !== null ? (
                    <>
                      {" "}· Current age: <strong>{derivedAge}</strong>
                    </>
                  ) : null}
                </div>
              ) : null}
            </FormRow>
          </div>
          <div style={{ marginTop: 20 }}>
            <Button variant="primary" onClick={() => saveBioProfile()} disabled={profileBusy}>
              {profileBusy ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </Frame>

        {security ? <AccountSecuritySection {...security} /> : null}

        <Frame label="Trusted contact">
          <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
            <p>
              Optional but strongly encouraged. Name a family member or close
              friend who can steward your biography if you can no longer
              maintain it. Confirming the invite does not give them access yet —
              stewardship begins only if you hand the biography off, or through
              a verified request later.
            </p>
          </div>
          <div className="km-form-grid">
            <FormRow label="Executor name">
              <TextInput
                value={accountExecutor?.name || ""}
                onChange={(e) => setAccountExecutor((p) => ({ ...p, name: e.target.value }))}
                disabled={profileBusy}
              />
            </FormRow>
            <FormRow label="Executor email">
              <TextInput
                value={accountExecutor?.email || ""}
                onChange={(e) => setAccountExecutor((p) => ({ ...p, email: e.target.value }))}
                disabled={profileBusy}
                inputMode="email"
              />
            </FormRow>
            <FormRow
              label="Confirm executor email"
              error={showExecutorEmailMismatch ? "Email addresses do not match." : ""}
            >
              <TextInput
                value={accountExecutor?.confirm_email || ""}
                onChange={(e) => setAccountExecutor((p) => ({ ...p, confirm_email: e.target.value }))}
                disabled={profileBusy}
                inputMode="email"
              />
            </FormRow>
          </div>

          {hasExistingExecutor ? (
            <div className="km-form-help" style={{ fontStyle: "normal", marginTop: 18 }}>
              Existing executor on file: <strong>{accountExecutor.name}</strong> ({accountExecutor.email})
            </div>
          ) : null}
          {executorStatusLabel ? (
            <div className="km-form-help" style={{ fontStyle: "normal", marginTop: 4 }}>
              Status: <strong>{executorStatusLabel}</strong>
            </div>
          ) : null}

          <div className="km-row" style={{ marginTop: 18 }}>
            <Button
              variant="primary"
              onClick={() => saveAccountExecutor({ sendInvite: false })}
              disabled={profileBusy || interviewSealed}
            >
              Save contact
            </Button>
            {hasExecutorDetails ? (
              <>
                <Button onClick={resendAccountExecutorInvite} disabled={profileBusy || interviewSealed}>
                  {resendButtonLabel}
                </Button>
                <Button onClick={removeAccountExecutor} disabled={profileBusy || interviewSealed}>
                  Remove contact
                </Button>
              </>
            ) : null}
          </div>
          {interviewSealed ? (
            <div className="km-form-help" style={{ fontStyle: "normal", marginTop: 14 }}>
              This biography is stewarded and sealed. Manage family access from Stewardship.
            </div>
          ) : null}
          {hasExecutorDetails && (executorStatus === "confirmed" || accountExecutor?.status === "confirmed") && !interviewSealed ? (
            <div className="km-row" style={{ marginTop: 14 }}>
              <Button onClick={onOpenStewardship} disabled={profileBusy}>
                Hand off / stewardship
              </Button>
            </div>
          ) : null}
        </Frame>

        <Frame label="Danger zone / Delete account">
          <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
            <p>
              Need to walk away? You can permanently delete your account and
              all associated data — conversations, profile, archive, the lot.
              This action cannot be undone.
            </p>
          </div>
          {onOpenDangerZone ? (
            <Button onClick={onOpenDangerZone}>
              Go to the danger zone →
            </Button>
          ) : null}
        </Frame>
      </div>

      <div className="km-form-actions">
        <Button onClick={onClose} disabled={profileBusy}>
          Done
        </Button>
      </div>
    </Section>
  );
}
