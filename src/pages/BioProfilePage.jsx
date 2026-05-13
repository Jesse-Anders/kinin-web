export default function BioProfilePage({
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
  onClose,
}) {
  const cadenceValue = String(continuitySettings?.reminder_cadence_weeks ?? 2);
  const showInitialLoader = profileBusy && !profileSchema;
  const executorStatus = accountExecutor?.status || "";
  const hasExecutorDetails = !!((accountExecutor?.name || "").trim() || (accountExecutor?.email || "").trim());
  const executorStatusLabel =
    executorStatus === "saved_not_invited"
      ? "Saved (not invited yet)"
      : executorStatus;
  const resendButtonLabel =
    executorStatus === "saved_not_invited" ? "Send invite" : "Resend invite";

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <b>Kinin Settings</b>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              {profileSchema?.title || "Settings"} (schema v{profileSchema?.version || "—"})
            </div>
          </div>
          <button onClick={onClose} disabled={profileBusy}>
            Close
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {profileNotice ? (
            <div style={{ background: "#e8f6ee", color: "#0a6a3b", padding: 10, borderRadius: 8 }}>
              {profileNotice}
            </div>
          ) : null}
          {showInitialLoader ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="loading-skeleton loading-skeleton-line" />
              <div className="loading-skeleton loading-skeleton-line short" />
              <div className="loading-skeleton loading-skeleton-line" />
            </div>
          ) : null}
          <div style={{ fontWeight: 600, fontSize: 14 }}>Profile</div>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Preferred name *</div>
            <input
              value={bioProfile.preferred_name}
              onChange={(e) => setBioProfile((p) => ({ ...p, preferred_name: e.target.value }))}
              disabled={profileBusy}
              style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
            />
          </label>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Age *</div>
            <input
              value={bioProfile.age}
              onChange={(e) => setBioProfile((p) => ({ ...p, age: e.target.value }))}
              disabled={profileBusy}
              style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
              inputMode="numeric"
            />
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              Your age helps Kinin place life events naturally on your timeline.
            </div>
          </label>
          <div
            style={{
              borderTop: "1px solid #eee",
              marginTop: 6,
              paddingTop: 10,
              display: "grid",
              gap: 10,
            }}
          >
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
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                How should Kinin remind me?
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="radio" checked readOnly disabled={profileBusy} />
                  <span>Email</span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.65 }}>
                  <input type="radio" disabled />
                  <span>Text (coming soon)</span>
                </label>
              </div>
            </div>
          </div>
          <div
            style={{
              borderTop: "1px solid #eee",
              marginTop: 6,
              paddingTop: 10,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>Account executor</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Optional but strongly encouraged. Add a family member or close friend who can be designated as your
              account executor.
            </div>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Executor name</div>
              <input
                value={accountExecutor?.name || ""}
                onChange={(e) => setAccountExecutor((p) => ({ ...p, name: e.target.value }))}
                disabled={profileBusy}
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Executor email</div>
              <input
                value={accountExecutor?.email || ""}
                onChange={(e) =>
                  setAccountExecutor((p) => ({
                    ...p,
                    email: e.target.value,
                  }))
                }
                disabled={profileBusy}
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                inputMode="email"
              />
            </label>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Confirm executor email</div>
              <input
                value={accountExecutor?.confirm_email || ""}
                onChange={(e) =>
                  setAccountExecutor((p) => ({
                    ...p,
                    confirm_email: e.target.value,
                  }))
                }
                disabled={profileBusy}
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                inputMode="email"
              />
            </label>
            {executorStatus ? (
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Status: <b>{executorStatusLabel}</b>
              </div>
            ) : null}
            {hasExecutorDetails ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={resendAccountExecutorInvite} disabled={profileBusy}>
                  {resendButtonLabel}
                </button>
                <button onClick={removeAccountExecutor} disabled={profileBusy}>
                  Remove executor
                </button>
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveProfile} disabled={profileBusy}>
              {profileBusy ? (
                <>
                  <span className="inline-spinner" aria-hidden="true" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </button>
            <button onClick={onClose} disabled={profileBusy}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
