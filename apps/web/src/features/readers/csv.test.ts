import { describe, expect, it } from 'vitest';
import { parseReaderRecords, parseReadersCsv } from './csv';
import { strToU8, zipSync } from 'fflate';
import { readXlsx } from '../../lib/spreadsheet';

describe('parseReadersCsv', () => {
  it('reads a Belgian Excel export (semicolons, Dutch headers, BOM)', () => {
    const csv = `${String.fromCharCode(0xfeff)}Voornaam;Achternaam;Klas\r\nLotte;Peeters;3B\r\nNoah;Janssens;3B\r\n`;
    const result = parseReadersCsv(csv);
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          ok: true,
          reader: expect.objectContaining({
            firstName: 'Lotte',
            lastName: 'Peeters',
            group: '3B',
            category: 'pupil',
          }),
        },
        { line: 3, ok: true, reader: expect.objectContaining({ firstName: 'Noah' }) },
      ],
    });
  });

  it('handles commas, quotes, any column order and optional columns', () => {
    const csv = [
      'email,last name,first name,card,role',
      'an@school.be,"Wouters, sr.",An,K-100,Leerkracht',
    ].join('\n');
    const result = parseReadersCsv(csv);
    expect(result.ok && result.rows[0]).toEqual({
      line: 2,
      ok: true,
      reader: expect.objectContaining({
        lastName: 'Wouters, sr.',
        memberNumber: 'K-100',
        email: 'an@school.be',
        category: 'teacher',
      }),
    });
  });

  it('marks invalid rows instead of failing the whole file, and skips empty lines', () => {
    const result = parseReadersCsv(
      'voornaam;achternaam;e-mail\nLotte;;\n;;\nNoah;Janssens;geen-mail',
    );
    expect(result.ok && result.rows.map((r) => [r.line, r.ok])).toEqual([
      [2, false],
      [4, false],
    ]);
  });

  it('explains when required columns are missing', () => {
    expect(parseReadersCsv('klas;nummer\n3B;1')).toEqual({ ok: false, error: 'missingColumns' });
    expect(parseReadersCsv('')).toEqual({ ok: false, error: 'empty' });
  });
});

describe('school administration exports', () => {
  it('finds the header below a title row and reads the school number and class group', () => {
    const result = parseReaderRecords([
      ['Leerlingenlijst 2026-2027', '', '', ''],
      [],
      ['Stamboeknr.', 'Naam', 'Voornaam', 'Klasgroep'],
      ['1234567', 'Peeters', 'Lotte', '3B'],
    ]);
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          line: 4,
          ok: true,
          reader: expect.objectContaining({
            firstName: 'Lotte',
            lastName: 'Peeters',
            group: '3B',
            schoolNumber: '1234567',
          }),
        },
      ],
    });
  });
});

describe('readXlsx', () => {
  it('reads the first sheet, with shared strings, inline text, numbers and gaps', () => {
    const sheet = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Klas</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1234567</v></c><c r="C2" s="1"/><c r="D2" t="s"><v>3</v></c></row>
    </sheetData></worksheet>`;
    const strings = `<sst><si><t>Voornaam</t></si><si><r><t>Stam</t></r><r><t>nummer</t></r></si><si><t>Zoë &amp; co</t></si><si><t>3B</t></si></sst>`;
    const file = zipSync({
      'xl/worksheets/sheet1.xml': strToU8(sheet),
      'xl/sharedStrings.xml': strToU8(strings),
    });

    expect(readXlsx(file)).toEqual([
      ['Voornaam', 'Stamnummer', '', 'Klas'],
      ['Zoë & co', '1234567', '', '3B'],
    ]);
  });
});
