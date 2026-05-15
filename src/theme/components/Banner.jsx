export function Banner({ tone = "info", children, className = "" }) {
  return <div className={`km-banner km-banner-${tone} ${className}`}>{children}</div>;
}
