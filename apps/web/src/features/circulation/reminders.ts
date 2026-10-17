import type { Loan } from '@library/shared';
import type { jsPDF } from 'jspdf';
import { compareGroups } from '../../lib/format';
import { ACCENT, fit, MUTED, newDocument, pdfText, PT, type PdfLogo } from '../labels/pdf';

/** One slip per reader with all their late books, for the class teacher to hand out. */
export type ReminderSlip = {
  readerId: string;
  readerName: string;
  readerGroup?: string;
  loans: Loan[];
};

/** Groups loans per reader, sorted by class and name (the order a teacher hands them out). */
export function reminderSlips(loans: Loan[]): ReminderSlip[] {
  const byReader = new Map<string, ReminderSlip>();
  for (const loan of loans) {
    const slip = byReader.get(loan.readerId) ?? {
      readerId: loan.readerId,
      readerName: loan.readerName,
      readerGroup: loan.readerGroup,
      loans: [],
    };
    slip.loans.push(loan);
    byReader.set(loan.readerId, slip);
  }
  const slips = [...byReader.values()];
  for (const slip of slips) slip.loans.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return slips.sort(
    (a, b) =>
      compareGroups(a.readerGroup, b.readerGroup) || a.readerName.localeCompare(b.readerName, 'nl'),
  );
}

/** Translated texts; the PDF itself knows no language. */
export type ReminderTexts = {
  heading: string;
  intro: string;
  dueOn: (dueDate: string) => string;
  more: (count: number) => string;
  printedOn: string;
};

const SLIPS_PER_PAGE = 3;
const SLIP_HEIGHT = 297 / SLIPS_PER_PAGE;
const MARGIN = 14;
const WIDTH = 210 - 2 * MARGIN;
const BOOK_LINE = 6;

/**
 * A4 with three slips per page and dashed cutting lines. Each slip fits about seven books;
 * more than that (only teachers can borrow so many) ends with "and N more".
 */
export async function reminderSlipsPdf(
  slips: ReminderSlip[],
  libraryName: string,
  texts: ReminderTexts,
  logo?: PdfLogo,
): Promise<jsPDF> {
  const doc = await newDocument();
  slips.forEach((slip, i) => {
    const position = i % SLIPS_PER_PAGE;
    if (i > 0 && position === 0) doc.addPage();
    if (position > 0) drawCutLine(doc, position * SLIP_HEIGHT);
    drawSlip(doc, slip, position * SLIP_HEIGHT, libraryName, texts, logo);
  });
  return doc;
}

function drawCutLine(doc: jsPDF, y: number) {
  doc.setDrawColor(180, 180, 180).setLineWidth(0.2).setLineDashPattern([2, 2], 0);
  doc.line(6, y, 204, y);
  doc.setLineDashPattern([], 0);
}

function drawSlip(
  doc: jsPDF,
  slip: ReminderSlip,
  top: number,
  libraryName: string,
  texts: ReminderTexts,
  logo?: PdfLogo,
) {
  let y = top + 12;
  let nameWidth = WIDTH;
  if (logo) {
    const height = Math.min(12, (logo.height / logo.width) * 30);
    const width = (logo.width / logo.height) * height;
    const format = logo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(logo.dataUrl, format, MARGIN + WIDTH - width, y - 4, width, height);
    nameWidth = WIDTH - width - 4;
  }
  doc
    .setFont('helvetica', 'bold')
    .setFontSize(10)
    .setTextColor(...ACCENT);
  doc.text(fit(doc, libraryName, nameWidth), MARGIN, y);

  y += 9;
  doc.setFontSize(16).setTextColor(0, 0, 0);
  doc.text(texts.heading, MARGIN, y);

  y += 8;
  doc.setFontSize(12);
  const name = fit(doc, slip.readerName, WIDTH * 0.7);
  doc.text(name, MARGIN, y);
  // Measured in the bold font the name was written in, before switching fonts.
  const nameEnd = doc.getTextWidth(name);
  if (slip.readerGroup) {
    doc
      .setFont('helvetica', 'normal')
      .setTextColor(...MUTED)
      .text(`  ·  ${pdfText(slip.readerGroup)}`, MARGIN + nameEnd, y);
  }

  y += 7;
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0, 0, 0);
  const intro = doc.splitTextToSize(texts.intro, WIDTH) as string[];
  doc.text(intro, MARGIN, y);
  y += intro.length * 10 * PT * 1.25 + 4;

  const bottom = top + SLIP_HEIGHT - 12;
  const room = Math.max(1, Math.floor((bottom - y) / BOOK_LINE));
  const shown = slip.loans.length > room ? slip.loans.slice(0, room - 1) : slip.loans;
  for (const loan of shown) {
    const due = texts.dueOn(loan.dueDate);
    doc.setFont('helvetica', 'normal').setFontSize(10);
    const dueWidth = doc.getTextWidth(due);
    doc.setFont('helvetica', 'bold').setTextColor(0, 0, 0);
    doc.text(fit(doc, `•  ${loan.titleTitle}`, WIDTH - dueWidth - 6), MARGIN, y);
    doc.setFont('helvetica', 'normal').setTextColor(...MUTED);
    doc.text(due, MARGIN + WIDTH, y, { align: 'right' });
    y += BOOK_LINE;
  }
  if (shown.length < slip.loans.length) {
    doc.setTextColor(...MUTED).text(texts.more(slip.loans.length - shown.length), MARGIN, y);
  }

  doc
    .setFont('helvetica', 'normal')
    .setFontSize(8)
    .setTextColor(...MUTED);
  doc.text(texts.printedOn, MARGIN, top + SLIP_HEIGHT - 7);
}
