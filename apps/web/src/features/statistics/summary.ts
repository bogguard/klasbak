import type { LoanStatistics, SearchDocument } from '@library/shared';
import { compareGroups } from '../../lib/format';

/** What the catalogue search index knows about a title (the statistics only have ids). */
export type CatalogueTitle = Pick<
  SearchDocument,
  'id' | 'type' | 'title' | 'authors' | 'coverImageKey' | 'addedAt'
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
};

export function summarize(
  stats: LoanStatistics,
  catalogue: CatalogueTitle[],
  topCount = 10,
): StatisticsSummary {
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

  return {
    total,
    perPupil: pupils > 0 ? pupilLoans / pupils : undefined,
    busiestMonth: busiest,
    topTitles,
    groups,
    notLent,
  };
}
