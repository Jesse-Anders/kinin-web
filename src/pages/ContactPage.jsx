export default function ContactPage({
  contactName,
  setContactName,
  contactEmail,
  setContactEmail,
  contactMessage,
  setContactMessage,
  contactBusy,
  contactStatus,
  submitContact,
}) {
  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
        Contact Kinin
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Name (optional)</div>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
            placeholder="Your name"
          />
        </label>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Email *</div>
          <input
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
            placeholder="you@example.com"
            inputMode="email"
          />
        </label>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Message *</div>
          <textarea
            value={contactMessage}
            onChange={(e) => setContactMessage(e.target.value)}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10, minHeight: 120 }}
            placeholder="How can we help?"
          />
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={submitContact} disabled={contactBusy}>
            {contactBusy ? "Sending..." : "Send Message"}
          </button>
          {contactStatus ? <div style={{ opacity: 0.7 }}>{contactStatus}</div> : null}
        </div>
      </div>
      <div style={{ minHeight: 12 }} />
    </div>
  );
}
