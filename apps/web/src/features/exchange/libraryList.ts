import {
  AVI_LEVELS,
  CodeSchema,
  isValidIsbn,
  toIsbn13,
  type AviLevelSchema,
} from '@klasbak/shared';
import type { z } from 'zod';

/*
 * Reads the list a public library sends with an exchange collection (Excel or CSV): one row
 * per book with its barcode and a title and/or ISBN. Column names are recognised in Dutch and
 * English, in any order, below any title rows.
 */

const COLUMNS = {
  barcode: [
    'barcode',
    'streepjescode',
    'exemplaarnummer',
    'exemplaar',
    'barcode exemplaar',
    'itemnummer',
    'item',
  ],
  title: ['titel', 'title', 'hoofdtitel'],
  authors: ['auteur', 'auteurs', 'author', 'authors', 'schrijver'],
  isbn: ['isbn', 'isbn13', 'isbn-13', 'ean'],
  avi: ['avi', 'avi-niveau', 'avi niveau', 'leesniveau'],
} as const;

type Field = keyof typeof COLUMNS;

export type ListBook = {
  line: number;
  barcode: string;
  title?: string;
  authors: string[];
  isbn?: string;
  aviLevel?: z.infer<typeof AviLevelSchema>;
};

export type ListRow = { ok: true; book: ListBook } | { ok: false; line: number; barcode: string };

export type LibraryListResult =
  { ok: true; rows: ListRow[] } | { ok: false; error: 'empty' | 'missingColumns' };

function normalise(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapColumns(header: string[]): Partial<Record<Field, number>> {
  const names = header.map(normalise);
  const result: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(COLUMNS) as Field[]) {
    const index = names.findIndex((name) => (COLUMNS[field] as readonly string[]).includes(name));
    if (index >= 0) result[field] = index;
  }
  return result;
}

/** "AVI E4", "e4" or "E 4" → "E4"; anything else is left out. */
function toAvi(value: string): ListBook['aviLevel'] {
  const cleaned = value.replace(/^avi/i, '').replace(/\s+/g, '').toUpperCase();
  return AVI_LEVELS.find((level) => level.toUpperCase() === cleaned);
}

export function parseLibraryList(lines: string[][]): LibraryListResult {
  if (lines.filter((cells) => cells.some((c) => c.trim() !== '')).length < 2) {
    return { ok: false, error: 'empty' };
  }
  // The header is the first row naming the barcode and a title or ISBN.
  const headerIndex = lines.slice(0, 10).findIndex((cells) => {
    const columns = mapColumns(cells);
    return (
      columns.barcode !== undefined && (columns.title !== undefined || columns.isbn !== undefined)
    );
  });
  const header = lines[headerIndex];
  if (headerIndex < 0 || !header) return { ok: false, error: 'missingColumns' };
  const columns = mapColumns(header);

  const rows = lines.slice(headerIndex + 1).flatMap((cells, i): ListRow[] => {
    if (cells.every((cell) => cell.trim() === '')) return [];
    const value = (field: Field) => {
      const index = columns[field];
      const cell = index === undefined ? '' : (cells[index] ?? '').trim();
      return cell === '' ? undefined : cell;
    };
    const line = headerIndex + i + 2;
    const barcode = value('barcode') ?? '';
    const isbnText = value('isbn');
    const isbn = isbnText && isValidIsbn(isbnText) ? toIsbn13(isbnText) : undefined;
    const title = value('title');
    if (!CodeSchema.safeParse(barcode).success || (!title && !isbn)) {
      return [{ ok: false, line, barcode }];
    }
    const authors = (value('authors') ?? '')
      .split(/;|\s+&\s+|\s+en\s+/)
      .map((a) => a.trim())
      .filter(Boolean);
    const avi = value('avi');
    return [
      {
        ok: true,
        book: {
          line,
          barcode: barcode.trim(),
          title,
          authors,
          isbn,
          aviLevel: avi ? toAvi(avi) : undefined,
        },
      },
    ];
  });
  return { ok: true, rows };
}
