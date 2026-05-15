// ─────────────────────────────────────────────────────────────────────────────
//  Kinin design tokens — "Memoirist" aesthetic
//
//  This file is the single source of truth for the site's look. To change the
//  palette, fonts, or scale globally, edit values here and redeploy.
//
//  You can also iterate live via the Theme Studio at /admin/theme (admin
//  only). The Studio reads these defaults, lets you tweak them in the
//  browser, and exports an updated `tokens.js` you can paste back in.
// ─────────────────────────────────────────────────────────────────────────────

export const defaultTokens = {
  color: {
    // Surface
    cream: "#F4EBD6",
    creamWarm: "##f2e5ca",
    creamDeep: "#E8D5A4",

    // Ink (foreground)
    ink: "#1A140B",
    inkSoft: "#4D3F2A",
    inkFaint: "#7A6B50",

    // Accents
    crimson: "#B84E2D",
    crimsonDeep: "#8C3818",
    sage: "#7A9462",
    sageDeep: "#4E6940",
    butter: "#C9962E",

    // Rules / dividers
    thread: "rgba(26, 20, 11, 0.14)",
    threadSoft: "rgba(26, 20, 11, 0.07)",

    // Status (used by banners / errors)
    danger: "#8C3818",
    dangerBg: "#F7E3DA",
    info: "#4E6940",
    infoBg: "#E8EEDF",
  },

  font: {
    display: "'Fraunces', Georgia, serif",
    body: "'Newsreader', Georgia, serif",
    mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
  },

  // Type scale (responsive headlines use clamp(min, vw, max))
  size: {
    base: "17px",          // body baseline
    labelXs: "9.5px",      // tiniest mono label
    labelSm: "10.5px",     // standard mono label
    labelMd: "11px",       // section eyebrow
    bodySm: "13px",
    bodyMd: "15px",
    bodyLg: "17px",
    bodyXl: "19px",
    h3: "22px",
    h2Min: 40,             // headline clamps as numbers (px) so Studio can slider
    h2Max: 72,
    h2Vw: 5,               // vw component for clamp middle
    h1Min: 56,
    h1Max: 140,
    h1Vw: 9,
    quoteMin: 26,
    quoteMax: 42,
    quoteVw: 3.2,
  },

  // Line-height + letter-spacing
  type: {
    bodyLineHeight: "1.6",
    proseLineHeight: "1.7",
    headlineLineHeight: "0.9",
    h2LineHeight: "1.0",
    quoteLineHeight: "1.14",
    headlineTracking: "-0.035em",
    h2Tracking: "-0.026em",
    bodyTracking: "0",
    labelTracking: "0.16em",
    eyebrowTracking: "0.18em",
  },

  // Spacing scale
  space: {
    pageGutter: "48px",         // container side padding
    pageGutterMobile: "24px",
    sectionY: "96px",           // vertical padding inside a Section
    sectionYMobile: "56px",
    docHeaderY: "32px",
    blockGapLg: "44px",
    blockGapMd: "24px",
    blockGapSm: "16px",
    containerMax: "1200px",
  },

  border: {
    ruleThin: "1px",
    ruleThick: "2px",
    cornerSize: "14px",
    radius: "0",                // Memoirist is sharp; raise to soften
  },

  motion: {
    noiseOpacity: "0.4",        // 0 = off, ~0.5 = visibly grainy
    transitionFast: "0.18s ease",
    transitionMed: "0.3s ease",
  },
};

// Names of color tokens, in the order the Theme Studio displays them.
export const COLOR_GROUPS = [
  {
    label: "Surface",
    keys: ["cream", "creamWarm", "creamDeep"],
  },
  {
    label: "Ink",
    keys: ["ink", "inkSoft", "inkFaint"],
  },
  {
    label: "Accents",
    keys: ["crimson", "crimsonDeep", "butter", "sage", "sageDeep"],
  },
  {
    label: "Rules & Status",
    keys: ["thread", "threadSoft", "danger", "dangerBg", "info", "infoBg"],
  },
];

