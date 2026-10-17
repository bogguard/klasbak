import { describe, expect, it } from 'vitest';
import { summarize, type CatalogueTitle } from './summary';

const title = (
  id: string,
  addedAt: string,
  aviLevel?: string,
  exchangeCopies?: number,
): CatalogueTitle => ({
  id,
  type: 'book',
  title: `Boek ${id}`,
  authors: '',
  addedAt,
  aviLevel,
  copies: 2,
  exchangeCopies,
});

describe('summarize', () => {
  const catalogue = [
    title('T1', '2026-09-01', 'E3'),
    title('T2', '2026-09-02', 'M3'),
    title('T3', '2026-08-01'),
    title('T4', '2026-10-01'),
    // From a public library: one exchange copy next to a school copy, and one only borrowed.
    title('MIX', '2026-09-05', undefined, 1),
    title('BIB', '2026-10-03', undefined, 2),
  ];
  const summary = summarize(
    {
      months: [
        { month: '2026-09', loans: 4 },
        { month: '2026-10', loans: 6 },
      ],
      titles: [
        { titleId: 'T2', loans: 5 },
        // Lent from an exchange collection that has gone back since.
        { titleId: 'GONE', loans: 3, title: 'Van de bib' },
        { titleId: 'T1', loans: 2 },
        { titleId: 'MIX', loans: 1 },
        { titleId: 'BIB', loans: 1 },
      ],
      avi: [
        { level: 'E3', loans: 2 },
        { level: 'M3', loans: 5 },
        { level: 'E4', loans: 3 },
      ],
      groups: [
        { group: '10A', loans: 2, pupils: 4 },
        { group: '2B', loans: 6, pupils: 2 },
        { group: 'Oud', loans: 1, pupils: 0 },
      ],
      readers: { pupils: 6, teachers: 1 },
    },
    catalogue,
  );

  it('adds up the totals and finds the busiest month', () => {
    expect(summary.total).toBe(10); // the months' totals, whatever happened to the titles
    expect(summary.busiestMonth).toEqual({ month: '2026-10', loans: 6 });
    // 9 pupil loans over 6 pupils.
    expect(summary.perPupil).toBe(1.5);
  });

  it('ranks titles by loans, also those that left the catalogue (by the name they had)', () => {
    expect(summary.topTitles.map((t) => [t.title, t.loans, t.removed ?? false])).toEqual([
      ['Boek T2', 5, false],
      ['Van de bib', 3, true],
      ['Boek T1', 2, false],
      ['Boek MIX', 1, false],
      ['Boek BIB', 1, false],
    ]);
  });

  it("suggests only the school's own titles for weeding, oldest first", () => {
    expect(summary.notLent.map((t) => t.id)).toEqual(['T3', 'T4']);
  });

  it("counts the school's own collection, without books on loan from a library", () => {
    // Own titles: T1–T4 and MIX; copies: 4 × 2 + 1 (MIX's own copy). T3 is from August.
    expect(summary.collection).toEqual({ titles: 5, copies: 9, added: 4 });
  });

  it("reports loans per AVI level as counted when lent, in the levels' order", () => {
    expect(summary.perAvi).toEqual([
      { level: 'M3', loans: 5 },
      { level: 'E3', loans: 2 },
      { level: 'E4', loans: 3 },
    ]);
  });

  it('sorts classes naturally, without an average for classes without pupils now', () => {
    expect(summary.groups.map((g) => [g.group, g.perPupil])).toEqual([
      ['2B', 3],
      ['10A', 0.5],
      ['Oud', undefined],
    ]);
  });
});
