import { AVI_LEVELS, type LoanStatistics, type SearchDocument } from '@library/shared';
import { compareGroups } from '../../lib/format';

/** What the catalogue search index knows about a title (the statistics only have ids). */
export type CatalogueTitle = Pick<
  SearchDocument,
  'id' | 'type' | 'title' | 'authors' | 'coverImageKey' | 'addedAt' | 'aviLevel' | 'copies'
>;

export type StatisticsSummary = {
  total: number;
  /** Pupils' loans per active pupil; undefined without pupils in a class. */
  perPupil?: number;
  busiestMonth?: { month: string; loans: number };
  topTitles: Array<CatalogueTitle & { loans: number }>;
  groups: Array<LoanStatistics['groups'][number] & { perPupil?: number }>;
  /** In the catalogue but not lent in this period, oldest first (candidates for weeding). */
  notLent: CatalogueTitle[];
  /** The collection now, and titles added in the period. */
  collection: { titles: number; copies: number; added: number };
  /** Loans per AVI reading level, in the levels' own order; only levels with loans. */
  perAvi: Array<{ level: string; loans: number }>;
};

export function summarize(
  stats: LoanStatistics,
  catalogue: CatalogueTitle[],
  topCount = 10,
): StatisticsSummary {
  const from = stats.months[0]?.month ?? '';
  const to = stats.months.at(-1)?.month ?? '';
  const total = stats.months.reduce((sum, m) => sum + m.loans, 0);
  const busiest = stats.months.reduce<StatisticsSummary['busiestMonth']>(
    (best, m) => (m.loans > (best?.loans ?? 0) ? m : best),
    undefined,
  );

  const byId = new Map(catalogue.map((title) => [title.id, title]));
  const topTitles = stats.titles
    // Titles deleted since are left out: there's nothing to show or link to.
    .flatMap(({ titleId, loans }) => {
      const title = byId.get(titleId);
      return title ? [{ ...title, loans }] : [];
    })
    .slice(0, topCount);

  const lent = new Set(stats.titles.map((t) => t.titleId));
  const notLent = catalogue
    .filter((title) => !lent.has(title.id))
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt));

  const groups = stats.groups
    .map((g) => ({ ...g, perPupil: g.pupils > 0 ? g.loans / g.pupils : undefined }))
    .sort((a, b) => compareGroups(a.group, b.group));
  const pupils = groups.reduce((sum, g) => sum + g.pupils, 0);
  const pupilLoans = groups.reduce((sum, g) => sum + g.loans, 0);

  const aviLoans = new Map<string, number>();
  for (const { titleId, loans } of stats.titles) {
    const level = byId.get(titleId)?.aviLevel;
    if (level) aviLoans.set(level, (aviLoans.get(level) ?? 0) + loans);
  }

  return {
    total,
    collection: {
      titles: catalogue.length,
      copies: catalogue.reduce((sum, title) => sum + (title.copies ?? 0), 0),
      added: catalogue.filter((t) => t.addedAt.slice(0, 7) >= from && t.addedAt.slice(0, 7) <= to)
        .length,
    },
    perAvi: AVI_LEVELS.filter((level) => aviLoans.has(level)).map((level) => ({
      level,
      loans: aviLoans.get(level) ?? 0,
    })),
    perPupil: pupils > 0 ? pupilLoans / pupils : undefined,
    busiestMonth: busiest,
    topTitles,
    groups,
    notLent,
  };
}
