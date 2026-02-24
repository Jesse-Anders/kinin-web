import { useState } from "react";

export default function AdminUserPurgePage({ isAuthed, getAccessToken, apiBase, setActivePage }) {
  const [targetUserId, setTargetUserId] = useState(() => localStorage.getItem("admin_user_id") || "");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function purgeUser() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const token = await getAccessToken();
      const trimmedUserId = (targetUserId || "").trim();
      const trimmedPassword = (adminPassword || "").trim();
      if (!trimmedUserId) throw new Error("target_user_id required");
      if (!trimmedPassword) throw new Error("admin password required");

      const res = await fetch(`${apiBase}/admin/purge_user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          target_user_id: trimmedUserId,
          password: trimmedPassword,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error ${res.status}: ${t}`);
      }
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      setResult(parsed);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setAdminPassword("");
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => setActivePage("admin")}
          style={{
            background: "transparent",
            border: "none",
            color: "#2563eb",
            cursor: "pointer",
            fontSize: 13,
            padding: 0,
            textDecoration: "underline",
          }}
        >
          &larr; Back to Admin Home
        </button>
      </div>

      <div
        style={{
          border: "1px solid #f5c2c7",
          background: "#fff5f5",
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Admin User Data Purge</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Permanently deletes S3 archive objects and DynamoDB rows for: ConversationTurns, UserState,
          UserStepState, kinin-user-idempotency, kinin-user-lifecycle-crm,
          kinin-user-entitlement-records, and user_relationships.
        </div>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
          Cognito auth user is <b>not</b> deleted by this action. Delete the auth user manually in Cognito.
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Target user id (Cognito sub)</div>
          <input
            value={targetUserId}
            onChange={(e) => {
              setTargetUserId(e.target.value);
              localStorage.setItem("admin_user_id", e.target.value);
            }}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
            placeholder="target_user_id"
            disabled={busy || !isAuthed}
          />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Admin password</div>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
            placeholder="Your current admin password"
            disabled={busy || !isAuthed}
            autoComplete="current-password"
          />
        </label>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={purgeUser} disabled={!isAuthed || busy || !targetUserId.trim() || !adminPassword.trim()}>
            {busy ? "Purging..." : "Purge User Data"}
          </button>
        </div>

        {error ? <div style={{ color: "#b00020" }}>{error}</div> : null}
        {result ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              margin: 0,
              background: "#fafafa",
              padding: 8,
              borderRadius: 6,
              border: "1px solid #eee",
              fontSize: 12,
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
