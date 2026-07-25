import { jsPDF } from "jspdf";

const MARGIN = 54;
const PAGE_WIDTH = 612; // US Letter points
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_GAP = 4;
const BLOCK_GAP = 12;
const SECTION_GAP = 20;

function parseDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const iso = /T/.test(text) || text.endsWith("Z") ? text : `${text}T00:00:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatLongDate(value) {
  const dt = parseDate(value);
  if (!dt) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(dt);
}

function formatDateTime(value) {
  const dt = parseDate(value);
  if (!dt) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(dt);
}

function ensureSpace(doc, y, needed) {
  if (y + needed <= PAGE_HEIGHT - MARGIN) return y;
  doc.addPage();
  return MARGIN;
}

function writeWrapped(doc, text, { x, y, maxWidth, fontSize = 11, fontStyle = "normal", color = [40, 40, 40] }) {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  const lineHeight = fontSize * 1.35;
  let cursor = y;
  for (const line of lines) {
    cursor = ensureSpace(doc, cursor, lineHeight);
    doc.text(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

/**
 * Build a human-readable biography PDF from the cleaned export package.
 * @param {object} pkg
 * @returns {jsPDF}
 */
export function buildBiographyPdf(pkg) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const title = String(pkg?.title || "Biography").trim() || "Biography";
  const displayName = String(pkg?.owner_display_name || pkg?.preferred_name || "").trim();
  const dob = formatLongDate(pkg?.date_of_birth);
  const exportedAt = formatDateTime(pkg?.exported_at) || formatLongDate(pkg?.exported_at);
  const interview = Array.isArray(pkg?.interview) ? pkg.interview : [];
  const journal = Array.isArray(pkg?.journal) ? pkg.journal : [];

  let y = MARGIN;
  y = writeWrapped(doc, title, {
    x: MARGIN,
    y,
    maxWidth: CONTENT_WIDTH,
    fontSize: 20,
    fontStyle: "bold",
    color: [26, 20, 11],
  });
  y += 6;

  if (displayName) {
    y = writeWrapped(doc, displayName, {
      x: MARGIN,
      y,
      maxWidth: CONTENT_WIDTH,
      fontSize: 12,
      fontStyle: "normal",
      color: [80, 70, 55],
    });
  }
  if (dob) {
    y = writeWrapped(doc, `Date of birth: ${dob}`, {
      x: MARGIN,
      y,
      maxWidth: CONTENT_WIDTH,
      fontSize: 11,
      color: [90, 80, 65],
    });
  }
  if (exportedAt) {
    y = writeWrapped(doc, `Exported: ${exportedAt}`, {
      x: MARGIN,
      y,
      maxWidth: CONTENT_WIDTH,
      fontSize: 11,
      color: [90, 80, 65],
    });
  }

  y += SECTION_GAP;
  y = ensureSpace(doc, y, 28);
  y = writeWrapped(doc, "Interview", {
    x: MARGIN,
    y,
    maxWidth: CONTENT_WIDTH,
    fontSize: 15,
    fontStyle: "bold",
    color: [26, 20, 11],
  });
  y += 8;

  if (!interview.length) {
    y = writeWrapped(doc, "No interview turns were available for this biography.", {
      x: MARGIN,
      y,
      maxWidth: CONTENT_WIDTH,
      fontSize: 11,
      color: [100, 90, 75],
    });
  } else {
    for (const turn of interview) {
      const when = formatDateTime(turn?.timestamp);
      const speaker = String(turn?.speaker || "").trim() || "Speaker";
      const content = String(turn?.content || "").trim();
      if (!content) continue;

      y = ensureSpace(doc, y, 36);
      if (when) {
        y = writeWrapped(doc, when, {
          x: MARGIN,
          y,
          maxWidth: CONTENT_WIDTH,
          fontSize: 9,
          color: [120, 110, 95],
        });
        y += LINE_GAP;
      }
      y = writeWrapped(doc, `${speaker} — ${content}`, {
        x: MARGIN,
        y,
        maxWidth: CONTENT_WIDTH,
        fontSize: 11,
        color: [40, 40, 40],
      });
      y += BLOCK_GAP;
    }
  }

  y += SECTION_GAP;
  y = ensureSpace(doc, y, 28);
  y = writeWrapped(doc, "Journal", {
    x: MARGIN,
    y,
    maxWidth: CONTENT_WIDTH,
    fontSize: 15,
    fontStyle: "bold",
    color: [26, 20, 11],
  });
  y += 8;

  if (!journal.length) {
    y = writeWrapped(doc, "No finalized journal entries.", {
      x: MARGIN,
      y,
      maxWidth: CONTENT_WIDTH,
      fontSize: 11,
      color: [100, 90, 75],
    });
  } else {
    for (const entry of journal) {
      const entryTitle = String(entry?.title || "Untitled entry").trim() || "Untitled entry";
      const when = formatDateTime(entry?.timestamp) || formatLongDate(entry?.timestamp);
      const body = String(entry?.body || "").trim();
      if (!body) continue;

      y = ensureSpace(doc, y, 40);
      y = writeWrapped(doc, entryTitle, {
        x: MARGIN,
        y,
        maxWidth: CONTENT_WIDTH,
        fontSize: 12,
        fontStyle: "bold",
        color: [26, 20, 11],
      });
      if (when) {
        y += 2;
        y = writeWrapped(doc, when, {
          x: MARGIN,
          y,
          maxWidth: CONTENT_WIDTH,
          fontSize: 9,
          color: [120, 110, 95],
        });
      }
      y += LINE_GAP;
      y = writeWrapped(doc, body, {
        x: MARGIN,
        y,
        maxWidth: CONTENT_WIDTH,
        fontSize: 11,
        color: [40, 40, 40],
      });
      y += BLOCK_GAP + 4;
    }
  }

  return doc;
}

/**
 * Build and trigger download of the biography PDF.
 * @param {object} pkg cleaned export package from /stewardship/export
 * @param {{ filename?: string }} [options]
 */
export async function downloadBiographyPdf(pkg, { filename } = {}) {
  const doc = buildBiographyPdf(pkg);
  const name = String(filename || "kinin-biography.pdf").trim() || "kinin-biography.pdf";
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.endsWith(".pdf") ? name : `${name}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
