import { useMetrics } from "./MetricsContext";

const PRESETS = [
  { id: "last_7_days", label: "7d" },
  { id: "last_30_days", label: "30d" },
  { id: "last_90_days", label: "90d" },
  { id: "mtd", label: "MTD" },
  { id: "qtd", label: "QTD" },
  { id: "ytd", label: "YTD" },
];

// Sticky bar that lives at the top of every metrics dashboard. Updates the
// shared MetricsContext, so every chart and KPI re-fetches on its own when
// the range changes.
export function RangePresetBar({ rightSlot }) {
  const {
    preset,
    customStart,
    customEnd,
    setPreset,
    setCustomRange,
    range,
  } = useMetrics();

  return (
    <div className="km-range-bar">
      <div className="km-range-bar-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`km-range-bar-preset ${preset === p.id ? "is-active" : ""}`}
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`km-range-bar-preset ${preset === "custom" ? "is-active" : ""}`}
          onClick={() => setPreset("custom")}
        >
          Custom
        </button>
      </div>
      <div className="km-range-bar-custom">
        <label className="km-range-bar-field">
          <span>Start (UTC)</span>
          <input
            type="date"
            value={preset === "custom" ? customStart || range.start : range.start}
            onChange={(e) =>
              setCustomRange(e.target.value, preset === "custom" ? customEnd : range.end)
            }
          />
        </label>
        <label className="km-range-bar-field">
          <span>End (UTC)</span>
          <input
            type="date"
            value={preset === "custom" ? customEnd || range.end : range.end}
            onChange={(e) =>
              setCustomRange(
                preset === "custom" ? customStart : range.start,
                e.target.value,
              )
            }
          />
        </label>
      </div>
      {rightSlot ? <div className="km-range-bar-right">{rightSlot}</div> : null}
    </div>
  );
}
