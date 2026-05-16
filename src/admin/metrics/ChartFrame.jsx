import { useRef } from "react";
import { Download } from "lucide-react";
import { exportNodeToPng, sanitizeForFilename } from "./exportPng";

// Card wrapper used by every dashboard chart. Mirrors the "Frame" aesthetic
// from the rest of the Memoirist UI (corner markers, mono eyebrow, serif
// title) but is fully self-contained so a PNG export of the node renders
// without inheriting page chrome.

export function ChartFrame({
  eyebrow,
  title,
  description,
  footer,
  exportName,
  noExport = false,
  className = "",
  style,
  children,
}) {
  const containerRef = useRef(null);

  async function handleExport() {
    if (!containerRef.current) return;
    const name = `kinin-metric-${sanitizeForFilename(exportName || title || "chart")}.png`;
    await exportNodeToPng(containerRef.current, { filename: name });
  }

  return (
    <div
      ref={containerRef}
      className={`km-chart-frame ${className}`}
      style={style}
    >
      <div className="km-chart-frame-header">
        <div className="km-chart-frame-header-text">
          {eyebrow ? <div className="km-chart-frame-eyebrow">{eyebrow}</div> : null}
          {title ? <div className="km-chart-frame-title">{title}</div> : null}
          {description ? (
            <div className="km-chart-frame-description">{description}</div>
          ) : null}
        </div>
        {noExport ? null : (
          <button
            type="button"
            className="km-chart-frame-export"
            onClick={handleExport}
            title="Save as PNG"
            aria-label="Save as PNG"
            data-png-exclude=""
          >
            <Download size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
      <div className="km-chart-frame-body">{children}</div>
      {footer ? <div className="km-chart-frame-footer">{footer}</div> : null}
    </div>
  );
}
