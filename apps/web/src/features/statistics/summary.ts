import { AVI_LEVELS, type LoanStatistics, type SearchDocument } from '@klasbak/shared';
import { compareGroups } from '../../lib/format';

/** What the catalogue search index knows about a title (the statistics only have ids). */
export type CatalogueTitle = Pick<
  SearchDocument,
  | 'id'
  | 'type'
  | 'title'
  | 'authors'
  | 'coverImageKey'
  | 'addedAt'
  | 'aviLevel'
  | 'copies'
  | 'exchangeCopies'
>;

/** A title the school owns copies of (not only books on loan from a public library). */
function isOwn(title: CatalogueTitle): boolean {
  const exchange = title.exchangeCopies ?? 0;
  return exchange === 0 || title.copies > exchange;
}

export type StatisticsSummary = {
  total: number;
  /** Pupils' loans per active pupil; undefined without pupils in a class. */
  perPupil?: number;
  busiestMonth?: { month: string; loans: number };
  /** `removed`: no longer in the catalogue (e.g. an exchange collection that went back). */
  topTitles: Array<CatalogueTitle & { loans: number; removed?: boolean }>;
  groups: Array<LoanStatistics['groups'][number] & { perPupil?: number }>;
  /** The school's own titles not lent in this period, oldest first (candidates for weeding). */
  notLent: CatalogueTitle[];
  /** The school's own collection now, and its titles added in the period. */
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
    // A title that left the catalogue still counts, with the name it had when lent.
    .flatMap(({ titleId, loans, title: name }) => {
      const title = byId.get(titleId);
      if (title) return [{ ...title, loans }];
      if (!name) return [];
      const removed = { id: titleId, type: 'book' as const, title: name, authors: '' };
      return [{ ...removed, addedAt: '', copies: 0, loans, removed: true }];
    })
    .slice(0, topCount);

  const own = catalogue.filter(isOwn);
  const lent = new Set(stats.titles.map((t) => t.titleId));
  const notLent = own
    .filter((title) => !lent.has(title.id))
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt));

  const groups = stats.groups
    .map((g) => ({ ...g, perPupil: g.pupils > 0 ? g.loans / g.pupils : undefined }))
    .sort((a, b) => compareGroups(a.group, b.group));
  const pupils = groups.reduce((sum, g) => sum + g.pupils, 0);
  const pupilLoans = groups.reduce((sum, g) => sum + g.loans, 0);

  // Counted at loan time with the title's level, so books that left the catalogue still count.
  const aviLoans = new Map(stats.avi.map((a) => [a.level, a.loans]));

  return {
    total,
    collection: {
      titles: own.length,
      copies: own.reduce((sum, t) => sum + (t.copies ?? 0) - (t.exchangeCopies ?? 0), 0),
      added: own.filter((t) => t.addedAt.slice(0, 7) >= from && t.addedAt.slice(0, 7) <= to).length,
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
