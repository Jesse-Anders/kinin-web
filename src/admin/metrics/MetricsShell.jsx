import { Banner, Eyebrow } from "../../theme";
import { useMetrics } from "./MetricsContext";
import { MetricsTabs } from "./MetricsTabs";
import { RangePresetBar } from "./RangePresetBar";

// Wraps every metrics sub-page with the consistent header (eyebrow, title,
// optional subtitle), the persistent sub-nav across all five dashboards,
// the date-range bar, and the demo-mode/reveal controls. Keeps every
// dashboard visually anchored.
export function MetricsShell({
  eyebrow = "Admin · Metrics",
  title,
  subtitle,
  activePageId,
  setActivePage,
  rightSlot,
  children,
}) {
  const { demoMode, setDemoMode, revealEmails, setRevealEmails } = useMetrics();

  return (
    <div className="km-metrics-shell">
      {setActivePage ? (
        <MetricsTabs activeId={activePageId} setActivePage={setActivePage} />
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
