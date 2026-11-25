import { formatAccessCode, type PhotoPupil } from '@klasbak/shared';
import type { jsPDF } from 'jspdf';
import { encode } from 'uqr';
import { compareGroups } from '../../lib/format';
import { classPhotoCode } from './sequence';
import {
  ACCENT,
  drawBarcode,
  fit,
  MUTED,
  newDocument,
  pdfText,
  PT,
  type PdfLogo,
} from '../labels/pdf';

/*
 * Printed material for a photo day, made in the browser like the other PDFs:
 *  - slips for parents (eight per A4, to cut), with the download code and a QR code;
 *  - class lists for the photographer, with every pupil's card barcode: photographing a
 *    pupil's line before their portraits does the same as photographing their card.
 */

export type PhotoSlip = { pupil: PhotoPupil; code: string };

/** Pupils in the order a class teacher hands slips out. */
export function sortPupils<T extends { pupil: PhotoPupil }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      compareGroups(a.pupil.group, b.pupil.group) ||
      a.pupil.lastName.localeCompare(b.pupil.lastName, 'nl') ||
      a.pupil.firstName.localeCompare(b.pupil.firstName, 'nl'),
  );
}

/** Where the QR code leads: the code after "#" never reaches a server log. */
export function slipUrl(origin: string, code: string): string {
  return `${origin}/fotos#${code}`;
}

export type SlipTexts = {
  heading: string;
  howTo: string;
  until: string;
};

const COLUMNS = 2;
const ROWS = 4;
const SLIP_WIDTH = 210 / COLUMNS;
const SLIP_HEIGHT = 297 / ROWS;
const PAD = 8;
const QR_SIZE = 30;

function drawQr(doc: jsPDF, text: string, x: number, y: number, size: number) {
  const { data } = encode(text, { ecc: 'M', border: 0 });
  const module = size / data.length;
  doc.setFillColor(0, 0, 0);
  data.forEach((row, r) =>
    row.forEach((dark, c) => {
      // A hair larger than the module, so neighbouring squares print without white seams.
      if (dark) doc.rect(x + c * module, y + r * module, module + 0.02, module + 0.02, 'F');
    }),
  );
}

function drawCutLines(doc: jsPDF) {
  doc.setDrawColor(180, 180, 180).setLineWidth(0.2).setLineDashPattern([2, 2], 0);
  for (let c = 1; c < COLUMNS; c++) doc.line(c * SLIP_WIDTH, 4, c * SLIP_WIDTH, 293);
  for (let r = 1; r < ROWS; r++) doc.line(4, r * SLIP_HEIGHT, 206, r * SLIP_HEIGHT);
  doc.setLineDashPattern([], 0);
}

export async function photoSlipsPdf(
  slips: PhotoSlip[],
  options: { schoolName: string; origin: string; texts: SlipTexts; logo?: PdfLogo },
): Promise<jsPDF> {
  const { schoolName, origin, texts, logo } = options;
  const doc = await newDocument();
  sortPupils(slips).forEach((slip, i) => {
    const position = i % (COLUMNS * ROWS);
    if (i > 0 && position === 0) doc.addPage();
    if (position === 0) drawCutLines(doc);
    const left = (position % COLUMNS) * SLIP_WIDTH + PAD;
    const top = Math.floor(position / COLUMNS) * SLIP_HEIGHT + PAD;
    const width = SLIP_WIDTH - 2 * PAD;
    const textWidth = width - QR_SIZE - 4;

    let y = top + 4;
    let nameWidth = width;
    if (logo) {
      const height = Math.min(8, (logo.height / logo.width) * 24);
      const logoWidth = (logo.width / logo.height) * height;
      const format = logo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logo.dataUrl, format, left + width - logoWidth, top, logoWidth, height);
      nameWidth = width - logoWidth - 3;
    }
    doc
      .setFont('helvetica', 'bold')
      .setFontSize(9)
      .setTextColor(...ACCENT);
    doc.text(fit(doc, schoolName, nameWidth), left, y);

    y += 8;
    doc.setFontSize(14).setTextColor(0, 0, 0);
    doc.text(fit(doc, texts.heading, nameWidth), left, y);

    y += 6.5;
    doc.setFontSize(11);
    const name = fit(doc, `${slip.pupil.firstName} ${slip.pupil.lastName}`, textWidth);
    doc.text(name, left, y);
    if (slip.pupil.group) {
      y += 4.5;
      doc
        .setFont('helvetica', 'normal')
        .setFontSize(9)
        .setTextColor(...MUTED);
      doc.text(fit(doc, slip.pupil.group, textWidth), left, y);
    }

    y += 6;
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(0, 0, 0);
    const howTo = doc.splitTextToSize(pdfText(texts.howTo), textWidth) as string[];
    doc.text(howTo, left, y);
    y += howTo.length * 8.5 * PT * 1.2 + 4;

    doc.setFont('courier', 'bold').setFontSize(13);
    doc.text(formatAccessCode(slip.code), left, y);

    doc
      .setFont('helvetica', 'normal')
      .setFontSize(8)
      .setTextColor(...MUTED);
    // At the bottom, on two lines if needed: the date matters, so it's never cut off.
    const until = (doc.splitTextToSize(pdfText(texts.until), width) as string[]).slice(0, 2);
    doc.text(until, left, top + SLIP_HEIGHT - 2 * PAD + 2 - (until.length - 1) * 8 * PT * 1.2);

    drawQr(doc, slipUrl(origin, slip.code), left + width - QR_SIZE, top + 14, QR_SIZE);
  });
  return doc;
}

