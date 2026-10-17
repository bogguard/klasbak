import { describe, expect, it } from 'vitest';
import { code128, expandRange } from './barcode';
import { pdfText } from './pdf';
import { CARD_SHEET, LABEL_SHEETS, labelPositions } from './sheets';

describe('code128', () => {
  it('encodes digits in the compact numeric mode, with start and stop patterns', () => {
    const { modules, bars } = code128('00000042');
    // Start C + 4 digit pairs + check + stop = 6 × 11 + 13 modules.
    expect(modules).toBe(79);
    // Start C pattern 11010011100 begins with a 2-module bar; the stop ends with a 2-module bar.
    expect(bars[0]).toEqual({ start: 0, width: 2 });
    expect(bars.at(-1)).toEqual({ start: 77, width: 2 });
  });

  it('encodes reader card numbers with a letter', () => {
    expect(code128('L000001').modules).toBeGreaterThan(79);
  });
});

describe('labelPositions', () => {
  const sheet = LABEL_SHEETS[0] as (typeof LABEL_SHEETS)[number]; // Avery L7651: 5 × 13

  it('fills a sheet row by row and continues on the next page', () => {
    const positions = labelPositions(sheet, 67);
    expect(positions[0]).toEqual({ page: 0, x: 4.7, y: 10.7 });
    expect(positions[1]).toEqual({ page: 0, x: 4.7 + 40.6, y: 10.7 });
    expect(positions[5]).toEqual({ page: 0, x: 4.7, y: 10.7 + 21.2 });
    expect(positions[65]).toEqual({ page: 1, x: 4.7, y: 10.7 });
  });

  it('skips used labels on a partly used sheet and applies the printer offset', () => {
    const [first] = labelPositions(sheet, 1, 7, { x: 1, y: -0.5 });
    expect(first).toEqual({ page: 0, x: 4.7 + 40.6 + 1, y: 10.7 + 21.2 - 0.5 });
  });

  it('keeps every layout inside the A4 page', () => {
    for (const layout of [...LABEL_SHEETS, CARD_SHEET]) {
      const last = labelPositions(layout, layout.columns * layout.rows).at(-1) ?? { x: 0, y: 0 };
      expect(last.x + layout.labelWidth).toBeLessThanOrEqual(210);
      expect(last.y + layout.labelHeight).toBeLessThanOrEqual(297);
    }
  });
});

describe('PDFs', () => {
  const label = {
    barcode: '00000042',
    titleId: 'T1',
    title: 'Dolfje Weerwolfje',
    authors: ['Paul van Loon'],
  };

  it('puts book labels on as many pages as needed', async () => {
    const { bookLabelsPdf } = await import('./pdf');
    const sheet = LABEL_SHEETS[1] as (typeof LABEL_SHEETS)[number]; // 24 per page
    const doc = await bookLabelsPdf(Array(30).fill(label), sheet, {
      startAt: 1,
      offset: { x: 0, y: 0 },
    });
    expect(doc.getNumberOfPages()).toBe(2);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });

  it('makes reader cards, ten per page', async () => {
    const { readerCardsPdf } = await import('./pdf');
    const reader = {
      id: 'R1',
      memberNumber: 'L000001',
      firstName: 'Amira',
      lastName: 'El Amrani',
      group: '3B',
      category: 'pupil' as const,
      active: true,
      activeLoanCount: 0,
      createdAt: '',
      updatedAt: '',
      version: 1,
    };
    const doc = await readerCardsPdf(Array(11).fill(reader), 'Bib De Regenboog');
    expect(doc.getNumberOfPages()).toBe(2);
  });
});

describe('expandRange', () => {
  it('lists every barcode in a range, keeping leading zeros', () => {
    expect(expandRange('00000008', '00000011')).toEqual([
      '00000008',
      '00000009',
      '00000010',
      '00000011',
    ]);
  });

  it('refuses backwards, non-numeric and too large ranges', () => {
    expect(expandRange('10', '2')).toBeUndefined();
    expect(expandRange('L1', 'L5')).toBeUndefined();
    expect(expandRange('1', '9999')).toBeUndefined();
  });
});

describe('pdfText', () => {
  it('joins separate accents to their letter, so jsPDF keeps its normal encoding', () => {
    expect(pdfText('Pascale Génestine')).toBe('Pascale Génestine');
  });

  it('keeps Western European characters and replaces or drops what the PDF fonts lack', () => {
    expect(pdfText('Œuvre – “Zoë” …')).toBe('Œuvre – “Zoë” …');
    expect(pdfText('Czesław Miłosz, Erdős')).toBe('Czeslaw Milosz, Erdos');
    expect(pdfText('Ge­nes​tine 📚')).toBe('Genestine ');
  });
});
