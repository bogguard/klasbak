import { localDate, schoolYear } from '@library/shared';
import MiniSearch from 'minisearch';
import { BarChart3, Download, Printer, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, Skeleton, StatusMessage, useErrorMessage } from '../../components/ui/Feedback';
import { TitleCover } from '../catalog/TitleCover';
import { useSearchIndex } from '../catalog/useSearchIndex';
import { useConfig } from '../../lib/config';
import { formatDate } from '../../lib/format';
import { useStatistics } from '../circulation/api';
import { useExchanges } from '../exchange/api';
import { statisticsCsv } from './reportCsv';
import { summarize, type CatalogueTitle } from './summary';

/** The current school year and the two before it. */
function schoolYears(today: string) {
  const current = schoolYear(today);
  const start = Number(current.from.slice(0, 4));
  return [0, 1, 2].map((back) => ({
    from: `${start - back}-09`,
    to: `${start - back + 1}-08`,
    label: `${start - back}–${start - back + 1}`,
  }));
}

/**
 * Anonymous figures for the librarian (decision 028): what is read, when and per class.
 * Never per pupil: a ranking of children is profiling, and the counters don't know who read.
 * Printed (or saved as PDF) and downloaded as CSV, it is also the report for the municipality
 * or the public library.
 */
export function StatisticsPage() {
  const { t, i18n } = useTranslation();
  const years = useMemo(() => schoolYears(localDate()), []);
  const [yearIndex, setYearIndex] = useState(0);
  const year = years[yearIndex] ?? years[0];
  const stats = useStatistics({ from: year?.from ?? '', to: year?.to ?? '' });
  const index = useSearchIndex();
  const errorMessage = useErrorMessage();
  const { libraryName } = useConfig();
  const exchanges = useExchanges();
  // Exchange collections that were at the school during this school year.
  const yearExchanges = (exchanges.data ?? []).filter(
    (e) =>
      year &&
      e.createdAt.slice(0, 7) <= year.to &&
      (e.returnedOn ?? e.returnBy).slice(0, 7) >= year.from,
  );

  const summary = useMemo(() => {
    if (!stats.data || !index.data) return undefined;
    const catalogue = index.data.search(MiniSearch.wildcard) as unknown as CatalogueTitle[];
    return summarize(stats.data, catalogue);
  }, [stats.data, index.data]);

  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  const monthName = (month: string, style: 'short' | 'long' = 'short') =>
    new Intl.DateTimeFormat(i18n.language, { month: style, timeZone: 'UTC' }).format(
      new Date(`${month}-15T00:00:00Z`),
    );

  function downloadCsv() {
    if (!stats.data || !summary || !year) return;
    const csv = statisticsCsv(
      stats.data,
      summary,
      {
        columns: {
          section: t('statistics.report.section'),
          item: t('statistics.report.item'),
          value: t('statistics.report.value'),
        },
        totals: t('statistics.report.totals'),
        loans: t('statistics.total'),
        perPupil: t('statistics.perPupil'),
        activePupils: t('statistics.activePupils'),
        activeTeachers: t('statistics.activeTeachers'),
        collection: t('statistics.collection'),
        titles: t('statistics.titles'),
        copies: t('statistics.copies'),
        added: t('statistics.added'),
        perMonth: t('statistics.perMonth'),
        perClass: t('statistics.perClass'),
        perAvi: t('statistics.perAvi'),
        topTitles: t('statistics.topTitles'),
        exchanges: t('statistics.exchanges'),
      },
      yearExchanges,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t('statistics.report.fileName')}-${year.label}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* On paper: whose figures, which period, printed when. */}
      <p className="hidden text-sm print:block">
        {t('statistics.report.printHeader', {
          library: libraryName,
          year: year?.label,
          date: formatDate(localDate(), i18n.language),
        })}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('statistics.heading')}
          <span className="hidden print:inline"> {year?.label}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {summary && summary.total > 0 && (
            <>
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden="true" />
                {t('statistics.report.print')}
              </Button>
              <Button variant="secondary" onClick={downloadCsv}>
                <Download className="size-4" aria-hidden="true" />
                CSV
              </Button>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-muted">
            {t('statistics.schoolYear')}
            <select
              value={yearIndex}
              onChange={(e) => setYearIndex(Number(e.target.value))}
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink"
            >
              {years.map((y, i) => (
                <option key={y.from} value={i}>
                  {y.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p className="max-w-2xl text-muted print:hidden">{t('statistics.intro')}</p>

      {stats.isError || index.isError ? (
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(stats.error ?? index.error)}
          action={
            <Button onClick={() => void Promise.all([stats.refetch(), index.refetch()])}>
              {t('errors.retry')}
            </Button>
          }
        />
      ) : !summary || !stats.data ? (
        <Skeleton className="h-96 w-full" />
      ) : summary.total === 0 ? (
        <StatusMessage icon={<BarChart3 className="size-6" />} title={t('statistics.empty')}>
          {t('statistics.emptyHint')}
        </StatusMessage>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-3 print:grid-cols-3">
            <Tile label={t('statistics.total')} value={number(summary.total)} />
            <Tile
              label={t('statistics.perPupil')}
              value={summary.perPupil === undefined ? '—' : number(summary.perPupil, 1)}
            />
            <Tile
              label={t('statistics.busiestMonth')}
              value={summary.busiestMonth ? monthName(summary.busiestMonth.month, 'long') : '—'}
            />
            <Tile
              label={t('statistics.activeReaders')}
              value={`${t('statistics.pupilsCount', { count: stats.data.readers.pupils })}, ${t('statistics.teachersCount', { count: stats.data.readers.teachers })}`}
              small
            />
            <Tile
              label={t('statistics.collection')}
              value={t('statistics.collectionValue', {
                titles: number(summary.collection.titles),
                copies: number(summary.collection.copies),
              })}
              small
            />
            <Tile label={t('statistics.added')} value={number(summary.collection.added)} small />
          </dl>

          <section aria-labelledby="per-month" className="space-y-3 break-inside-avoid">
            <h2 id="per-month" className="text-xl font-semibold">
              {t('statistics.perMonth')}
            </h2>
            <MonthBars
              months={stats.data.months}
              label={(m) => monthName(m)}
              format={(n) => number(n)}
            />
          </section>

          <section aria-labelledby="top-titles" className="space-y-3 break-inside-avoid">
            <h2 id="top-titles" className="text-xl font-semibold">
              {t('statistics.topTitles')}
            </h2>
            <ol className="grid gap-3 sm:grid-cols-2">
              {summary.topTitles.map((title, i) => (
                <li
                  key={title.id}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
                >
                  <span className="w-6 text-right font-display text-lg text-muted">{i + 1}</span>
                  <TitleCover
                    coverImageKey={title.coverImageKey}
                    type={title.type}
                    title={title.title}
                    authors={title.authors}
                    className="w-10"
                  />
                  <div className="min-w-0 flex-1">
                    {title.removed ? (
                      <p className="line-clamp-2 font-medium">{title.title}</p>
                    ) : (
                      <Link
                        to={`/manage/titles/${title.id}`}
                        className="line-clamp-2 font-medium hover:underline"
                      >
                        {title.title}
                      </Link>
                    )}
                    {title.authors && (
                      <p className="truncate text-sm text-muted">{title.authors}</p>
                    )}
                  </div>
                  <span className="text-sm text-muted">
                    {t('statistics.loans', { count: title.loans })}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {summary.groups.length > 0 && (
            <section aria-labelledby="per-class" className="space-y-3 break-inside-avoid">
              <h2 id="per-class" className="text-xl font-semibold">
                {t('statistics.perClass')}
              </h2>
              <GroupTable groups={summary.groups} format={number} />
            </section>
          )}

          {summary.perAvi.length > 0 && (
            <section aria-labelledby="per-avi" className="space-y-3 break-inside-avoid">
              <h2 id="per-avi" className="text-xl font-semibold">
                {t('statistics.perAvi')}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {summary.perAvi.map((a) => (
                  <li
                    key={a.level}
                    className="rounded-xl border border-line bg-surface px-4 py-2 text-center"
                  >
                    <span className="block text-sm text-muted">{a.level}</span>
                    <span className="font-display text-xl font-semibold">{number(a.loans)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {yearExchanges.length > 0 && (
            <section aria-labelledby="exchanges" className="space-y-3 break-inside-avoid">
              <h2 id="exchanges" className="text-xl font-semibold">
                {t('statistics.exchanges')}
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {yearExchanges.map((e) => (
                  <li key={e.id} className="rounded-xl border border-line bg-surface p-4">
                    <p className="font-medium">{e.name}</p>
                    <p className="text-sm text-muted">{e.lender}</p>
                    <p className="mt-1 text-sm">
                      {t('exchange.books', { count: e.books })} ·{' '}
                      {t('exchange.loans', { count: e.loans })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary.notLent.length > 0 && (
            <section aria-labelledby="not-lent" className="space-y-3">
              <h2 id="not-lent" className="text-xl font-semibold">
                {t('statistics.notLent', { count: summary.notLent.length })}
              </h2>
              <p className="text-muted">{t('statistics.notLentHint')}</p>
              <ul className="flex flex-wrap gap-2">
                {summary.notLent.slice(0, 30).map((title) => (
                  <li key={title.id}>
                    <Link
                      to={`/manage/titles/${title.id}`}
                      className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-sm hover:bg-surface-sunken"
                    >
                      {title.title}
                    </Link>
                  </li>
                ))}
                {summary.notLent.length > 30 && (
                  <li className="inline-flex min-h-9 items-center px-2 text-sm text-muted">
                    {t('statistics.andMore', { count: summary.notLent.length - 30 })}
                  </li>
                )}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-1 font-display font-semibold ${small ? 'text-xl' : 'text-3xl'}`}>
        {value}
      </dd>
    </div>
  );
}

/** Simple bars; each shows its number, so nothing depends on reading the height. */
function MonthBars({
  months,
  label,
  format,
}: {
  months: Array<{ month: string; loans: number }>;
  label: (month: string) => string;
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...months.map((m) => m.loans));
  const thisMonth = localDate().slice(0, 7);
  return (
    // print-colors: browsers leave out background colours when printing, and the bars are one.
    <div className="print-colors relative overflow-x-auto rounded-xl border border-line bg-surface p-4 print:bg-transparent">
      <ol className="flex h-48 min-w-[36rem] items-end gap-2 print:h-40 print:min-w-0">
        {months.map((m) => (
          <li key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            {/* An empty month shows nothing on screen but "0" on paper, where a blank reads as
                missing; months still to come stay blank everywhere. */}
            <span
              className={`text-xs text-muted ${
                m.loans > 0 ? '' : m.month <= thisMonth ? 'invisible print:visible' : 'invisible'
              }`}
            >
              {format(m.loans)}
            </span>
            <div
              className="w-full rounded-t-md bg-accent print:rounded-none"
              style={{ height: `${(m.loans / max) * 100}%`, minHeight: m.loans > 0 ? 2 : 0 }}
              aria-hidden="true"
            />
            <span className="text-xs text-muted">
              {label(m.month)}
              <span className="sr-only">: {format(m.loans)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function GroupTable({
  groups,
  format,
}: {
  groups: Array<{ group: string; loans: number; pupils: number; perPupil?: number }>;
  format: (value: number, digits?: number) => string;
}) {
  const { t } = useTranslation();
  const max = Math.max(0.1, ...groups.map((g) => g.perPupil ?? 0));
  return (
    <div className="print-colors relative overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('readers.group')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t('statistics.pupils')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t('statistics.total')}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t('statistics.perPupil')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {groups.map((g) => (
            <tr key={g.group}>
              <td className="px-4 py-3 font-medium">{g.group}</td>
              <td className="px-4 py-3 text-right">{format(g.pupils)}</td>
              <td className="px-4 py-3 text-right">{format(g.loans)}</td>
              <td className="px-4 py-3">
                {g.perPupil === undefined ? (
                  '—'
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="w-10 text-right">{format(g.perPupil, 1)}</span>
                    <div
                      className="h-2 rounded-full bg-accent"
                      style={{ width: `${(g.perPupil / max) * 8}rem` }}
                      aria-hidden="true"
                    />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
