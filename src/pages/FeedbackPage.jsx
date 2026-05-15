import { Banner, Button, FormRow, Section, Spinner, TextArea, TextInput } from "../theme";

export default function FeedbackPage({
  feedbackName,
  setFeedbackName,
  feedbackEmail,
  setFeedbackEmail,
  feedbackMessage,
  setFeedbackMessage,
  feedbackBusy,
  feedbackStatus,
  submitFeedback,
}) {
  const isError = feedbackStatus && /error|failed|invalid|missing/i.test(feedbackStatus);
  return (
    <Section
      eyebrow="Feedback"
      title={
        <>
          Tell us<br /><em>what's working.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 640, marginBottom: 32 }}>
        <p>
          What's helping, what's confusing, what's missing — we read every
          message. Anonymous is fine; if you'd like a response, leave your
          name and email.
        </p>
      </div>

      <div className="km-form-grid">
        <FormRow label="Name" help="Optional.">
          <TextInput
            value={feedbackName}
            onChange={(e) => setFeedbackName(e.target.value)}
            placeholder="Your name"
          />
        </FormRow>
        <FormRow label="Email" help="Optional. Only used to reply.">
          <TextInput
            value={feedbackEmail}
            onChange={(e) => setFeedbackEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
          />
        </FormRow>
        <FormRow label="Message" required>
          <TextArea
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            placeholder="What should we improve?"
            rows={6}
          />
        </FormRow>
      </div>

      <div className="km-form-actions">
        <Button variant="primary" onClick={submitFeedback} disabled={feedbackBusy}>
          {feedbackBusy ? (
            <>
              <Spinner /> Sending...
            </>
          ) : (
            "Send feedback"
          )}
        </Button>
      </div>

      {feedbackStatus ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone={isError ? "danger" : "info"}>{feedbackStatus}</Banner>
        </div>
      ) : null}
    </Section>
  );
}
