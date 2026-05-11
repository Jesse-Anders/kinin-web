export default function BioProfilePage({
  profileSchema,
  bioProfile,
  setBioProfile,
  continuitySettings,
  setContinuitySettings,
  profileBusy,
  saveProfile,
  onClose,
}) {
  const cadenceValue = String(continuitySettings?.reminder_cadence_weeks ?? 2);

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
            <div style={{ fontSize: 12, opacity: 0.8 }}>Age (optional)</div>
            <input
              value={bioProfile.age}
              onChange={(e) => setBioProfile((p) => ({ ...p, age: e.target.value }))}
              disabled={profileBusy}
              style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
              inputMode="numeric"
            />
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
              Set up how reminders from Kinin when you've been away for a while.
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
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveProfile} disabled={profileBusy}>
              {profileBusy ? "Saving..." : "Save"}
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
