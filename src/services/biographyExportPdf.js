import { jsPDF } from "jspdf";
import kininLogoUrl from "../assets/icons/kinin-icon-390sq.png";

const MARGIN = 54;
const PAGE_WIDTH = 612; // US Letter points
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 36;
const CONTENT_BOTTOM = FOOTER_Y - 18;
const LINE_GAP = 4;
const BLOCK_GAP = 14;
const SECTION_GAP = 22;

// Memoirist palette (from theme tokens) as RGB for jsPDF.
const INK = [26, 20, 11];
const INK_SOFT = [77, 63, 42];
const INK_FAINT = [122, 107, 80];
const CRIMSON = [184, 78, 45];
const CREAM = [244, 235, 214];
let logoDataUrlPromise = null;

function loadLogoDataUrl() {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(kininLogoUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`logo_fetch_${res.status}`);
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("logo_read_failed"));
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => "");
  }
  return logoDataUrlPromise;
}

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

function fillPageBackground(doc) {
  // Full-page cream surface (site paper), drawn before any content on the page.
  doc.setFillColor(...CREAM);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
}

function drawBrandHeader(doc, logoDataUrl) {
  const logoSize = 28;
  const logoX = MARGIN;
  const logoY = 28;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize);
    } catch {
      /* logo optional */
    }
  }

  const wordX = logoDataUrl ? logoX + logoSize + 10 : MARGIN;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...CRIMSON);
  doc.text("KININ", wordX, logoY + 19);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK_FAINT);
  doc.text("A living biography", wordX + 58, logoY + 19);

  doc.setDrawColor(...CRIMSON);
  doc.setLineWidth(1.25);
  doc.line(MARGIN, 70, PAGE_WIDTH - MARGIN, 70);

  return 92;
}

