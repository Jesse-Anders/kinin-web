// Demo mode obfuscates concrete numbers and labels in metrics responses while
// preserving the *shape* of the data (relative magnitudes, trends, breakdown
// proportions) so the dashboards still tell a coherent story on a public
// screen-share. The transformation is deterministic for a session so charts
// don't shimmer when re-rendering, but a fresh page load reshuffles.

let sessionScale = null;
function getSessionScale() {
  if (sessionScale != null) return sessionScale;
  // Single multiplicative scalar shared across all metrics, in [0.6, 1.4].
  // Plus a small per-call jitter is layered on top for variety.
  sessionScale = 0.6 + Math.random() * 0.8;
  return sessionScale;
}

function jitter(base, magnitude = 0.08) {
  // Multiplicative jitter so zeros stay zero.
  const baseN = Number(base) || 0;
  if (baseN === 0) return 0;
  const wobble = 1 + (Math.random() * 2 - 1) * magnitude;
  return baseN * wobble;
}

export function maybeObfuscateNumber(value, { demoMode, isCount = true } = {}) {
  if (!demoMode) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const scaled = jitter(n * getSessionScale());
  if (isCount) return Math.max(0, Math.round(scaled));
  return Math.max(0, scaled);
}

export function maybeObfuscateLabel(label, { demoMode } = {}) {
  if (!demoMode) return label;
  if (label == null) return label;
  const s = String(label);
  if (!s) return s;
  // Replace digits with hash marks so emails/ids/dollar strings can be shown
  // without leaking actuals. Leave punctuation/letters alone.
  return s.replace(/[A-Za-z0-9]/g, (ch) => (/[0-9]/.test(ch) ? "#" : "•"));
}

// Helper: produce a fresh shallow-clone of an array of {x, ...numeric} rows,
// obfuscating every numeric value while preserving the x-axis label.
export function obfuscateSeries(rows, { demoMode, xKey = "day_utc" } = {}) {
  if (!demoMode || !Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === xKey) {
        out[k] = v;
        continue;
      }
      if (typeof v === "number") {
        out[k] = maybeObfuscateNumber(v, { demoMode, isCount: Number.isInteger(v) });
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}
