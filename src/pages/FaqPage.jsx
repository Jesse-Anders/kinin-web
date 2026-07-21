import { FaqList, Section } from "../theme";
import faqData from "../data/faq.json";

// The FAQ content GENERATED from the canonical Kinin help content in the
// kinin-lambda repo (src/kinin/data/kinin_help_content.json) via
// scripts/gen_faq_from_kb.py, so the public FAQ and the in-app "Kinin Help"
// agent can never drift apart. Do not hand-edit ../data/faq.json — edit the
// canonical file and regenerate.
// Full guide: kinin-lambda/docs/help-content.md

function renderAnswer(item, { navigateToPage }) {
  const link = item.link;
  if (!link || !link.page || !link.label) return item.a;
  // Some answers reference an in-app destination; turn that reference into a
  // real navigation button while keeping the surrounding copy intact.
  const [before, after] = String(item.a).split(link.label);
  const linkButton = (
    <button
      type="button"
      className="km-link-button"
      style={{ fontSize: "inherit", padding: 0, verticalAlign: "baseline" }}
      onClick={() => navigateToPage?.(link.page)}
    >
      {link.label}
    </button>
  );
  if (after === undefined) {
    // Label wasn't found inline; append the link as a trailing action.
    return (
      <>
        {item.a} {linkButton}
      </>
    );
  }
  return (
    <>
      {before}
      {linkButton}
      {after}
    </>
  );
}

export default function FaqPage({ navigateToPage }) {
  const items = (faqData.items || []).map((item) => ({
    q: item.q,
    a: renderAnswer(item, { navigateToPage }),
  }));

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
