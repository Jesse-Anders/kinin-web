export default function PrivacyPage() {
  return (
    <div style={{ padding: 16, maxWidth: 800 }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Privacy</div>

      <div style={{ display: "grid", gap: 12, lineHeight: 1.55 }}>
        <div>
          Kinin is built to protect personal stories, personal identity, and personal memory data.
          Our standard is simple and permanent: <b>we never share personal data with third parties</b>.
        </div>

        <div>
          We do not sell, rent, trade, broker, or otherwise disclose personal data to third-party
          companies, advertisers, data brokers, or affiliates.
        </div>

        <div>
          This is a lifetime product standard for Kinin. Personal data shared with Kinin remains
          protected within Kinin and is not shared with third parties.
        </div>

        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Questions about this standard can be sent to jesse@kinin.ai.
        </div>
      </div>
    </div>
  );
}
