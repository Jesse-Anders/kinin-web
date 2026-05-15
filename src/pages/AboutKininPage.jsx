import { ChatRow, Frame, Section } from "../theme";

const SAMPLE_CONVERSATION = [
  {
    role: "assistant",
    content:
      "What's motivating you to tell your story now? Is there something specific that made you think — it's time?",
  },
  {
    role: "user",
    content:
      "I've been thinking about it for a while. My kids are getting older and I realized they don't really know much about my life before them. I want them to have something real — not just photos, but the actual stories.",
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
    <div>
      <Section
        eyebrow="About Kinin"
        title={
          <>
            A living biography,
            <br />
            <em>in your own voice.</em>
          </>
        }
      >
        <div className="km-prose" style={{ maxWidth: 720 }}>
          <p>
            <strong>Kinin</strong> is an AI-powered biographical interviewer
            that helps you capture your life story through guided, one-on-one
            conversation. It asks thoughtful questions, listens carefully, and
            follows your lead — building a rich, personal narrative session by
            session, at whatever pace feels right.
          </p>
          <p>
            The goal is simple: to help you preserve the stories, memories,
            and reflections that make you who you are — so the people who
            matter most can know you more deeply, now and for generations to
            come.
          </p>
        </div>
      </Section>

      <Section meta="01 / Interview" eyebrow="How it works" title="The interview, plainly.">
        <div className="km-prose" style={{ maxWidth: 720 }}>
          <p>
            Kinin guides you through a thoughtfully designed journey covering
            the breadth and depth of a life — from your earliest memories and
            family origins through school years, relationships, career,
            turning points, and the beliefs that shape how you see the world.
          </p>
          <p>
            But you're never locked into a script. Kinin is happy to follow
            wherever the conversation goes. If a question sparks a memory you
            want to explore, go for it. <strong>The interview adapts to you</strong> — not the
            other way around.
          </p>
          <p>
            Each session picks up where you left off. There's no rush, no
            deadline. Some people share for ten minutes, others for an hour.
            Your biography grows naturally, over time.
          </p>
        </div>
      </Section>

      <Section
        meta="02 / Sample"
        eyebrow="A conversation, in motion"
        title={
          <>
            What a session<br /><em>looks like.</em>
          </>
        }
      >
        <Frame label="Fig. 01 — Sample exchange">
          <div className="km-chat">
            {SAMPLE_CONVERSATION.map((m, i) => (
              <ChatRow key={i} role={m.role}>
                {m.content}
              </ChatRow>
            ))}
          </div>
        </Frame>
      </Section>

      <Section
        meta="03 / Outcome"
        eyebrow="What you'll have"
        title={
          <>
            The interactive<br /><em>living biography.</em>
          </>
        }
      >
        <div className="km-prose" style={{ maxWidth: 720 }}>
          <p>
            The interview is just the beginning. Everything you share is being
            shaped into something we call an <strong>interactive living biography</strong> —
            a rich, navigable portrait of your life that goes far beyond a
            traditional book or document.
          </p>
          <p>
            Imagine your family being able to explore your life story by
            theme, by era, or by relationship. They could read about your
            childhood summers, hear about the moment you knew what you wanted
            to do with your life, or discover a side of you they never thought
            to ask about.
          </p>
          <p>
            And because it's <em>living</em>, your biography grows with you. New
            sessions add new chapters. Revisit a topic to add depth. Your
            story is never finished — it evolves as you do.
          </p>
        </div>
      </Section>

      <Section
        meta="04 / Privacy"
        eyebrow="Your story is yours"
        title={
          <>
            Privacy isn't a feature.<br /><em>It's a promise.</em>
          </>
        }
      >
        <div className="km-prose" style={{ maxWidth: 720 }}>
          <p>
            Kinin will never sell, share, or provide your personal data to
            third parties. Your conversations are never used to train AI
            models. You can delete your account and all associated data at any
            time.
          </p>
        </div>
      </Section>
    </div>
  );
}
