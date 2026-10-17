import { strFromU8, unzipSync } from 'fflate';

/*
 * Reads the first sheet of an Excel workbook (.xlsx) as rows of text, so schools can import
 * the export from their administration software as is, without "save as CSV" first.
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
