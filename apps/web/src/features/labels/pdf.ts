import { readerName, type CopyLabel, type Reader } from '@library/shared';
import type { jsPDF } from 'jspdf';
import { code128, QUIET_ZONE_MODULES } from './barcode';
import { CARD_SHEET, labelPositions, type SheetLayout } from './sheets';

/*
 * PDFs are made in the browser (no server, no cost). Sizes are in millimetres, fonts in
 * points. The built-in Helvetica covers Dutch and other Western European characters.
 */

export const PT = 0.3528; // millimetres per point
export const ACCENT: [number, number, number] = [15, 118, 110]; // matches the app's accent colour
export const MUTED: [number, number, number] = [91, 102, 98];

export async function newDocument(): Promise<jsPDF> {
  // Loaded on demand: only people printing labels download the PDF library.
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'mm', format: 'a4', compress: true });
}

/** Letters with a stroke have no decomposition; these are the common ones in names. */
const BARE_LETTERS: Record<string, string> = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ı: 'i', ħ: 'h' };

/** Windows-1252 characters beyond Latin-1 that the built-in PDF fonts can also show. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/**
 * Makes text safe for the built-in PDF fonts. A single character they can't show (like a
 * separate accent, U+0301) makes jsPDF switch the whole line to another encoding, which
 * spreads the letters apart. Accents are joined to their letter; what still can't be shown
 * falls back to the bare letter ("ő" becomes "o", "ł" becomes "l") or is left out.
 */
export function pdfText(text: string): string {
  let safe = '';
  for (const char of text.normalize('NFC')) {
    if (isWinAnsi(char)) safe += char;
    else safe += BARE_LETTERS[char] ?? [...char.normalize('NFKD')].filter(isWinAnsi).join('');
  }
  return safe;
}

function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  // Soft hyphens (0xAD) would print as a stray hyphen, so they are dropped too.
  return (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff && code !== 0xad) ||
    WIN_ANSI_EXTRA.has(char)
  );
}

/** Makes text safe for the PDF and shortens it with an ellipsis until it fits. */
export function fit(doc: jsPDF, raw: string, maxWidth: number): string {
  const text = pdfText(raw);
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

/**
 * Book labels: title, barcode and number, plus the school's name (and logo on labels of
 * 30 mm and higher), so a lost book finds its way back.
 */
export async function bookLabelsPdf(
  labels: CopyLabel[],
  sheet: SheetLayout,
  options: {
    startAt: number;
    offset: { x: number; y: number };
    libraryName?: string;
    logo?: PdfLogo;
  },
): Promise<jsPDF> {
  const doc = await newDocument();
  const positions = labelPositions(sheet, labels.length, options.startAt, options.offset);
  // Scale text with the label so small and large sheets both look right.
  const titleSize = Math.min(10, Math.max(6, sheet.labelHeight * 0.3));
  const codeSize = Math.min(10, Math.max(6.5, sheet.labelHeight * 0.3));
  const padding = Math.min(3, sheet.labelWidth * 0.05);
  const showAuthors = sheet.labelHeight >= 30;
  const logo = sheet.labelHeight >= 30 ? options.logo : undefined;
  const logoHeight = 7;
  const logoWidth = logo ? Math.min(14, (logo.width / logo.height) * logoHeight) : 0;

  labels.forEach((label, i) => {
    const { page, x, y } = positions[i] as (typeof positions)[number];
    placeOnPage(doc, page);
    const inner = sheet.labelWidth - 2 * padding;
    let top = y + padding + titleSize * PT;

    // The logo top right; title and authors use the width left of it.
    const textWidth = logo ? inner - logoWidth - 1.5 : inner;
    if (logo) {
      const format = logo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      const height = (logo.height / logo.width) * logoWidth;
      const right = x + sheet.labelWidth - padding;
      doc.addImage(logo.dataUrl, format, right - logoWidth, y + padding - 0.5, logoWidth, height);
    }

    doc.setFont('helvetica', 'bold').setFontSize(titleSize).setTextColor(0, 0, 0);
    doc.text(fit(doc, label.title, textWidth), x + padding, top);
    if (showAuthors && label.authors.length > 0) {
      top += titleSize * PT * 1.2;
      doc.setFont('helvetica', 'normal').setTextColor(...MUTED);
      doc.text(fit(doc, label.authors.join(', '), textWidth), x + padding, top);
    }
    if (logo) top = Math.max(top, y + padding + logoHeight - 1.2);

    const codeBaseline = y + sheet.labelHeight - padding;
    const barTop = top + 1.2;
    const barHeight = codeBaseline - codeSize * PT - 0.8 - barTop;
    drawBarcode(doc, label.barcode, { x: x + padding, y: barTop, width: inner, height: barHeight });

    doc.setFont('helvetica', 'normal').setFontSize(codeSize).setTextColor(0, 0, 0);
    if (!options.libraryName) {
      doc.text(label.barcode, x + sheet.labelWidth / 2, codeBaseline, { align: 'center' });
      return;
    }
    // The school's name left, the number right, on one line: the barcode keeps its height.
    const right = x + sheet.labelWidth - padding;
    doc.text(label.barcode, right, codeBaseline, { align: 'right' });
    const room = inner - doc.getTextWidth(label.barcode) - 2;
    doc.setFontSize(codeSize * 0.85).setTextColor(...MUTED);
    doc.text(fit(doc, options.libraryName, room), x + padding, codeBaseline);
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

/**
 * Short marks in the page margin where the paper cutter should cut, on the grid lines
 * between the cards. Nothing is printed on the cards themselves, so a cut that's slightly
 * off leaves no stray line on a card.
 */
function drawCropMarks(doc: jsPDF, sheet: SheetLayout) {
  const left = sheet.marginLeft;
  const top = sheet.marginTop;
  const right = left + sheet.columns * sheet.pitchX;
  const bottom = top + sheet.rows * sheet.pitchY;
  const gap = 2;
  const length = 6;
  doc.setDrawColor(0, 0, 0).setLineWidth(0.2);
  for (let c = 0; c <= sheet.columns; c++) {
    const x = left + c * sheet.pitchX;
    doc.line(x, top - gap - length, x, top - gap);
    doc.line(x, bottom + gap, x, bottom + gap + length);
  }
  for (let r = 0; r <= sheet.rows; r++) {
    const y = top + r * sheet.pitchY;
    doc.line(left - gap - length, y, left - gap, y);
    doc.line(right + gap, y, right + gap + length, y);
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

  const marked = new Set<number>();
  readers.forEach((reader, i) => {
    const { page, x, y } = positions[i] as (typeof positions)[number];
    placeOnPage(doc, page);
    if (!marked.has(page)) {
      drawCropMarks(doc, sheet);
      marked.add(page);
    }

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

    // No class on the card: it changes every school year, the card shouldn't have to.
    doc.setFontSize(15).setTextColor(0, 0, 0);
    doc.text(fit(doc, readerName(reader), inner), x + padding, y + 21);

    drawBarcode(doc, reader.memberNumber, { x: x + padding, y: y + 26, width: inner, height: 15 });
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0, 0, 0);
    doc.text(reader.memberNumber, x + sheet.labelWidth / 2, y + sheet.labelHeight - padding, {
      align: 'center',
    });
  });
  return doc;
}
