import { describe, expect, it } from 'vitest';
import { parseReadersCsv } from './csv';

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
