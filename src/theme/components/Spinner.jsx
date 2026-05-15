export function Spinner({ size = "sm" }) {
  return (
    <span
      className={`km-spinner ${size === "lg" ? "km-spinner-lg" : ""}`}
      aria-hidden="true"
    />
  );
}

export function FullscreenLoader({ children }) {
  return (
    <div className="km-fullscreen-loader" role="status" aria-live="polite">
      <div className="km-fullscreen-loader-card">
        <Spinner size="lg" />
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ short = false }) {
  return (
    <div className={`km-skeleton km-skeleton-line ${short ? "short" : ""}`} />
  );
}
