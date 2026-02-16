const SAMPLE_CONVERSATION = [
  {
    role: "assistant",
    content:
      "What's motivating you to tell your story now? Is there something specific that made you think — it's time?",
  },
  {
    role: "user",
    content:
      "I guess I've been thinking about it for a while. My kids are getting older and I realized they don't really know much about my life before them. I want them to have something real — not just photos, but the actual stories.",
  },
  {
    role: "assistant",
    content:
      "That's a really meaningful reason. When you picture your kids reading this someday, is there a particular story or moment you hope they'll find — something that would help them understand who you were before you became their parent?",
  },
  {
    role: "user",
    content:
      "Yeah, actually. There's this summer I spent working on my uncle's ranch in Montana when I was 19. It completely changed the way I saw the world. I'd never been away from the city before that.",
  },
  {
    role: "assistant",
    content:
      "A whole summer on a ranch in Montana at 19 — that sounds like it could be a turning point. Can you set the scene for me? What did it look like when you first arrived? What hit you first — the landscape, the quiet, the smell of the air?",
  },
];

export default function AboutKininPage() {
  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 6 }}>About Kinin</div>
      <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 24 }}>
        Your story, preserved in your own words.
      </div>

      {/* ── What is Kinin ── */}
      <div style={{ marginBottom: 28, lineHeight: 1.7, fontSize: 15 }}>
        <p style={{ margin: "0 0 12px" }}>
          Kinin is an AI-powered biographical interviewer that helps you capture your life story
          through guided, one-on-one conversation. It asks thoughtful questions, listens carefully,
          and follows your lead — building a rich, personal narrative session by session, at whatever
          pace feels right to you.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          The goal is simple: to help you preserve the stories, memories, and reflections that make
          you who you are — so the people who matter most can know you more deeply, now and for
          generations to come.
        </p>
      </div>

      {/* ── The Interview ── */}
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>The Interview</div>
      <div style={{ marginBottom: 28, lineHeight: 1.7, fontSize: 15 }}>
        <p style={{ margin: "0 0 12px" }}>
          Kinin guides you through a thoughtfully designed journey covering the breadth and depth of
          a life — from your earliest memories and family origins through school years, relationships,
          career, turning points, and the beliefs that shape how you see the world.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          But you're never locked into a script. Kinin is happy to follow wherever the conversation
          goes. If a question sparks a memory you want to explore, go for it. The interview adapts
          to you — not the other way around.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          Each session picks up where you left off. There's no rush, no deadline. Some people share
          for ten minutes, others for an hour. Your biography grows naturally over time.
        </p>
      </div>

      {/* ── Sample Conversation ── */}
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
        What a conversation looks like
      </div>
      <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 14 }}>
        A real example of how Kinin draws out the stories that matter.
      </div>

      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          borderBottom: "1px solid #e5e7eb",
          padding: "20px 0",
          marginBottom: 28,
        }}
      >
        {SAMPLE_CONVERSATION.map((m, idx) => (
          <div
            key={idx}
            className={
              m.role === "user" ? "chat-row chat-row-user" : "chat-row chat-row-assistant"
            }
          >
            <div
              className={
                m.role === "user"
                  ? "chat-bubble chat-bubble-user"
                  : "chat-bubble chat-bubble-assistant"
              }
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      {/* ── The Interactive Living Biography ── */}
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
        The Interactive Living Biography
      </div>
      <div style={{ marginBottom: 28, lineHeight: 1.7, fontSize: 15 }}>
        <p style={{ margin: "0 0 12px" }}>
          The interview is just the beginning. Everything you share is being shaped into something
          we call an <b>interactive living biography</b> — a rich, navigable portrait of your life
          that goes far beyond a traditional book or document.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          Imagine your family being able to explore your life story by theme, by era, or by
          relationship. They could read about your childhood summers, hear about the moment you knew
          what you wanted to do with your life, or discover a side of you they never thought to ask
          about.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          And because it's <em>living</em>, your biography grows with you. New sessions add new
          chapters. Revisit a topic to add depth. Your story is never finished — it evolves as you
          do.
        </p>
      </div>

      {/* ── Privacy ── */}
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Your story is yours</div>
      <div style={{ marginBottom: 16, lineHeight: 1.7, fontSize: 15 }}>
        <p style={{ margin: "0 0 12px" }}>
          Kinin will never sell, share, or provide your personal data to third parties. Your
          conversations are never used to train AI models. You can delete your account and all
          associated data at any time. Privacy isn't a feature — it's a promise.
        </p>
      </div>
    </div>
  );
}
