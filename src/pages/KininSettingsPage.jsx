import { Banner, Button, FormRow, Frame, Section, Skeleton, Spinner, TextInput } from "../theme";
import InterviewDetailsPanel from "../components/InterviewDetailsPanel";

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

export default function KininSettingsPage({
  profileSchema,
  bioProfile,
  setBioProfile,
  continuitySettings,
  setContinuitySettings,
  accountExecutor,
  setAccountExecutor,
  profileBusy,
  profileNotice,
  saveProfile,
  resendAccountExecutorInvite,
  removeAccountExecutor,
  onOpenDangerZone,
  onClose,
  interviewDetails,
}) {
  const cadenceValue = String(continuitySettings?.reminder_cadence_weeks ?? 2);
  const showInitialLoader = profileBusy && !profileSchema;
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
  const selectedDobText = formatDateLong(bioProfile.date_of_birth);
  const derivedAge = deriveAgeFromDateOfBirth(bioProfile.date_of_birth);

  return (
    <Section
      eyebrow="Kinin Settings"
      title={
        <>
          Your <em>preferences</em>,
          <br />plainly stated.
        </>
      }
    >
      <div className="km-mono-label" style={{ marginBottom: 24 }}>
        {profileSchema?.title || "Settings"} · schema v{profileSchema?.version || "—"}
      </div>

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
        </Frame>

        <Frame label="Reminder rhythm">
          <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
            <p>Choose how long you can go absent before Kinin gets back in touch.</p>
          </div>
          <div>
            <div className="km-mono-label" style={{ marginBottom: 10 }}>
              Remind me when I haven't talked with Kinin for
            </div>
            <div className="km-radio-list">
              {[
                { value: "1", label: "1 week" },
                { value: "2", label: "2 weeks" },
                { value: "3", label: "3 weeks" },
                { value: "4", label: "4 weeks" },
                { value: "0", label: "Never" },
              ].map((opt) => (
                <label key={opt.value} className="km-radio">
                  <input
                    type="radio"
                    name="reminder-cadence-weeks"
                    value={opt.value}
                    checked={cadenceValue === opt.value}
                    onChange={(e) =>
                      setContinuitySettings((prev) => ({
                        ...prev,
                        reminder_cadence_weeks: Number(e.target.value),
                      }))
                    }
                    disabled={profileBusy}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <div className="km-mono-label" style={{ marginBottom: 10 }}>
              How should Kinin remind me?
            </div>
            <div className="km-radio-list">
              <label className="km-radio">
                <input type="radio" checked readOnly disabled={profileBusy} />
                <span>Email</span>
              </label>
              <label className="km-radio km-radio-disabled">
                <input type="radio" disabled />
                <span>Text <span className="km-muted">— coming soon</span></span>
              </label>
            </div>
          </div>
        </Frame>

        <Frame label="Account executor">
          <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
            <p>
              Optional but strongly encouraged. Add a family member or close
              friend who can be designated as your account executor.
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

          {hasExecutorDetails ? (
            <div className="km-row" style={{ marginTop: 18 }}>
              <Button onClick={resendAccountExecutorInvite} disabled={profileBusy}>
                {resendButtonLabel}
              </Button>
              <Button onClick={removeAccountExecutor} disabled={profileBusy}>
                Remove executor
              </Button>
            </div>
          ) : null}
        </Frame>

        {interviewDetails ? (
          <Frame label="Interview details">
            <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
              <p>
                A behind-the-scenes look at your current interview session —
                journey progress, current step, topic labels, and other context
                Kinin is tracking for you.
              </p>
            </div>
            <InterviewDetailsPanel {...interviewDetails} />
          </Frame>
        ) : null}

        <Frame label="Danger zone">
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
          Cancel
        </Button>
        <Button variant="primary" onClick={saveProfile} disabled={profileBusy}>
          {profileBusy ? (
            <>
              <Spinner /> Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </Section>
  );
}
