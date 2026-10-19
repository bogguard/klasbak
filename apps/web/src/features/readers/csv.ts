import { ReaderInputSchema, type ReaderInput } from '@library/shared';
import { splitRecords } from '../../lib/spreadsheet';

/*
 * Reads class lists exported from spreadsheets or school administration software (e.g. the
 * pupil exports of Informat, Wisa or Smartschool, as CSV or as rows read from Excel).
 * Belgian Excel uses ";" as separator, others ","; both work, as do tabs. Column names are
 * recognised in Dutch and English, in any order, and the header may be below a title row.
 */

const COLUMN_ALIASES: Record<keyof ReaderRow, string[]> = {
  firstName: ['voornaam', 'roepnaam', 'firstname', 'first name', 'given name'],
  lastName: ['achternaam', 'familienaam', 'naam', 'lastname', 'last name', 'surname'],
  group: [
    'klas',
    'klasgroep',
    'klasnaam',
    'klascode',
    'groep',
    'afdeling',
    'dienst',
    'departement',
    'team',
    'class',
    'group',
    'department',
  ],
  schoolNumber: [
    'stamboeknummer',
    'stamboeknr',
    'stamnummer',
    'stamnr',
    'leerlingnummer',
    'leerlingnr',
    'personeelsnummer',
    'werknemersnummer',
    'employee number',
    'staff number',
    'student number',
    'student id',
  ],
  memberNumber: ['kaartnummer', 'lidnummer', 'bibnummer', 'membernumber', 'member number', 'card'],
  email: ['e-mail', 'email', 'mail', 'e-mailadres', 'emailadres'],
  category: ['soort', 'type', 'rol', 'category', 'role'],
};

type ReaderRow = Pick<
  ReaderInput,
  'firstName' | 'lastName' | 'group' | 'schoolNumber' | 'memberNumber' | 'email' | 'category'
>;

export type ParsedRow =
  | { line: number; ok: true; reader: ReaderInput }
  | { line: number; ok: false; reason: 'invalid'; values: Record<string, string> };

export type CsvParseResult =
  { ok: true; rows: ParsedRow[] } | { ok: false; error: 'empty' | 'missingColumns' };

/** Excel adds this invisible character at the start of UTF-8 files. */
const BYTE_ORDER_MARK = new RegExp(`^${String.fromCharCode(0xfeff)}`);

export function parseReadersCsv(text: string, teacherNames: string[] = []): CsvParseResult {
  return parseReaderRecords(splitRecords(text.replace(BYTE_ORDER_MARK, '')), teacherNames);
}

/** Rows of cells (from CSV or Excel) → readers. The header is the first row naming both names. */
/**
 * `teacherNames`: the library's own words for its second reader type (e.g. "partner"), so a
 * "soort" column with those words is read as that type too.
 */
export function parseReaderRecords(lines: string[][], teacherNames: string[] = []): CsvParseResult {
  const headerIndex = lines.slice(0, 10).findIndex((cells) => {
    const columns = mapColumns(cells);
    return columns.firstName !== undefined && columns.lastName !== undefined;
  });
  if (lines.filter((cells) => cells.some((c) => c.trim() !== '')).length < 2) {
    return { ok: false, error: 'empty' };
  }
  const header = lines[headerIndex];
  if (headerIndex < 0 || !header) return { ok: false, error: 'missingColumns' };
  const columns = mapColumns(header);

  const rows = lines.slice(headerIndex + 1).flatMap((cells, i): ParsedRow[] => {
    if (cells.every((cell) => cell.trim() === '')) return [];
    const value = (field: keyof ReaderRow) => {
      const index = columns[field];
      const cell = index === undefined ? '' : (cells[index] ?? '').trim();
      return cell === '' ? undefined : cell;
    };
    const candidate = {
      firstName: value('firstName'),
      lastName: value('lastName'),
      group: value('group'),
      schoolNumber: value('schoolNumber'),
      memberNumber: value('memberNumber'),
      email: value('email'),
      category: toCategory(value('category'), teacherNames),
    };
    const parsed = ReaderInputSchema.safeParse(candidate);
    const line = headerIndex + i + 2; // 1-based, after the header: as people see it in Excel
    return parsed.success
      ? [{ line, ok: true, reader: parsed.data }]
      : [
          {
            line,
            ok: false,
            reason: 'invalid',
            values: Object.fromEntries(Object.entries(candidate).map(([k, v]) => [k, v ?? ''])),
          },
        ];
  });
  return { ok: true, rows };
}

function mapColumns(header: string[]): Partial<Record<keyof ReaderRow, number>> {
  // "Stamboeknr." and " Klas " are the same columns as "stamboeknr" and "klas".
  const normalized = header.map((h) =>
    h
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[.:]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  const result: Partial<Record<keyof ReaderRow, number>> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof ReaderRow, string[]][]) {
    const index = normalized.findIndex((h) => aliases.includes(h));
    if (index >= 0) result[field] = index;
  }
  return result;
}

function toCategory(
  value: string | undefined,
  teacherNames: string[],
): ReaderInput['category'] | undefined {
  if (!value) return undefined;
  const word = value.trim().toLocaleLowerCase('nl');
  if (teacherNames.some((name) => name.toLocaleLowerCase('nl') === word)) return 'teacher';
  return /^(leerkracht|leraar|juf|meester|teacher|staff|personeel)/i.test(value)
    ? 'teacher'
    : 'pupil';
}
