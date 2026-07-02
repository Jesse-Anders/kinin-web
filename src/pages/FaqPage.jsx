import { FaqList, Section } from "../theme";

const STATIC_FAQ_ITEMS = [
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
    a: "Yes. When logged in, click the \"My Account\" link in the sidebar menu and follow the instructions to permanently delete your account and all associated data. The process requires authentication and a confirmation step to protect against unauthorized deletion. You can do this at any time — your data is yours to keep or remove.",
  },
  {
    q: "What are Kinin Settings?",
    a: "Kinin Settings let you manage your preferred name, date of birth, and reminder rhythm settings — including how often Kinin should gently remind you if you have been away for a while. You can update these anytime from the sidebar menu.",
  },
  {
    q: "How do I give feedback or report an issue?",
    a: "Use the Feedback link in the sidebar menu. You can submit feedback anonymously or include your name and email if you'd like a response. We read every submission and use your input to improve Kinin.",
  },
];

function buildEditingItem({ isAuthed, onNavigate }) {
  const reviewLink = (
    <button
      type="button"
      className="km-link-button"
      style={{ fontSize: "inherit", padding: 0, verticalAlign: "baseline" }}
      onClick={() => onNavigate?.("review-chats")}
    >
      Review &amp; Edit page
    </button>
  );

  return {
    q: "Can I edit or remove something I said in the interview?",
    a: isAuthed ? (
      <>
        Yes — editing is now a fully operational feature. Open the {reviewLink}{" "}
        (also listed as <em>Review</em> in the sidebar menu) to search your past
        conversations by text or date and revise any of your own turns. Kinin's
        replies are kept intact as a faithful record of what was said. It is your
        biography and your story to shape as you see fit.
      </>
    ) : (
      <>
        Yes — editing is now a fully operational feature. Once you're signed in
        as an interviewee, open the <em>Review &amp; Edit</em> page (listed as{" "}
        <em>Review</em> in the sidebar menu) to search your past conversations by
        text or date and revise any of your own turns. Kinin's replies are kept
        intact as a faithful record of what was said. It is your biography and
        your story to shape as you see fit.
      </>
    ),
  };
}

export default function FaqPage({ isAuthed = false, navigateToPage }) {
  const editingItem = buildEditingItem({ isAuthed, onNavigate: navigateToPage });
  const items = [
    ...STATIC_FAQ_ITEMS.slice(0, 8),
    editingItem,
    ...STATIC_FAQ_ITEMS.slice(8),
  ];

  return (
    <Section
      eyebrow="Common questions"
      title={
        <>
          What people<br /><em>ask first.</em>
        </>
      }
    >
      <FaqList items={items} />
    </Section>
  );
}
