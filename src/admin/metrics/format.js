// Shared formatting helpers used across the metrics dashboards. Kept tiny and
// dependency-free.

export function fmtInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtDelta(value, { digits = 1 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const fixed = n.toFixed(digits);
  if (n > 0) return `+${fixed}%`;
  return `${fixed}%`;
}

// Compact USD formatter. Big numbers collapse to k/M; small numbers keep cents.
export function fmtUsd(value, { compact = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0.00";
  const abs = Math.abs(n);
  if (compact && abs >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`;
  }
  if (compact && abs >= 1_000) {
    return `$${(n / 1_000).toFixed(2)}k`;
  }
  if (abs < 0.01 && abs !== 0) {
    return `$${n.toFixed(4)}`;
  }
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Render a token count compactly (4.2k, 1.8M, 320).
export function fmtTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

export function fmtDay(dayUtc) {
  if (!dayUtc || dayUtc.length < 10) return dayUtc || "";
  const [, m, d] = dayUtc.split("-");
  if (!m || !d) return dayUtc;
  const month = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][Number(m) - 1] || m;
  return `${month} ${Number(d)}`;
}

export function percentChange(current, prior) {
  const c = Number(current) || 0;
  const p = Number(prior) || 0;
  if (p === 0 && c === 0) return 0;
  if (p === 0) return null; // undefined % change when prior was zero
  return ((c - p) / Math.abs(p)) * 100;
}

export function safeDivide(a, b) {
  const num = Number(a) || 0;
  const den = Number(b) || 0;
  return den ? num / den : 0;
}
