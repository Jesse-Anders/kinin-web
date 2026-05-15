import { Banner, Button, FormRow, Frame, Section, Spinner, TextInput } from "../theme";

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
    <Section
      eyebrow="My account"
      title={
        <>
          The <em>danger</em>
          <br />
          zone.
        </>
      }
    >
      <Frame label="Delete account &amp; all data">
        <div className="km-prose" style={{ maxWidth: 640, marginBottom: 22 }}>
          <p>
            This <strong>permanently</strong> deletes your account, your
            authentication user, your S3 archive objects, and your data from
            our application stores — conversation turns, user state, journey
            state, idempotency records, lifecycle CRM, entitlement records,
            relationships, and memory.
          </p>
          <p>
            <em>This action cannot be undone.</em>
          </p>
        </div>

        <div className="km-form-grid">
          <FormRow label="Username">
            <TextInput value={accountUsername} readOnly placeholder="username" />
          </FormRow>
          <FormRow label="Password">
            <TextInput
              type="password"
              value={accountPassword}
              onChange={(e) => setAccountPassword(e.target.value)}
              placeholder="Your password"
              disabled={accountBusy}
              autoComplete="current-password"
            />
          </FormRow>
          <FormRow
            label={`Type "${ACCOUNT_CONFIRM_PHRASE}" to confirm`}
            help="A small friction by design. Take a breath."
          >
            <TextInput
              value={accountConfirmText}
              onChange={(e) => setAccountConfirmText(e.target.value)}
              placeholder={ACCOUNT_CONFIRM_PHRASE}
              disabled={accountBusy}
            />
          </FormRow>
        </div>

        <div className="km-form-actions">
          <Button
            variant="danger"
            onClick={closeAccount}
            disabled={
              accountBusy || !confirmMatches || !isAuthed || !accountUsername || !accountPassword
            }
          >
            {accountBusy ? (
              <>
                <Spinner /> Deleting...
              </>
            ) : (
              "Delete my account"
            )}
          </Button>
        </div>
      </Frame>

      {accountStatus ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="info">{accountStatus}</Banner>
        </div>
      ) : null}
      {accountError ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="danger">{accountError}</Banner>
        </div>
      ) : null}
      {!isAuthed ? (
        <div className="km-form-help" style={{ marginTop: 20 }}>
          Sign in to manage your account.
        </div>
      ) : null}
    </Section>
  );
}
