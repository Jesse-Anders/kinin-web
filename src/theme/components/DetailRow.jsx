export function DetailRow({ label, value }) {
  return (
    <div className="km-detail-row">
      <div className="km-mono-label km-detail-label">{label}</div>
      <div className="km-detail-value">{value}</div>
    </div>
  );
}
