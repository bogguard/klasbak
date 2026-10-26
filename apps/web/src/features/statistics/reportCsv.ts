import type { ExchangeSummary, LoanStatistics } from '@klasbak/shared';
import { toCsv } from '../export/buildExport';
import type { StatisticsSummary } from './summary';

/** Translated section names and labels; the CSV itself knows no language. */
export type ReportLabels = {
  columns: { section: string; item: string; value: string };
  totals: string;
  loans: string;
  perPupil: string;
  activePupils: string;
  activeTeachers: string;
  collection: string;
  titles: string;
  copies: string;
  added: string;
  perMonth: string;
  perClass: string;
  perAvi: string;
  topTitles: string;
  exchanges: string;
};

type Row = { section: string; item: string; value: string | number };

/**
 * The report for the municipality or public library as one CSV ("section; item; value"),
 * which opens in Excel and is easy to copy into their own forms. Anonymous figures only.
 */
export function statisticsCsv(
  stats: LoanStatistics,
  summary: StatisticsSummary,
  labels: ReportLabels,
  exchanges: ExchangeSummary[] = [],
): string {
  const rows: Row[] = [
    { section: labels.totals, item: labels.loans, value: summary.total },
    {
      section: labels.totals,
      item: labels.perPupil,
      value: summary.perPupil === undefined ? '' : summary.perPupil.toFixed(1).replace('.', ','),
    },
    { section: labels.totals, item: labels.activePupils, value: stats.readers.pupils },
    { section: labels.totals, item: labels.activeTeachers, value: stats.readers.teachers },
    { section: labels.collection, item: labels.titles, value: summary.collection.titles },
    { section: labels.collection, item: labels.copies, value: summary.collection.copies },
    { section: labels.collection, item: labels.added, value: summary.collection.added },
    ...stats.months.map((m) => ({ section: labels.perMonth, item: m.month, value: m.loans })),
    ...summary.groups.map((g) => ({ section: labels.perClass, item: g.group, value: g.loans })),
    ...summary.perAvi.map((a) => ({ section: labels.perAvi, item: a.level, value: a.loans })),
    ...summary.topTitles.map((t) => ({ section: labels.topTitles, item: t.title, value: t.loans })),
    ...exchanges.map((e) => ({
      section: labels.exchanges,
      item: `${e.lender} · ${e.name}`,
      value: e.loans,
    })),
  ];
  return toCsv(rows, [
    [labels.columns.section, (r) => r.section],
    [labels.columns.item, (r) => r.item],
    [labels.columns.value, (r) => r.value],
  ]);
}
