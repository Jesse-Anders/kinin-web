import { useState } from "react";
import { Banner, Button, FormRow, Frame, Section, Spinner, TextInput } from "../theme";

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
    <Section
      eyebrow="Admin · User purge"
      title={
        <>
          A <em>destructive</em><br />
          operation.
        </>
      }
    >
      <div className="km-admin-page">
        <div style={{ marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setActivePage("admin")}
            className="km-link-button"
          >
            ← Back to Admin Home
          </button>
        </div>

        <Frame label="What this does">
          <div className="km-prose" style={{ maxWidth: 720 }}>
            <p>
              <strong>Permanently deletes</strong> S3 archive objects and DynamoDB rows for:
              ConversationTurns, UserState, UserStepState, kinin-user-idempotency,
              kinin-user-lifecycle-crm, kinin-user-entitlement-records, user_relationships,
              and Zep memory.
            </p>
            <p>
              The Cognito auth user is <strong>not</strong> deleted by this
              action. Delete the auth user manually in Cognito if needed.
            </p>
          </div>
        </Frame>

        <div style={{ height: 24 }} />

        <Frame label="Run">
          <div className="km-form-grid">
            <FormRow label="Target user id (Cognito sub)">
              <TextInput
                value={targetUserId}
                onChange={(e) => {
                  setTargetUserId(e.target.value);
                  localStorage.setItem("admin_user_id", e.target.value);
                }}
                placeholder="target_user_id"
                disabled={busy || !isAuthed}
              />
            </FormRow>
            <FormRow label="Admin password">
              <TextInput
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Your current admin password"
                disabled={busy || !isAuthed}
                autoComplete="current-password"
              />
            </FormRow>
          </div>

          <div className="km-form-actions">
            <Button
              variant="danger"
              onClick={purgeUser}
              disabled={!isAuthed || busy || !targetUserId.trim() || !adminPassword.trim()}
            >
              {busy ? (
                <>
                  <Spinner /> Purging...
                </>
              ) : (
                "Purge user data"
              )}
            </Button>
          </div>
        </Frame>

        {error ? (
          <div style={{ marginTop: 20 }}>
            <Banner tone="danger">{error}</Banner>
          </div>
        ) : null}
        {result ? (
          <div style={{ marginTop: 20 }}>
            <pre className="km-pre">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
