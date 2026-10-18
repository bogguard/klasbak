import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildExportZip, toCsv } from './buildExport';

describe('toCsv', () => {
  it('uses semicolons, quotes where needed and starts with a byte-order mark for Excel', () => {
    const csv = toCsv(
      [{ a: 'Wouters; An', b: 'zegt "hallo"' }],
      [
        ['naam', (r) => r.a],
        ['tekst', (r) => r.b],
      ],
    );
    expect(csv).toBe(
      `${String.fromCharCode(0xfeff)}naam;tekst\r\n"Wouters; An";"zegt ""hallo"""\r\n`,
    );
  });
});

describe('toCsv against formula injection', () => {
  it('makes text that Excel would run as a formula plain text, but keeps numbers', () => {
    const csv = toCsv(
      [
        { name: '=HYPERLINK("https://evil.example","klik")' },
        { name: '+32 9 123' },
        { name: '@SUM(A1)' },
        { name: -3 },
      ],
      [['naam', (r) => r.name]],
    );
    expect(csv.split('\r\n').slice(1, 5)).toEqual([
      `"'=HYPERLINK(""https://evil.example"",""klik"")"`,
      "'+32 9 123",
      "'@SUM(A1)",
      '-3',
    ]);
  });
});

describe('buildExportZip', () => {
  it('puts every kind of record in its own CSV, plus everything as JSON', () => {
    const zip = buildExportZip(
      [
        {
          kind: 'title',
          data: {
            id: 'T1',
            type: 'book',
            title: 'Dolfje',
            authors: ['Paul van Loon'],
            language: 'nl',
            subjects: [],
            createdAt: '',
            updatedAt: '',
            version: 1,
          },
        },
        {
          kind: 'copy',
          data: {
            id: 'C1',
            titleId: 'T1',
            barcode: '00000001',
            status: 'onLoan',
            createdAt: '',
            updatedAt: '',
          },
        },
        {
          kind: 'reader',
          data: {
            id: 'R1',
            memberNumber: 'L000001',
            firstName: 'Lotte',
            lastName: 'Peeters',
            category: 'pupil',
            active: true,
            activeLoanCount: 1,
            createdAt: '',
            updatedAt: '',
            version: 1,
          },
        },
        {
          kind: 'loan',
          data: {
            id: 'LN1',
            readerId: 'R1',
            readerName: 'Lotte Peeters',
            titleId: 'T1',
            titleTitle: 'Dolfje',
            copyId: 'C1',
            barcode: '00000001',
            loanedAt: '2026-10-01',
            dueDate: '2026-10-22',
          },
        },
      ],
      new Date('2026-10-16T10:00:00Z'),
    );

    const files = Object.fromEntries(
      Object.entries(unzipSync(zip)).map(([name, bytes]) => [name, strFromU8(bytes)]),
    );
    expect(Object.keys(files).sort()).toEqual([
      'alles.json',
      'exemplaren.csv',
      'lezers.csv',
      'titels.csv',
      'uitleningen.csv',
    ]);
    expect(files['exemplaren.csv']).toContain('00000001;T1;Dolfje;onLoan');
    expect(files['uitleningen.csv']).toContain('L000001;Lotte Peeters;;00000001;Dolfje');
    expect(JSON.parse(files['alles.json'] ?? '{}').readers[0].firstName).toBe('Lotte');
  });
});
