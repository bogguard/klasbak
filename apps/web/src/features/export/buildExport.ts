import type { Copy, ExportRecord, Loan, Reader, Title } from '@library/shared';
import { strToU8, zipSync } from 'fflate';

/*
 * Turns the export into a ZIP the school can open without help: one CSV per kind of record
 * (opens straight in Excel) plus the complete data as JSON (for another system).
 */

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

type Column<T> = [header: string, value: (row: T) => unknown];

/** Belgian Excel expects ";"; the byte-order mark makes it read UTF-8 accents correctly. */
export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const cell = (value: unknown) => {
    const text = value === undefined || value === null ? '' : String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    columns.map(([header]) => cell(header)).join(';'),
    ...rows.map((row) => columns.map(([, value]) => cell(value(row))).join(';')),
  ];
  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}

const list = (values: string[] | undefined) => (values ?? []).join(' | ');

export function buildExportZip(records: ExportRecord[], exportedAt: Date): Uint8Array {
  const of = <K extends ExportRecord['kind']>(kind: K) =>
    records
      .filter((r): r is Extract<ExportRecord, { kind: K }> => r.kind === kind)
      .map((r) => r.data);
  const titles = of('title') as Title[];
  const copies = of('copy') as Copy[];
  const readers = of('reader') as Reader[];
  const loans = of('loan') as Loan[];
  const titleById = new Map(titles.map((t) => [t.id, t.title]));
  const memberNumberById = new Map(readers.map((r) => [r.id, r.memberNumber]));

  const files: Record<string, string> = {
    'titels.csv': toCsv(titles, [
      ['id', (t) => t.id],
      ['soort', (t) => t.type],
      ['titel', (t) => t.title],
      ['ondertitel', (t) => t.subtitle],
      ['auteurs', (t) => list(t.authors)],
      ['uitgeverij', (t) => t.publisher],
      ['jaar', (t) => t.publishedYear],
      ['isbn', (t) => t.isbn],
      ['taal', (t) => t.language],
      ['onderwerpen', (t) => list(t.subjects)],
      ['avi', (t) => t.aviLevel],
      ['zizo', (t) => t.zizoLevel],
      ['leeftijd_van', (t) => t.ageMin],
      ['leeftijd_tot', (t) => t.ageMax],
      ['samenvatting', (t) => t.summary],
      ['toegevoegd', (t) => t.createdAt],
    ]),
    'exemplaren.csv': toCsv(copies, [
      ['barcode', (c) => c.barcode],
      ['titel_id', (c) => c.titleId],
      ['titel', (c) => titleById.get(c.titleId)],
      ['status', (c) => c.status],
      ['plaats', (c) => c.location],
      ['opmerking', (c) => c.note],
      ['toegevoegd', (c) => c.createdAt],
    ]),
    'lezers.csv': toCsv(readers, [
      ['kaartnummer', (r) => r.memberNumber],
      ['voornaam', (r) => r.firstName],
      ['achternaam', (r) => r.lastName],
      ['klas', (r) => r.group],
      ['soort', (r) => r.category],
      ['e-mail', (r) => r.email],
      ['actief', (r) => (r.active ? 'ja' : 'nee')],
      ['toegevoegd', (r) => r.createdAt],
    ]),
    'uitleningen.csv': toCsv(loans, [
      ['kaartnummer', (l) => memberNumberById.get(l.readerId)],
      ['lezer', (l) => l.readerName],
      ['klas', (l) => l.readerGroup],
      ['barcode', (l) => l.barcode],
      ['titel', (l) => l.titleTitle],
      ['uitgeleend', (l) => l.loanedAt],
      ['terug_op', (l) => l.dueDate],
      ['verlengd', (l) => l.renewals ?? 0],
      ['teruggebracht', (l) => l.returnedAt],
    ]),
    'alles.json': JSON.stringify(
      {
        exportedAt: exportedAt.toISOString(),
        titles,
        copies,
        readers,
        loans,
        settings: of('settings')[0],
      },
      null,
      2,
    ),
  };
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])),
  );
}
