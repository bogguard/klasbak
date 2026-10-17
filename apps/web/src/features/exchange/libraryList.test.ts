import { describe, expect, it } from 'vitest';
import { parseLibraryList } from './libraryList';

describe('parseLibraryList', () => {
  it('reads barcode, title, authors, ISBN and AVI below a title row', () => {
    const result = parseLibraryList([
      ['Wisselcollectie basisschool De Regenboog'],
      ['Barcode', 'Titel', 'Auteur', 'ISBN', 'AVI'],
      ['3456700123', 'Dolfje Weerwolfje', 'Paul van Loon', '978-90-258-7044-7', 'AVI E4'],
      ['3456700124', '', '', '9789025870447', ''],
    ]);
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          ok: true,
          book: {
            line: 3,
            barcode: '3456700123',
            title: 'Dolfje Weerwolfje',
            authors: ['Paul van Loon'],
            isbn: '9789025870447',
            aviLevel: 'E4',
          },
        },
        {
          ok: true,
          book: expect.objectContaining({ line: 4, isbn: '9789025870447', title: undefined }),
        },
      ],
    });
  });

  it('skips rows without a usable barcode, or without title and ISBN', () => {
    const result = parseLibraryList([
      ['streepjescode', 'titel'],
      ['', 'Zonder barcode'],
      ['3456700125', ''],
    ]);
    expect(result).toEqual({
      ok: true,
      rows: [
        { ok: false, line: 2, barcode: '' },
        { ok: false, line: 3, barcode: '3456700125' },
      ],
    });
  });

  it('asks for the right columns when they are missing', () => {
    expect(
      parseLibraryList([
        ['naam', 'klas'],
        ['Lotte', '3B'],
      ]),
    ).toEqual({
      ok: false,
      error: 'missingColumns',
    });
  });
});
