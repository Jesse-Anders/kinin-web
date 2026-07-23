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

// "My Account" — identity, sign-in/security, and the danger zone. Account
// Steward designation lives under Settings → Stewardship. Category settings
// (voice, reminders, biographies, interview) live on the Settings pages.
export default function MyAccountPage({
  profileSchema,
  bioProfile,
  setBioProfile,
  profileBusy,
  profileNotice,
  profileError,
  security,
  saveBioProfile,
  onOpenDangerZone,
  onClose,
}) {
  const showInitialLoader = profileBusy && !profileSchema;
  const selectedDobText = formatDateLong(bioProfile.date_of_birth);
  const derivedAge = deriveAgeFromDateOfBirth(bioProfile.date_of_birth);

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
