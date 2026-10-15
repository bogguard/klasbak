import { localDate, type Loan } from '@library/shared';
import { BookCheck, Printer, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import {
  Badge,
  Button,
  Skeleton,
  StatusMessage,
  useErrorMessage,
} from '../../components/ui/Feedback';
import { daysBetween, formatDate, formatTimestampDate } from '../../lib/format';
import { useLoans } from './api';

/** Overdue and current loans, per class, ready to print for teachers. */
export function LoansPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const overdue = params.get('all') !== 'true';
  const group = params.get('group') ?? '';
  const loans = useLoans(overdue);
  const errorMessage = useErrorMessage();
  const today = localDate();
  const [printedAt] = useState(() => formatDate(today, i18n.language));

  const groups = useMemo(
    () => [...new Set((loans.data ?? []).map((l) => l.readerGroup ?? ''))].sort(),
    [loans.data],
  );
  const visible = useMemo(
    () =>
      (loans.data ?? [])
        .filter((loan) => !group || (loan.readerGroup ?? '') === group)
        .sort(byGroupThenName),
    [loans.data, group],
  );

  function update(key: string, value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {overdue ? t('loans.headingOverdue') : t('loans.headingAll')}
        </h1>
        <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
          <Printer className="size-4" aria-hidden="true" />
          {t('loans.print')}
        </Button>
      </div>
      <p className="hidden print:block">{t('loans.printedOn', { date: printedAt })}</p>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div
          role="group"
          aria-label={t('loans.show')}
          className="inline-flex rounded-lg border border-line bg-surface p-1"
        >
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={overdue === value}
              onClick={() => update('all', value ? '' : 'true')}
              className={`min-h-9 rounded-md px-3 text-sm font-medium ${overdue === value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'}`}
            >
              {value ? t('loans.onlyOverdue') : t('loans.allActive')}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          {t('readers.group')}
          <select
            value={group}
            onChange={(e) => update('group', e.target.value)}
            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink"
          >
            <option value="">{t('readers.allGroups')}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g || t('loans.noGroup')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loans.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : loans.isError ? (
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(loans.error)}
          action={<Button onClick={() => void loans.refetch()}>{t('errors.retry')}</Button>}
        />
      ) : visible.length === 0 ? (
        <StatusMessage
          icon={<BookCheck className="size-6" />}
          title={overdue ? t('loans.noneOverdue') : t('loans.none')}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface print:overflow-visible print:border-0">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('readers.group')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('loans.reader')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('loans.title')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('loans.loanedOn')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('loans.dueOn')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((loan) => {
                const daysLate = daysBetween(loan.dueDate, today);
                return (
                  <tr key={loan.id}>
                    <td className="px-4 py-3">{loan.readerGroup ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Link to={`/manage/readers/${loan.readerId}`} className="hover:underline">
                        {loan.readerName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {loan.titleTitle} <span className="font-mono text-muted">{loan.barcode}</span>
                    </td>
                    <td className="px-4 py-3">
                      {formatTimestampDate(loan.loanedAt, i18n.language)}
                    </td>
                    <td className="px-4 py-3">
                      {formatDate(loan.dueDate, i18n.language)}
                      {daysLate > 0 && (
                        <span className="ml-2">
                          <Badge tone="danger">{t('loans.daysLate', { count: daysLate })}</Badge>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function byGroupThenName(a: Loan, b: Loan): number {
  return (
    (a.readerGroup ?? '~').localeCompare(b.readerGroup ?? '~', 'nl') ||
    a.readerName.localeCompare(b.readerName, 'nl') ||
    a.dueDate.localeCompare(b.dueDate)
  );
}