function drawFooter(doc, pageNumber, pageCount) {
  doc.setDrawColor(200, 190, 170);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, FOOTER_Y - 10, PAGE_WIDTH - MARGIN, FOOTER_Y - 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK_FAINT);
  doc.text("Kinin", MARGIN, FOOTER_Y);
  doc.text(`${pageNumber} / ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_Y, { align: "right" });
}

function ensureSpace(doc, y, needed, logoDataUrl) {
  if (y + needed <= CONTENT_BOTTOM) return y;
  doc.addPage();
  fillPageBackground(doc);
  // Continuation pages: slim brand mark on the same cream surface.
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", MARGIN, 28, 16, 16);
    } catch {
      /* optional */
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...CRIMSON);
    doc.text("KININ", MARGIN + 22, 40);
  }
  doc.setDrawColor(...CRIMSON);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, 48, PAGE_WIDTH - MARGIN, 48);
  return 64;
}

function writeWrapped(doc, text, { x, y, maxWidth, fontSize = 11, fontStyle = "normal", color = INK_SOFT, logoDataUrl }) {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  const lineHeight = fontSize * 1.4;
  let cursor = y;
  for (const line of lines) {
    cursor = ensureSpace(doc, cursor, lineHeight, logoDataUrl);
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    doc.text(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

function writeSectionLabel(doc, label, y, logoDataUrl) {
  let cursor = ensureSpace(doc, y, 28, logoDataUrl);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...CRIMSON);
  doc.text(String(label || "").toUpperCase(), MARGIN, cursor);
  cursor += 6;
  doc.setDrawColor(...CRIMSON);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, cursor, MARGIN + 36, cursor);
  return cursor + 14;
}

function writeSpeakerBlock(doc, { speaker, content, when }, y, logoDataUrl) {
  let cursor = ensureSpace(doc, y, 40, logoDataUrl);
  if (when) {
    cursor = writeWrapped(doc, when, {
      x: MARGIN,
      y: cursor,
      maxWidth: CONTENT_WIDTH,
      fontSize: 9,
      color: INK_FAINT,
      logoDataUrl,
    });
    cursor += LINE_GAP;
  }

  const speakerText = `${speaker} — `;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const speakerWidth = doc.getTextWidth(speakerText);
  const contentMax = Math.max(120, CONTENT_WIDTH - speakerWidth);

  cursor = ensureSpace(doc, cursor, 14, logoDataUrl);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...CRIMSON);
  doc.text(speakerText, MARGIN, cursor);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK_SOFT);
  const lines = doc.splitTextToSize(content, contentMax);
  const lineHeight = 11 * 1.4;
  lines.forEach((line, i) => {
    if (i === 0) {
      doc.text(line, MARGIN + speakerWidth, cursor);
      cursor += lineHeight;
      return;
    }
    cursor = ensureSpace(doc, cursor, lineHeight, logoDataUrl);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...INK_SOFT);
    doc.text(line, MARGIN, cursor);
    cursor += lineHeight;
  });
  return cursor + BLOCK_GAP;
}

/**
 * Build a human-readable biography PDF from the cleaned export package.
 * @param {object} pkg
 * @param {{ logoDataUrl?: string }} [options]
 * @returns {jsPDF}
 */
export function buildBiographyPdf(pkg, { logoDataUrl = "" } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const title = String(pkg?.title || "Biography").trim() || "Biography";
  const dob = formatLongDate(pkg?.date_of_birth);
  const exportedAt = formatDateTime(pkg?.exported_at) || formatLongDate(pkg?.exported_at);
  const interview = Array.isArray(pkg?.interview) ? pkg.interview : [];
  const journal = Array.isArray(pkg?.journal) ? pkg.journal : [];

  fillPageBackground(doc);
  let y = drawBrandHeader(doc, logoDataUrl);

  y = writeWrapped(doc, title, {
    x: MARGIN,
    y,
    maxWidth: CONTENT_WIDTH,
    fontSize: 22,
    fontStyle: "bold",
    color: INK,
    logoDataUrl,
  });
  y += 8;

  if (dob) {
    y = writeWrapped(doc, `Date of birth · ${dob}`, {
      x: MARGIN,
      y,
      maxWidth: CONTENT_WIDTH,
      fontSize: 11,
      color: INK_FAINT,
      logoDataUrl,
    });
  }
  if (exportedAt) {
    y = writeWrapped(doc, `Exported · ${exportedAt}`, {
      x: MARGIN,
      y,
      maxWidth: CONTENT_WIDTH,
      fontSize: 11,
      color: INK_FAINT,
      logoDataUrl,
    });
  }

  y += SECTION_GAP;
  y = writeSectionLabel(doc, "Interview", y, logoDataUrl);

  if (!interview.length) {
    y = writeWrapped(doc, "No interview turns were available for this biography.", {
      x: MARGIN,
      y,
      maxWidth: CONTENT_WIDTH,
      fontSize: 11,
      color: INK_FAINT,
      logoDataUrl,
    });
  } else {
    for (const turn of interview) {
      const content = String(turn?.content || "").trim();
      if (!content) continue;
      y = writeSpeakerBlock(
        doc,
        {
          speaker: String(turn?.speaker || "").trim() || "Speaker",
          content,
          when: formatDateTime(turn?.timestamp),
        },
        y,
        logoDataUrl,
      );
    }
  }

  y += SECTION_GAP;
  y = writeSectionLabel(doc, "Journal", y, logoDataUrl);

  if (!journal.length) {
    y = writeWrapped(doc, "No finalized journal entries.", {
      x: MARGIN,
      y,
      maxWidth: CONTENT_WIDTH,
      fontSize: 11,
      color: INK_FAINT,
      logoDataUrl,
    });
  } else {
    for (const entry of journal) {
      const entryTitle = String(entry?.title || "Untitled entry").trim() || "Untitled entry";
      const when = formatDateTime(entry?.timestamp) || formatLongDate(entry?.timestamp);
      const body = String(entry?.body || "").trim();
      if (!body) continue;

      y = ensureSpace(doc, y, 40, logoDataUrl);
      y = writeWrapped(doc, entryTitle, {
        x: MARGIN,
        y,
        maxWidth: CONTENT_WIDTH,
        fontSize: 13,
        fontStyle: "bold",
        color: INK,
        logoDataUrl,
      });
      if (when) {
        y += 2;
        y = writeWrapped(doc, when, {
          x: MARGIN,
          y,
          maxWidth: CONTENT_WIDTH,
          fontSize: 9,
          color: INK_FAINT,
          logoDataUrl,
        });
      }
      y += LINE_GAP;
      y = writeWrapped(doc, body, {
        x: MARGIN,
        y,
        maxWidth: CONTENT_WIDTH,
        fontSize: 11,
        color: INK_SOFT,
        logoDataUrl,
      });
      y += BLOCK_GAP + 4;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    drawFooter(doc, i, pageCount);
  }

  return doc;
}

/**
 * Build and trigger download of the biography PDF.
 * @param {object} pkg cleaned export package from /stewardship/export
 * @param {{ filename?: string }} [options]
 */
export async function downloadBiographyPdf(pkg, { filename } = {}) {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildBiographyPdf(pkg, { logoDataUrl });
  const name = String(filename || "kinin-biography.pdf").trim() || "kinin-biography.pdf";
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.endsWith(".pdf") ? name : `${name}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
