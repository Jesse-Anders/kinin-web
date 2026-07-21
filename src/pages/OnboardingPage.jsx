import { Banner, Button, Eyebrow, FormRow, Frame, Spinner, TextInput } from "../theme";

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

const ONBOARDING_TOTAL_STEPS = 3;

const STEP_META = {
  1: { eyebrow: "A welcome", title: <>Welcome to <em>Kinin.</em></> },
  2: { eyebrow: "A few details", title: <>Tell us a little<br /><em>about you.</em></> },
  3: { eyebrow: "Cadence", title: <>How often should<br />Kinin <em>nudge you?</em></> },
};

export default function OnboardingPage({
  onboardingStep,
  bioProfile,
  setBioProfile,
  continuitySettings,
  setContinuitySettings,
  busy,
  profileError,
  onBack,
  onContinue,
  onBegin,
  previewMode = false,
  beginLabel = "Complete setup",
}) {
  const step = Number(onboardingStep || 1);
  const cadenceValue = String(continuitySettings?.reminder_cadence_weeks ?? 2);
  const selectedDobText = formatDateLong(bioProfile.date_of_birth);
  const derivedAge = deriveAgeFromDateOfBirth(bioProfile.date_of_birth);

  const meta = STEP_META[step] || STEP_META[1];

  return (
    <div className="km-onboarding">
      <div className="km-onboarding-progress">
        <Eyebrow>{`${pad2(step)} / ${pad2(ONBOARDING_TOTAL_STEPS)} · onboarding`}</Eyebrow>
        <div className="km-progress" style={{ marginTop: 14, maxWidth: 360 }}>
          <div
            className="km-progress-bar"
            style={{ width: `${(step / ONBOARDING_TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {previewMode ? (
        <Banner tone="info">
          <span><strong>Preview mode.</strong> Changes here are not saved.</span>
        </Banner>
      ) : null}

      {profileError ? (
        <div style={{ marginTop: 16 }}>
          <Banner tone="danger">
            <span><strong>Something went wrong.</strong> {profileError}</span>
          </Banner>
        </div>
      ) : null}

      <h2 className="km-h2" style={{ marginTop: 24 }}>{meta.title}</h2>

      <Frame label={`Step ${pad2(step)} of ${pad2(ONBOARDING_TOTAL_STEPS)}`}>
        {step === 1 ? (
          <div className="km-prose" style={{ maxWidth: 640 }}>
            <p>
              Kinin helps you tell the story of your life, one conversation at
              a time.
            </p>
            <p>
              Your memories, experiences, and reflections come together as a
              living, interactive biography — one your family and friends can
              engage with conversationally to better understand your story,
              your memories, and the moments that mattered most.
            </p>
            <p>
              Before we begin, we'll ask a few quick questions to personalize
              your experience and help Kinin support you over time.
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="km-form-grid">
            <FormRow
              label="Preferred name"
              required
              help="This is how Kinin will address you in conversation."
            >
              <TextInput
                value={bioProfile.preferred_name}
                onChange={(e) => setBioProfile((p) => ({ ...p, preferred_name: e.target.value }))}
                disabled={busy}
                placeholder="Enter your preferred name"
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
                disabled={busy}
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
        ) : null}

        {step === 3 ? (
          <>
            <div className="km-prose" style={{ maxWidth: 640, marginBottom: 24 }}>
              <p>
                Life gets busy. Kinin can remind you to return when it
                has been a while since your last conversation.
              </p>
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
                      name="onboarding-reminder-cadence-weeks"
                      value={opt.value}
                      checked={cadenceValue === opt.value}
                      onChange={(e) =>
                        setContinuitySettings((prev) => ({
                          ...prev,
                          reminder_cadence_weeks: Number(e.target.value),
                        }))
                      }
                      disabled={busy}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <div className="km-mono-label" style={{ marginBottom: 10 }}>
                How should Kinin remind me?
              </div>
              <div className="km-radio-list">
                <label className="km-radio">
                  <input type="radio" checked readOnly disabled={busy} />
                  <span>Email</span>
                </label>
                <label className="km-radio km-radio-disabled">
                  <input type="radio" disabled />
                  <span>
                    Text message <span className="km-muted">— coming soon</span>
                  </span>
                </label>
              </div>
            </div>
            <div className="km-form-help" style={{ marginTop: 20 }}>
              You can update these settings at any time.
            </div>
          </>
        ) : null}
      </Frame>

      <div className="km-form-actions km-form-actions-between">
        <Button onClick={onBack} disabled={busy || step === 1}>
          Back
        </Button>
        <div className="km-row">
          {step < ONBOARDING_TOTAL_STEPS ? (
            <Button variant="primary" onClick={onContinue} disabled={busy}>
              {step === 1 ? "Let's begin" : "Continue"}
            </Button>
          ) : (
            <Button variant="primary" onClick={onBegin} disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Completing...
                </>
              ) : (
                beginLabel
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
