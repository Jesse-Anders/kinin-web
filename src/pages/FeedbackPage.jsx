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
  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
        Feedback: Please, let us know your thoughts.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Name (optional)</div>
          <input
            value={feedbackName}
            onChange={(e) => setFeedbackName(e.target.value)}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
            placeholder="Your name"
          />
        </label>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Email (optional)</div>
          <input
            value={feedbackEmail}
            onChange={(e) => setFeedbackEmail(e.target.value)}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
            placeholder="you@example.com"
            inputMode="email"
          />
        </label>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Message *</div>
          <textarea
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10, minHeight: 120 }}
            placeholder="What should we improve?"
          />
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={submitFeedback} disabled={feedbackBusy}>
            {feedbackBusy ? "Sending..." : "Send Feedback"}
          </button>
          {feedbackStatus ? <div style={{ opacity: 0.7 }}>{feedbackStatus}</div> : null}
        </div>
      </div>
      <div style={{ minHeight: 12 }} />
    </div>
  );
}
