export function Field({ label, value }) {
  return (
    <div className="km-field">
      <div className="km-field-label">{label}</div>
      <div className="km-field-value">{value}</div>
    </div>
  );
}
