export default function OnboardingPage({
  onboardingStep,
  bioProfile,
  setBioProfile,
  accountExecutor,
  setAccountExecutor,
  continuitySettings,
  setContinuitySettings,
  busy,
  onBack,
  onContinue,
  onBegin,
  onSkip,
  previewMode = false,
  beginLabel = "Complete setup",
}) {
  const step = Number(onboardingStep || 1);
  const cadenceValue = String(continuitySettings?.reminder_cadence_weeks ?? 2);

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 16,
          maxWidth: 760,
          margin: "0 auto",
          minHeight: 380,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{`Onboarding ${step}/4`}</div>
          {previewMode ? (
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
              Preview mode: changes here are not saved.
            </div>
          ) : null}
          {step === 1 ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 8 }}>Welcome to Kinin</div>
              <div style={{ opacity: 0.85, lineHeight: 1.45 }}>
                Kinin helps you tell the story of your life, one conversation at a time.
              </div>
              <div style={{ opacity: 0.85, lineHeight: 1.45, marginTop: 8 }}>
                Your memories, experiences, and reflections come together as a living, interactive biography&mdash;one
                your family and friends can engage with conversationally to better understand your story, your
                memories, and the moments that mattered most.
              </div>
              <div style={{ opacity: 0.85, lineHeight: 1.45, marginTop: 8 }}>
                Before we begin, we&apos;ll ask a few quick questions to personalize your experience and help Kinin
                support you over time.
              </div>
            </div>
          ) : null}
          {step === 2 ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Tell us a little about you</div>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Preferred name *</div>
                <input
                  value={bioProfile.preferred_name}
                  onChange={(e) => setBioProfile((p) => ({ ...p, preferred_name: e.target.value }))}
                  disabled={busy}
                  placeholder="Enter your preferred name"
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                />
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                  This is how Kinin will address you in conversation.
                </div>
              </label>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Age *</div>
                <input
                  value={bioProfile.age}
                  onChange={(e) => setBioProfile((p) => ({ ...p, age: e.target.value }))}
                  disabled={busy}
                  placeholder="Enter your age"
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                  inputMode="numeric"
                />
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                  Your age helps Kinin better understand the chapters of your life and ask questions that fit your
                  experience.
                </div>
              </label>
            </div>
          ) : null}
          {step === 3 ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Choose a trusted contact</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Kinin is designed to preserve your story for the people who matter most.
              </div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Add someone you trust who may be given access to your Kinin account or biography in the future,
                according to your account settings.
              </div>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Trusted contact name</div>
                <input
                  value={accountExecutor?.name || ""}
                  onChange={(e) => setAccountExecutor((p) => ({ ...p, name: e.target.value }))}
                  disabled={busy}
                  placeholder="Enter their full name"
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                />
              </label>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Trusted contact email</div>
                <input
                  value={accountExecutor?.email || ""}
                  onChange={(e) => setAccountExecutor((p) => ({ ...p, email: e.target.value }))}
                  disabled={busy}
                  placeholder="Enter their email address"
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                  inputMode="email"
                />
              </label>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Confirm trusted contact email</div>
                <input
                  value={accountExecutor?.confirm_email || ""}
                  onChange={(e) => setAccountExecutor((p) => ({ ...p, confirm_email: e.target.value }))}
                  disabled={busy}
                  placeholder="Re-enter their email address"
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                  inputMode="email"
                />
              </label>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                We will send an an email for this person to accept the invite to your Kinin account and to verify their email. You can add, review or change your trusted contact in the settings as well.
              </div>
            </div>
          ) : null}
          {step === 4 ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Choose your reminder rhythm</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Life gets busy. Kinin can gently remind you to return when it has been a while since your last
                conversation.
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                  Remind me when I haven&apos;t talked with Kinin for:
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {[
                    { value: "1", label: "1 week" },
                    { value: "2", label: "2 weeks" },
                    { value: "3", label: "3 weeks" },
                    { value: "4", label: "4 weeks" },
                    { value: "0", label: "Never" },
                  ].map((opt) => (
                    <label key={opt.value} style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
              <div>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                  How should Kinin remind me?
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="radio" checked readOnly disabled={busy} />
                    <span>Email</span>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.65 }}>
                    <input type="radio" disabled />
                    <span>Text message — coming soon</span>
                  </label>
                </div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>You can update these settings at any time.</div>
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between" }}>
          <button onClick={onBack} disabled={busy || step === 1}>
            {busy ? (
              <>
                <span className="inline-spinner" aria-hidden="true" />
                Back
              </>
            ) : (
              "Back"
            )}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step === 3 ? (
              <button
                type="button"
                onClick={onSkip}
                disabled={busy}
                style={{ background: "transparent", border: "none", textDecoration: "underline", opacity: 0.85 }}
              >
                Skip for now
              </button>
            ) : null}
            {step < 4 ? (
              <button onClick={onContinue} disabled={busy}>
                {step === 1 ? "Let's begin" : "Continue"}
              </button>
            ) : (
              <button onClick={onBegin} disabled={busy}>
                {busy ? (
                  <>
                    <span className="inline-spinner" aria-hidden="true" />
                    Completing...
                  </>
                ) : (
                  beginLabel
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
