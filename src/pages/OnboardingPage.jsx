export default function OnboardingPage({
  onboardingStep,
  bioProfile,
  setBioProfile,
  continuitySettings,
  setContinuitySettings,
  busy,
  onBack,
  onContinue,
  onBegin,
  previewMode = false,
  beginLabel = "Begin",
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
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{`Onboarding ${step}/3`}</div>
          {previewMode ? (
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
              Preview mode: changes here are not saved.
            </div>
          ) : null}
          {step === 1 ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 8 }}>Welcome to Kinin</div>
              <div style={{ opacity: 0.85, lineHeight: 1.45 }}>
                This quick onboarding helps personalize your experience before you begin.
              </div>
            </div>
          ) : null}
          {step === 2 ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Onboarding 2</div>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Preferred name *</div>
                <input
                  value={bioProfile.preferred_name}
                  onChange={(e) => setBioProfile((p) => ({ ...p, preferred_name: e.target.value }))}
                  disabled={busy}
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                />
              </label>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Age *</div>
                <input
                  value={bioProfile.age}
                  onChange={(e) => setBioProfile((p) => ({ ...p, age: e.target.value }))}
                  disabled={busy}
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                  inputMode="numeric"
                />
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                  Your age helps Kinin place life events naturally on your timeline.
                </div>
              </label>
            </div>
          ) : null}
          {step === 3 ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Onboarding 3</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Continuity settings</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                The user is choosing how Kinin stays gently present in their life.
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
                    <span>Text (coming soon)</span>
                  </label>
                </div>
              </div>
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
          {step < 3 ? (
            <button onClick={onContinue} disabled={busy}>
              {busy ? (
                <>
                  <span className="inline-spinner" aria-hidden="true" />
                  Continuing...
                </>
              ) : (
                "Continue"
              )}
            </button>
          ) : (
            <button onClick={onBegin} disabled={busy}>
              {busy ? (
                <>
                  <span className="inline-spinner" aria-hidden="true" />
                  Beginning...
                </>
              ) : (
                beginLabel
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
