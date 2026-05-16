import { fmtDelta, percentChange } from "./format";
import { maybeObfuscateNumber } from "./demoMode";
import { Sparkline } from "./Sparkline";
import { useMetrics } from "./MetricsContext";

// Big-number KPI tile with eyebrow label, primary number, optional secondary
// caption, sparkline trend, and a ▲/▼ Δ chip vs the prior equal-length
// period. Designed to be dropped into a CSS grid.
export function KpiCard({
  eyebrow,
  value,
  caption,
  prior,
  format = (v) => String(v),
  formatDelta = "percent", // "percent" | "absolute" | "none"
  series,
  seriesKey = "y",
  sparkColor,
  invertDelta = false, // for metrics where "down" is good (e.g. cost)
  tone, // optional accent ("crimson" | "sage" | "butter")
  footer,
  isAuthed = true,
  isLoading = false,
}) {
  const { demoMode } = useMetrics();

  const displayValue = isLoading
    ? "…"
    : format(maybeObfuscateNumber(value, { demoMode, isCount: false }));

  let deltaPct = null;
  if (prior != null && Number.isFinite(Number(prior))) {
    deltaPct = percentChange(value, prior);
  }
  let deltaLabel = null;
  let deltaTone = "neutral";
  if (deltaPct != null && Number.isFinite(deltaPct)) {
    deltaLabel = fmtDelta(deltaPct);
    if (deltaPct > 0.5) deltaTone = invertDelta ? "down" : "up";
    else if (deltaPct < -0.5) deltaTone = invertDelta ? "up" : "down";
  }

  return (
    <div className={`km-kpi-card ${tone ? `tone-${tone}` : ""}`}>
      <div className="km-kpi-eyebrow">{eyebrow}</div>
      <div className="km-kpi-row">
        <div className="km-kpi-value">{displayValue}</div>
        {deltaLabel ? (
          <span className={`km-kpi-delta tone-${deltaTone}`}>
            <span aria-hidden="true">
              {deltaTone === "up" ? "▲" : deltaTone === "down" ? "▼" : "·"}
            </span>{" "}
            {deltaLabel}
          </span>
        ) : null}
      </div>
      {caption ? <div className="km-kpi-caption">{caption}</div> : null}
      {Array.isArray(series) && series.length > 1 ? (
        <Sparkline data={series} dataKey={seriesKey} color={sparkColor} height={32} />
      ) : (
        <div className="km-sparkline-placeholder" />
      )}
      {footer ? <div className="km-kpi-footer">{footer}</div> : null}
      {isAuthed ? null : <div className="km-kpi-disabled-overlay" aria-hidden="true" />}
    </div>
  );
}
