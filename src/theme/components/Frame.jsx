export function Frame({ label, children, className = "", id }) {
  return (
    <div id={id} className={`km-frame ${className}`.trim()}>
      {label ? <div className="km-frame-label">{label}</div> : null}
      <span className="km-frame-corner tl" />
      <span className="km-frame-corner tr" />
      <span className="km-frame-corner bl" />
      <span className="km-frame-corner br" />
      {children}
    </div>
  );
}
