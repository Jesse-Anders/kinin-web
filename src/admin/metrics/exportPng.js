import { toPng } from "html-to-image";

// Snapshot a DOM node (typically a ChartFrame) as a PNG and trigger a download.
// We bump pixelRatio for crisp output on retina; the cream background mirrors
// the rest of the app so the PNG drops into a slide deck cleanly. Elements
// marked with `data-png-exclude` are filtered out during capture (used to
// hide the export-button itself in the rendered PNG).
export async function exportNodeToPng(node, { filename = "kinin-metric.png", scale = 2 } = {}) {
  if (!node || typeof window === "undefined") return false;
  const bg = readCssVar("--cream", "#F4EBD6");
  try {
    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: scale,
      backgroundColor: bg,
      style: { fontFamily: readCssVar("--font-body", "serif") },
      filter: (el) => {
        if (!el || el.nodeType !== 1) return true;
        if (el.dataset && el.dataset.pngExclude != null) return false;
        return true;
      },
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
