import { readerName, type CopyLabel, type Reader } from '@library/shared';
import type { jsPDF } from 'jspdf';
import { code128, QUIET_ZONE_MODULES } from './barcode';
import { CARD_SHEET, labelPositions, type SheetLayout } from './sheets';

/*
 * PDFs are made in the browser (no server, no cost). Sizes are in millimetres, fonts in
 * points. The built-in Helvetica covers Dutch and other Western European characters.
 */

const PT = 0.3528; // millimetres per point
const ACCENT: [number, number, number] = [15, 118, 110]; // matches the app's accent colour
const MUTED: [number, number, number] = [91, 102, 98];

async function newDocument(): Promise<jsPDF> {
  // Loaded on demand: only people printing labels download the PDF library.
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'mm', format: 'a4', compress: true });
}

/** Shortens text with an ellipsis until it fits. */
function fit(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && doc.getTextWidth(`${shortened}…`) > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}…`;
}

/** Draws a barcode centred in a box, with bars no wider than `maxModule` millimetres. */
function drawBarcode(
  doc: jsPDF,
  code: string,
  box: { x: number; y: number; width: number; height: number },
  maxModule = 0.5,
) {
  const { modules, bars } = code128(code);
  const module = Math.min(maxModule, box.width / (modules + 2 * QUIET_ZONE_MODULES));
  const left = box.x + (box.width - modules * module) / 2;
  doc.setFillColor(0, 0, 0);
  for (const bar of bars) {
    doc.rect(left + bar.start * module, box.y, bar.width * module, box.height, 'F');
  }
}

function placeOnPage(doc: jsPDF, page: number) {
  while (doc.getNumberOfPages() <= page) doc.addPage();
  doc.setPage(page + 1);
}

export async function bookLabelsPdf(
  labels: CopyLabel[],
  sheet: SheetLayout,
  options: { startAt: number; offset: { x: number; y: number } },
): Promise<jsPDF> {
  const doc = await newDocument();
  const positions = labelPositions(sheet, labels.length, options.startAt, options.offset);
  // Scale text with the label so small and large sheets both look right.
  const titleSize = Math.min(10, Math.max(6, sheet.labelHeight * 0.3));
  const codeSize = Math.min(10, Math.max(6.5, sheet.labelHeight * 0.3));
  const padding = Math.min(3, sheet.labelWidth * 0.05);
  const showAuthors = sheet.labelHeight >= 30;

  labels.forEach((label, i) => {
    const { page, x, y } = positions[i] as (typeof positions)[number];
    placeOnPage(doc, page);
    const inner = sheet.labelWidth - 2 * padding;
    let top = y + padding + titleSize * PT;

    doc.setFont('helvetica', 'bold').setFontSize(titleSize).setTextColor(0, 0, 0);
    doc.text(fit(doc, label.title, inner), x + padding, top);
    if (showAuthors && label.authors.length > 0) {
      top += titleSize * PT * 1.2;
      doc.setFont('helvetica', 'normal').setTextColor(...MUTED);
      doc.text(fit(doc, label.authors.join(', '), inner), x + padding, top);
    }

    const codeBaseline = y + sheet.labelHeight - padding;
    const barTop = top + 1.2;
    const barHeight = codeBaseline - codeSize * PT - 0.8 - barTop;
    drawBarcode(doc, label.barcode, { x: x + padding, y: barTop, width: inner, height: barHeight });

    doc.setFont('helvetica', 'normal').setFontSize(codeSize).setTextColor(0, 0, 0);
    doc.text(label.barcode, x + sheet.labelWidth / 2, codeBaseline, { align: 'center' });
  });
  return doc;
}

export type PdfLogo = { dataUrl: string; width: number; height: number };

/** Loads the school logo for use in a PDF; without a logo (or if it fails) cards simply have none. */
export async function loadLogo(logoKey: string | undefined): Promise<PdfLogo | undefined> {
  if (!logoKey) return undefined;
  try {
    const blob = await (await fetch(`/${logoKey}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(blob);
    });
    const logo = { dataUrl, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return logo;
  } catch {
    return undefined;
  }
}

export async function readerCardsPdf(
  readers: Reader[],
  libraryName: string,
  logo?: PdfLogo,
): Promise<jsPDF> {
  const doc = await newDocument();
  const sheet = CARD_SHEET;
  const positions = labelPositions(sheet, readers.length);
  const padding = 5;
  const inner = sheet.labelWidth - 2 * padding;

  readers.forEach((reader, i) => {
    const { page, x, y } = positions[i] as (typeof positions)[number];
    placeOnPage(doc, page);

    // Light outline as a cutting guide.
    doc.setDrawColor(200, 200, 200).setLineWidth(0.2);
    doc.roundedRect(x, y, sheet.labelWidth, sheet.labelHeight, 3, 3, 'S');

    // The school logo top right (at most 10 mm high, in proportion), the name next to it.
    let nameWidth = inner;
    if (logo) {
      const height = Math.min(10, (logo.height / logo.width) * 24);
      const width = (logo.width / logo.height) * height;
      const format = logo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(
        logo.dataUrl,
        format,
        x + sheet.labelWidth - padding - width,
        y + padding - 1,
        width,
        height,
      );
      nameWidth = inner - width - 2;
    }
    doc
      .setFont('helvetica', 'bold')
      .setFontSize(10)
      .setTextColor(...ACCENT);
    doc.text(fit(doc, libraryName, nameWidth), x + padding, y + padding + 10 * PT);

    doc.setFontSize(15).setTextColor(0, 0, 0);
    doc.text(fit(doc, readerName(reader), inner), x + padding, y + 19);
    if (reader.group) {
      doc
        .setFont('helvetica', 'normal')
        .setFontSize(11)
        .setTextColor(...MUTED);
      doc.text(reader.group, x + padding, y + 25);
    }

    drawBarcode(doc, reader.memberNumber, { x: x + padding, y: y + 29, width: inner, height: 13 });
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0, 0, 0);
    doc.text(reader.memberNumber, x + sheet.labelWidth / 2, y + sheet.labelHeight - padding, {
      align: 'center',
    });
  });
  return doc;
}
