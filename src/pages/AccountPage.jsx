const ACCOUNT_CONFIRM_PHRASE = "delete my account and all data";

export default function AccountPage({
  isAuthed,
  accountUsername,
  accountPassword,
  setAccountPassword,
  accountConfirmText,
  setAccountConfirmText,
  accountBusy,
  accountStatus,
  accountError,
  closeAccount,
}) {
  const confirmMatches =
    accountConfirmText.trim().toLowerCase() === ACCOUNT_CONFIRM_PHRASE;

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>My Account</div>
      <div
        style={{
          border: "1px solid #f5c2c7",
          background: "#fff5f5",
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Delete account and all data</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          This permanently deletes your account, Cognito auth user, S3 archive objects, and data from:
          ConversationTurns, UserState, UserStepState, kinin-user-idempotency,
          kinin-user-lifecycle-crm, kinin-user-entitlement-records, and user_relationships.
          (kinin-email-send-log-dev is intentionally not purged.) This action cannot be undone.
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Cognito username</div>
          <input
            value={accountUsername}
            readOnly
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10, opacity: 0.7 }}
            placeholder="username"
          />
        </label>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Password</div>
          <input
            type="password"
            value={accountPassword}
            onChange={(e) => setAccountPassword(e.target.value)}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
            placeholder="Your password"
            disabled={accountBusy}
            autoComplete="current-password"
          />
        </label>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Type &ldquo;{ACCOUNT_CONFIRM_PHRASE}&rdquo; to confirm
          </div>
          <input
            value={accountConfirmText}
            onChange={(e) => setAccountConfirmText(e.target.value)}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
            placeholder={ACCOUNT_CONFIRM_PHRASE}
            disabled={accountBusy}
          />
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={closeAccount}
            disabled={
              accountBusy || !confirmMatches || !isAuthed || !accountUsername || !accountPassword
            }
          >
            {accountBusy ? "Deleting..." : "Delete My Account"}
          </button>
          {accountStatus ? <div style={{ opacity: 0.7 }}>{accountStatus}</div> : null}
        </div>
        {accountError ? <div style={{ color: "#b00020" }}>{accountError}</div> : null}
        {!isAuthed ? (
          <div style={{ opacity: 0.7, fontSize: 12 }}>Sign in to manage your account.</div>
        ) : null}
      </div>
    </div>
  );
}
