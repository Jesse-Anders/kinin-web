// Pulls Recharts-friendly colors and styles from the live CSS variables
// applied by `applyTheme`. By reading `getComputedStyle(document.documentElement)`
// we automatically respect Theme Studio overrides (so charts re-color when an
// admin tweaks the palette).
//
// All helpers return plain strings so they can be passed directly to Recharts
// props like `stroke`, `fill`, and `style`.

function readCssVar(name, fallback) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallback;
  }
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    const trimmed = (v || "").trim();
    return trimmed || fallback;
  } catch {
    return fallback;
  }
}

// Cached snapshot of resolved chart tokens. The Theme Studio writes a custom
// event when overrides change; consumers can call `refreshChartTokens()` to
// pick up new values. For now we resolve lazily on each call (cheap).
export function chartTokens() {
  return {
    ink: readCssVar("--ink", "#1A140B"),
    inkSoft: readCssVar("--ink-soft", "#4D3F2A"),
    inkFaint: readCssVar("--ink-faint", "#7A6B50"),
    cream: readCssVar("--cream", "#F4EBD6"),
    creamWarm: readCssVar("--cream-warm", "#EFE0BB"),
    creamDeep: readCssVar("--cream-deep", "#E8D5A4"),
    crimson: readCssVar("--crimson", "#B84E2D"),
    crimsonDeep: readCssVar("--crimson-deep", "#8C3818"),
    sage: readCssVar("--sage", "#7A9462"),
    sageDeep: readCssVar("--sage-deep", "#4E6940"),
    butter: readCssVar("--butter", "#C9962E"),
    thread: readCssVar("--thread", "rgba(26, 20, 11, 0.14)"),
    threadSoft: readCssVar("--thread-soft", "rgba(26, 20, 11, 0.07)"),
    danger: readCssVar("--danger", "#8C3818"),
    info: readCssVar("--info", "#4E6940"),
    fontMono: readCssVar("--font-mono", "JetBrains Mono, monospace"),
    fontDisplay: readCssVar("--font-display", "Fraunces, serif"),
    fontBody: readCssVar("--font-body", "Newsreader, serif"),
  };
}

// Categorical palette for series. Order chosen so the first ~6 series read
// well as a sequence (crimson -> sage -> butter -> deep crimson -> deep sage
// -> faint ink), then we cycle.
export function categoricalPalette() {
  const t = chartTokens();
  return [
    t.crimson,
    t.sage,
    t.butter,
    t.crimsonDeep,
    t.sageDeep,
    t.inkFaint,
    t.creamDeep,
    t.inkSoft,
  ];
}

export function paletteAt(index) {
  const pal = categoricalPalette();
  if (!pal.length) return "#1A140B";
  return pal[((index % pal.length) + pal.length) % pal.length];
}

// Color a model-family value across all charts so e.g. "haiku" is always the
// same shade of sage, "sonnet" always butter, "opus" always crimson.
export function colorForFamily(family) {
  const t = chartTokens();
  const key = (family || "").toLowerCase();
  if (key.includes("haiku")) return t.sage;
  if (key.includes("sonnet")) return t.butter;
  if (key.includes("opus")) return t.crimson;
  if (key === "unknown" || !key) return t.inkFaint;
  return paletteAt(Math.abs(hashString(key)));
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// Defaults for Recharts axis/tooltip styling so each dashboard doesn't have to
// re-specify them.
export function axisStyle() {
  const t = chartTokens();
  return {
    fontFamily: t.fontMono,
    fontSize: 10,
    fill: t.inkSoft,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

export function gridStroke() {
  return chartTokens().threadSoft;
}

export function tooltipStyle() {
  const t = chartTokens();
  return {
    backgroundColor: t.creamWarm,
    border: `1px solid ${t.ink}`,
    borderRadius: 0,
    padding: "8px 10px",
    fontFamily: t.fontMono,
    fontSize: 11,
    color: t.ink,
    boxShadow: "none",
  };
}

export function tooltipLabelStyle() {
  return {
    fontFamily: chartTokens().fontMono,
    color: chartTokens().inkFaint,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: 10,
    marginBottom: 4,
  };
}
