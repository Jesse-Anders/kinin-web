import { Banner, Button, FormRow, Section, Spinner, TextArea, TextInput } from "../theme";

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
  const isError = contactStatus && /error|failed|invalid|missing/i.test(contactStatus);
  return (
    <Section
      eyebrow="Get in touch"
      title={
        <>
          Send us<br /><em>a note.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 640, marginBottom: 32 }}>
        <p>
          Questions about Kinin, the interview, your account, or what we're
          building? We read every message.
        </p>
      </div>

      <div className="km-form-grid">
        <FormRow label="Name" help="Optional. Use whatever name you'd like us to write back to.">
          <TextInput
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Your name"
          />
        </FormRow>
        <FormRow label="Email" required>
          <TextInput
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
          />
        </FormRow>
        <FormRow label="Message" required>
          <TextArea
            value={contactMessage}
            onChange={(e) => setContactMessage(e.target.value)}
            placeholder="How can we help?"
            rows={6}
          />
        </FormRow>
      </div>

      <div className="km-form-actions">
        <Button variant="primary" onClick={submitContact} disabled={contactBusy}>
          {contactBusy ? (
            <>
              <Spinner /> Sending...
            </>
          ) : (
            "Send Message"
          )}
        </Button>
      </div>

      {contactStatus ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone={isError ? "danger" : "info"}>{contactStatus}</Banner>
        </div>
      ) : null}
    </Section>
  );
}
