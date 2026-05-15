import { Eyebrow } from "./Eyebrow";

export function Section({ meta, eyebrow, title, children, className = "" }) {
  return (
    <section className={`km-section ${className}`}>
      {meta ? <div className="km-section-meta">{meta}</div> : null}
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {title ? <h2 className="km-h2">{title}</h2> : null}
      {children}
    </section>
  );
}
