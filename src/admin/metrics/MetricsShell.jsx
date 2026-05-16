import { Banner, Eyebrow } from "../../theme";
import { useMetrics } from "./MetricsContext";
import { RangePresetBar } from "./RangePresetBar";

// Wraps every metrics sub-page with the consistent header (back link, eyebrow,
// title, optional subtitle), the date-range bar, and the demo-mode/reveal
// controls. Keeps every dashboard visually anchored.
export function MetricsShell({
  eyebrow = "Admin · Metrics",
  title,
  subtitle,
  backLabel = "← Metrics index",
  onBack,
  rightSlot,
  children,
}) {
  const { demoMode, setDemoMode, revealEmails, setRevealEmails } = useMetrics();

  return (
    <div className="km-metrics-shell">
      {onBack ? (
        <button type="button" className="km-link-button km-metrics-shell-back" onClick={onBack}>
          {backLabel}
        </button>
      ) : null}

      <header className="km-metrics-shell-head">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="km-h1 km-metrics-shell-title">{title}</h2>
        {subtitle ? <p className="km-prose km-metrics-shell-subtitle">{subtitle}</p> : null}
      </header>

      <RangePresetBar
        rightSlot={
          <div className="km-metrics-shell-controls">
            <label className="km-metrics-toggle">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
              />
              <span>Demo mode</span>
            </label>
            <label className="km-metrics-toggle">
              <input
                type="checkbox"
                checked={revealEmails}
                onChange={(e) => setRevealEmails(e.target.checked)}
              />
              <span>Reveal emails</span>
            </label>
            {rightSlot}
          </div>
        }
      />

      {demoMode ? (
        <Banner tone="info">
          <span>
            <strong>Demo mode is on.</strong> Numbers are scaled and labels masked for
            screen-share. Toggle off in the controls above to see actuals.
          </span>
        </Banner>
      ) : null}

      <div className="km-metrics-shell-body">{children}</div>
    </div>
  );
}