// Curated font options the Theme Studio offers in its dropdowns.
export const FONT_CHOICES = {
  display: [
    "'Fraunces', Georgia, serif",
    "'EB Garamond', Georgia, serif",
    "'Bodoni Moda', Georgia, serif",
    "'Playfair Display', Georgia, serif",
    "'Cormorant Garamond', Georgia, serif",
  ],
  body: [
    "'Newsreader', Georgia, serif",
    "'EB Garamond', Georgia, serif",
    "'IBM Plex Serif', Georgia, serif",
    "'Source Serif 4', Georgia, serif",
    "'Inter', system-ui, sans-serif",
  ],
  mono: [
    "'JetBrains Mono', ui-monospace, Menlo, monospace",
    "'IBM Plex Mono', ui-monospace, Menlo, monospace",
    "'Inter', system-ui, sans-serif",
  ],
};

// Deep merge that only replaces leaves; preserves untouched groups so the
// Studio can store sparse overrides.
export function mergeTokens(base, overrides) {
  if (!overrides || typeof overrides !== "object") return base;
  const out = {};
  for (const key of Object.keys(base)) {
    const baseVal = base[key];
    const overVal = overrides[key];
    if (
      baseVal &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal) &&
      overVal &&
      typeof overVal === "object" &&
      !Array.isArray(overVal)
    ) {
      out[key] = mergeTokens(baseVal, overVal);
    } else if (overVal !== undefined) {
      out[key] = overVal;
    } else {
      out[key] = baseVal;
    }
  }
  for (const key of Object.keys(overrides || {})) {
    if (!(key in out)) out[key] = overrides[key];
  }
  return out;
}

// Flatten tokens into a `{ '--css-var-name': value }` map.
export function tokensToCssVars(t) {
  const c = t.color;
  const f = t.font;
  const s = t.size;
  const ty = t.type;
  const sp = t.space;
  const b = t.border;
  const m = t.motion;

  return {
    // Colors
    "--cream": c.cream,
    "--cream-warm": c.creamWarm,
    "--cream-deep": c.creamDeep,
    "--ink": c.ink,
    "--ink-soft": c.inkSoft,
    "--ink-faint": c.inkFaint,
    "--crimson": c.crimson,
    "--crimson-deep": c.crimsonDeep,
    "--sage": c.sage,
    "--sage-deep": c.sageDeep,
    "--butter": c.butter,
    "--thread": c.thread,
    "--thread-soft": c.threadSoft,
    "--danger": c.danger,
    "--danger-bg": c.dangerBg,
    "--info": c.info,
    "--info-bg": c.infoBg,

    // Fonts
    "--font-display": f.display,
    "--font-body": f.body,
    "--font-mono": f.mono,

    // Sizes
    "--size-base": s.base,
    "--size-label-xs": s.labelXs,
    "--size-label-sm": s.labelSm,
    "--size-label-md": s.labelMd,
    "--size-body-sm": s.bodySm,
    "--size-body-md": s.bodyMd,
    "--size-body-lg": s.bodyLg,
    "--size-body-xl": s.bodyXl,
    "--size-h3": s.h3,
    "--size-h2": `clamp(${s.h2Min}px, ${s.h2Vw}vw, ${s.h2Max}px)`,
    "--size-h1": `clamp(${s.h1Min}px, ${s.h1Vw}vw, ${s.h1Max}px)`,
    "--size-quote": `clamp(${s.quoteMin}px, ${s.quoteVw}vw, ${s.quoteMax}px)`,

    // Type
    "--lh-body": ty.bodyLineHeight,
    "--lh-prose": ty.proseLineHeight,
    "--lh-headline": ty.headlineLineHeight,
    "--lh-h2": ty.h2LineHeight,
    "--lh-quote": ty.quoteLineHeight,
    "--track-headline": ty.headlineTracking,
    "--track-h2": ty.h2Tracking,
    "--track-body": ty.bodyTracking,
    "--track-label": ty.labelTracking,
    "--track-eyebrow": ty.eyebrowTracking,

    // Space
    "--gutter": sp.pageGutter,
    "--gutter-mobile": sp.pageGutterMobile,
    "--section-y": sp.sectionY,
    "--section-y-mobile": sp.sectionYMobile,
    "--doc-header-y": sp.docHeaderY,
    "--block-gap-lg": sp.blockGapLg,
    "--block-gap-md": sp.blockGapMd,
    "--block-gap-sm": sp.blockGapSm,
    "--container-max": sp.containerMax,

    // Border
    "--rule-thin": b.ruleThin,
    "--rule-thick": b.ruleThick,
    "--corner-size": b.cornerSize,
    "--radius": b.radius,

    // Motion
    "--noise-opacity": m.noiseOpacity,
    "--t-fast": m.transitionFast,
    "--t-med": m.transitionMed,
  };
}
