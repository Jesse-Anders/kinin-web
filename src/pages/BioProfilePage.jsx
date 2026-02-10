export default function BioProfilePage({
  profileSchema,
  bioProfile,
  setBioProfile,
  profileBusy,
  saveProfile,
  onClose,
}) {
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
            <b>Biography Profile</b>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              {profileSchema?.title || "Profile"} (schema v{profileSchema?.version || "—"})
            </div>
          </div>
          <button onClick={onClose} disabled={profileBusy}>
            Close
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
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
