export function DocHeader({ left, mark, right }) {
  return (
    <div className="km-doc-header">
      <div className="km-doc-left">{left}</div>
      <div className="km-doc-mark">{mark}</div>
      <div className="km-doc-right">{right}</div>
    </div>
  );
}
