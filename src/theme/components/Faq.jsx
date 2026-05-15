export function FaqList({ items, className = "" }) {
  return (
    <div className={`km-faq-list ${className}`}>
      {items.map((item, idx) => (
        <details key={idx} className="km-faq-row">
          <summary>
            <span className="km-faq-marker">+</span>
            <span>{item.q}</span>
          </summary>
          <div className="km-faq-answer">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
