import { describe, expect, it } from 'vitest';
import { summarize, type CatalogueTitle } from './summary';

const title = (id: string, addedAt: string, aviLevel?: string): CatalogueTitle => ({
  id,
  type: 'book',
  title: `Boek ${id}`,
  authors: '',
  addedAt,
  aviLevel,
  copies: 2,
});

describe('summarize', () => {
  const catalogue = [
    title('T1', '2026-09-01', 'E3'),
    title('T2', '2026-09-02', 'M3'),
    title('T3', '2026-08-01'),
    title('T4', '2026-10-01'),
  ];
  const summary = summarize(
    {
      months: [
        { month: '2026-09', loans: 4 },
        { month: '2026-10', loans: 6 },
      ],
      titles: [
        { titleId: 'T2', loans: 5 },
        { titleId: 'GONE', loans: 3 },
        { titleId: 'T1', loans: 2 },
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
    expect(summary.total).toBe(10);
    expect(summary.busiestMonth).toEqual({ month: '2026-10', loans: 6 });
    // 9 pupil loans over 6 pupils.
    expect(summary.perPupil).toBe(1.5);
  });

  it('ranks titles that still exist, and lists the others not lent, oldest first', () => {
    expect(summary.topTitles.map((t) => [t.id, t.loans])).toEqual([
      ['T2', 5],
      ['T1', 2],
    ]);
    expect(summary.notLent.map((t) => t.id)).toEqual(['T3', 'T4']);
  });

  it("reports the collection and loans per AVI level in the levels' order", () => {
    // T3 was added in August, before this period (September–October).
    expect(summary.collection).toEqual({ titles: 4, copies: 8, added: 3 });
    expect(summary.perAvi).toEqual([
      { level: 'M3', loans: 5 },
      { level: 'E3', loans: 2 },
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
