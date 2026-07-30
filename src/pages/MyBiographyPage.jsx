import { Button, Frame, Section } from "../theme";

/**
 * Listener (and future steward-only / share-only) home for "your" biography.
 * Not a chat surface — invites upgrading to interview / resume storytelling.
 */
export default function MyBiographyPage({ onSubscribe }) {
  return (
    <Section
      eyebrow="My Biography"
      title={
        <>
          Your story,
          <br />
          <em>waiting for you.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 680, marginBottom: 28 }}>
        <p>
          On the free listener plan you can explore biographies others share
          with you. Your own living biography — interviewing with Kinin,
          journaling, and sharing with family — needs a Build Biography plan.
        </p>
        <p>
          If you already started during a trial or an earlier subscription,
          upgrading picks that work back up. If you haven&apos;t begun yet,
          subscribe to start telling your story with the Kinin biographer.
        </p>
      </div>

      <Frame label="Interview & share your story">
        <div className="km-prose" style={{ maxWidth: 620, marginBottom: 16 }}>
          <p style={{ margin: 0 }}>
            Build Biography plans are $11.99/month or $99/year.
          </p>
        </div>
        {typeof onSubscribe === "function" ? (
          <Button variant="primary" onClick={onSubscribe}>
            Upgrade on My Account →
          </Button>
        ) : null}
      </Frame>
    </Section>
  );
}
