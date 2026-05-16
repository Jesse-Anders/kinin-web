import { toPng } from "html-to-image";

// Snapshot a DOM node (typically a ChartFrame) as a PNG and trigger a download.
// We bump pixelRatio for crisp output on retina; the cream background mirrors
// the rest of the app so the PNG drops into a slide deck cleanly.
export async function exportNodeToPng(node, { filename = "kinin-metric.png", scale = 2 } = {}) {
  if (!node || typeof window === "undefined") return false;
  const bg = readCssVar("--cream", "#F4EBD6");
  try {
    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: scale,
      backgroundColor: bg,
      // html-to-image bundles the cloned DOM with inlined styles; this hint
      // helps SVG charts render fonts correctly.
      style: { fontFamily: readCssVar("--font-body", "serif") },
    });
    triggerDownload(dataUrl, filename);
    return true;
  } catch (err) {
    console.warn("exportNodeToPng failed", err);
    return false;
  }
}

function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
  }, 0);
}

function readCssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v || "").trim() || fallback;
  } catch {
    return fallback;
  }
}

export function sanitizeForFilename(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