export type ClassListTexts = {
  heading: (group: string) => string;
  instructions: string;
  classPhoto: (group: string) => string;
  noPhoto: string;
  withoutClass: string;
};

const MARGIN = 15;
const ROW_HEIGHT = 30;
const BLOCK_WIDTH = 85;
const BAR_HEIGHT = 14;

/** A name with its barcode under it, and the code in small print below. */
function drawCodeBlock(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  code: string | undefined,
  noPhoto: string,
) {
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(0, 0, 0);
  doc.text(fit(doc, label, BLOCK_WIDTH), x + BLOCK_WIDTH / 2, y + 6, { align: 'center' });
  if (!code) {
    doc.setFontSize(11).setTextColor(180, 30, 30);
    doc.text(pdfText(noPhoto), x + BLOCK_WIDTH / 2, y + 16, { align: 'center' });
    return;
  }
  drawBarcode(doc, code, { x, y: y + 9, width: BLOCK_WIDTH, height: BAR_HEIGHT }, 0.45);
  doc
    .setFont('helvetica', 'normal')
    .setFontSize(8)
    .setTextColor(...MUTED);
  doc.text(code, x + BLOCK_WIDTH / 2, y + 27, { align: 'center' });
}

/**
 * One or more pages per class. At the top the class photo code; then every pupil, the barcode
 * alternately left and right: a photo aimed at one line then holds no other barcode next to it,
 * and the nearest one on its side is two lines away.
 */
export async function classListsPdf(
  pupils: PhotoPupil[],
  options: { dayName: string; noPhoto: Set<string>; texts: ClassListTexts },
): Promise<jsPDF> {
  const { dayName, noPhoto, texts } = options;
  const doc = await newDocument();
  const byClass = new Map<string, PhotoPupil[]>();
  for (const { pupil } of sortPupils(pupils.map((pupil) => ({ pupil })))) {
    const group = pupil.group ?? '';
    byClass.set(group, [...(byClass.get(group) ?? []), pupil]);
  }

  let first = true;
  for (const [group, members] of byClass) {
    const name = group || texts.withoutClass;
    let y = 0;
    const startPage = () => {
      if (!first) doc.addPage();
      first = false;
      doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(0, 0, 0);
      doc.text(fit(doc, texts.heading(name), 180), MARGIN, MARGIN + 4);
      doc
        .setFont('helvetica', 'normal')
        .setFontSize(9)
        .setTextColor(...MUTED);
      doc.text(fit(doc, dayName, 180), MARGIN, MARGIN + 10);
      const lines = doc.splitTextToSize(pdfText(texts.instructions), 180) as string[];
      doc.text(lines, MARGIN, MARGIN + 15);
      y = MARGIN + 15 + lines.length * 9 * PT * 1.2 + 4;
    };
    startPage();
    if (group) {
      // The class photo code, centred and boxed, so it can't be taken for a pupil's line.
      const x = (210 - BLOCK_WIDTH) / 2;
      doc.setDrawColor(...ACCENT).setLineWidth(0.4);
      doc.roundedRect(x - 6, y, BLOCK_WIDTH + 12, ROW_HEIGHT + 2, 2, 2);
      drawCodeBlock(doc, x, y + 1, texts.classPhoto(group), classPhotoCode(group), texts.noPhoto);
      y += ROW_HEIGHT + 8;
    }
    members.forEach((pupil, i) => {
      if (y + ROW_HEIGHT > 297 - MARGIN) startPage();
      doc
        .setDrawColor(220, 220, 220)
        .setLineWidth(0.2)
        .line(MARGIN, y, 210 - MARGIN, y);
      const x = i % 2 === 0 ? MARGIN : 210 - MARGIN - BLOCK_WIDTH;
      const code = noPhoto.has(pupil.id) ? undefined : pupil.memberNumber;
      drawCodeBlock(doc, x, y + 1, `${pupil.firstName} ${pupil.lastName}`, code, texts.noPhoto);
      y += ROW_HEIGHT;
    });
  }
  return doc;
}
