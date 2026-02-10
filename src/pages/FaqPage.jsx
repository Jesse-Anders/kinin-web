const FAQ_ITEMS = [
  {
    q: "What is Kinin?",
    a: "Kinin is an AI-powered biographical interviewer that helps you capture your life story through guided conversation. It walks you through meaningful topics — from early memories to beliefs and legacy — and preserves your words in a living, interactive biography.",
  },
  {
    q: "How does the interview process work?",
    a: "Kinin guides you through a series of life-story topics one question at a time. You can follow the guided journey or go off-script whenever you want — Kinin is happy to follow your lead. Each session picks up where you left off, so you can work at your own pace across as many sessions as you like.",
  },
  {
    q: "Who can see my data?",
    a: "Only you and the Kinin team (for support and service improvement). We do not and never will share, sell, or provide your personal data to third parties. Your story is yours.",
  },
  {
    q: "Does Kinin sell my information to advertisers or data brokers?",
    a: "No. Absolutely not. Kinin will never sell, license, or share your personal information with advertisers, data brokers, or any third party. This is a core principle of our company, not just a policy — it is a promise.",
  },
  {
    q: "Is my data used to train AI models?",
    a: "No. Your interview content is never used to train, fine-tune, or improve any AI model — ours or anyone else's. Your conversations are stored solely to build your biography and improve the Kinin service experience.",
  },
  {
    q: "How is my data stored and protected?",
    a: "All data is encrypted in transit and at rest using industry-standard AWS infrastructure. Access is tightly restricted to authenticated services that need it to deliver your experience. We follow security best practices and continuously review our safeguards.",
  },
  {
    q: "Can I delete my data?",
    a: "Yes. You can request full deletion of your account and all associated data at any time by contacting us through the Feedback form or at our support email. We will honor every deletion request promptly.",
  },
  {
    q: "What is a Bio Profile?",
    a: "Your Bio Profile stores basic context — like your preferred name and age — so Kinin can address you naturally and tailor the interview. It is optional, and you can update it anytime from the sidebar menu.",
  },
  {
    q: "Can I edit or remove something I said in the interview?",
    a: "We are actively building a feature that will let you review, edit, and delete individual conversation turns. It is your biography and your story to shape as you see fit — including removing anything you no longer want on record.",
  },
  {
    q: "How do I give feedback or report an issue?",
    a: "Use the Feedback link in the sidebar menu. You can submit feedback anonymously or include your name and email if you'd like a response. We read every submission and use your input to improve Kinin.",
  },
];

export default function FaqPage() {
  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>
        Frequently Asked Questions
      </div>

      {FAQ_ITEMS.map((item, idx) => (
        <details
          key={idx}
          style={{
            marginBottom: 8,
            borderBottom: "1px solid #e5e7eb",
            paddingBottom: 8,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 15,
              padding: "8px 0",
              listStyle: "revert",
            }}
          >
            {item.q}
          </summary>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "#333",
              padding: "4px 0 8px 18px",
            }}
          >
            {item.a}
          </div>
        </details>
      ))}
    </div>
  );
}
