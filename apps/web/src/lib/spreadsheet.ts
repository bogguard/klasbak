import { strFromU8, unzipSync } from 'fflate';

/*
 * Reads spreadsheets as rows of text: CSV (any separator) and the first sheet of an Excel
 * workbook (.xlsx), so schools can import exports from their administration software or the
 * public library's lists as they are, without "save as CSV" first.
 * An .xlsx file is a ZIP of XML files; Excel writes them in a regular way, so a few patterns
 * are enough. Formulas give their last calculated value. Old .xls files are not supported.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(xml: string): string {
  return xml.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
    return ENTITIES[entity] ?? match;
  });
}

/** All text in an element, also when Excel splits it into formatted runs. */
function textOf(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => decode(m[1] ?? ''))
    .join('');
}

/** "C7" → 2 (zero-based column). */
function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? 'A';
  return [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function firstSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (workbook && rels) {
    const id = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(strFromU8(workbook))?.[1];
    const target = id
      ? (new RegExp(`<Relationship\\b[^>]*\\bId="${id}"[^>]*\\bTarget="([^"]+)"`).exec(
          strFromU8(rels),
        )?.[1] ??
        new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${id}"`).exec(
          strFromU8(rels),
        )?.[1])
      : undefined;
    if (target) return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  return 'xl/worksheets/sheet1.xml';
}

export function readXlsx(data: Uint8Array): string[][] {
  const files = unzipSync(data);
  const shared = files['xl/sharedStrings.xml'];
  const strings = shared
    ? [...strFromU8(shared).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? ''))
    : [];
  const sheet = files[firstSheetPath(files)];
  if (!sheet) throw new Error('No worksheet found');

  const rows: string[][] = [];
  for (const row of strFromU8(sheet).matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1] ?? '';
      const body = cell[2] ?? '';
      const reference = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
      const type = /\bt="(\w+)"/.exec(attributes)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const value =
        type === 's'
          ? (strings[Number(raw)] ?? '')
          : type === 'inlineStr'
            ? textOf(body)
            : decode(raw ?? '');
      cells[reference ? columnIndex(reference) : cells.length] = value;
    }
    rows.push(Array.from(cells, (value) => value ?? ''));
  }
  return rows;
}

/** Excel adds this invisible character at the start of UTF-8 files. */
const BYTE_ORDER_MARK = new RegExp(`^${String.fromCharCode(0xfeff)}`);

/** Splits CSV text into records and cells, handling quotes, and guesses the separator. */
export function splitRecords(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = [';', '\t', ','].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  );

  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      record.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || record.length > 0) {
    record.push(cell);
    records.push(record);
  }
  return records;
}

export type SpreadsheetResult =
  { ok: true; rows: string[][] } | { ok: false; error: 'oldExcel' | 'unreadable' };

/** A file the user picked → rows of cells. Old binary .xls files can't be read. */
export async function readSpreadsheet(file: File): Promise<SpreadsheetResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) return { ok: false, error: 'oldExcel' };
  try {
    return {
      ok: true,
      rows: name.endsWith('.xlsx')
        ? readXlsx(new Uint8Array(await file.arrayBuffer()))
        : splitRecords((await file.text()).replace(BYTE_ORDER_MARK, '')),
    };
  } catch {
    return { ok: false, error: 'unreadable' };
  }
}

export const SPREADSHEET_ACCEPT =
  '.xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
