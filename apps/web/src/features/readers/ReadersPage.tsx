import { readerName } from '@library/shared';
import { FileUp, Plus, Search, TriangleAlert, Users } from 'lucide-react';
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
import { useIsAdmin } from '../../lib/auth';
import { useReaders } from './api';

const linkButton = 'inline-flex min-h-11 items-center gap-2 rounded-lg px-4 font-medium transition';

export function ReadersPage() {
  const { t } = useTranslation();
  const readers = useReaders();
  const isAdmin = useIsAdmin();
  const errorMessage = useErrorMessage();
  const [params, setParams] = useSearchParams();
  const group = params.get('group') ?? '';
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const groups = useMemo(
    () => [...new Set((readers.data ?? []).map((r) => r.group).filter(Boolean))].sort() as string[],
    [readers.data],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('nl');
    return (readers.data ?? []).filter(
      (r) =>
        (showInactive || r.active) &&
        (!group || r.group === group) &&
        (!needle ||
          readerName(r).toLocaleLowerCase('nl').includes(needle) ||
          r.memberNumber.toLocaleLowerCase('nl') === needle),
    );
  }, [readers.data, query, group, showInactive]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('readers.heading')}</h1>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Link
              to="/manage/readers/import"
              className={`${linkButton} border border-line bg-surface hover:bg-surface-sunken`}
            >
              <FileUp className="size-4" aria-hidden="true" />
              {t('readers.import')}
            </Link>
          )}
          <Link
            to="/manage/readers/new"
            className={`${linkButton} bg-accent text-accent-ink hover:opacity-90`}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('readers.new')}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1">
          <span className="sr-only">{t('readers.search')}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('readers.search')}
            className="min-h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          {t('readers.group')}
          <select
            value={group}
            onChange={(e) => setParams(e.target.value ? { group: e.target.value } : {})}
            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink"
          >
            <option value="">{t('readers.allGroups')}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          {t('readers.showInactive')}
        </label>
      </div>

      {readers.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : readers.isError ? (
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(readers.error)}
          action={<Button onClick={() => void readers.refetch()}>{t('errors.retry')}</Button>}
        />
      ) : readers.data.length === 0 ? (
        <StatusMessage icon={<Users className="size-6" />} title={t('readers.empty.title')}>
          {t('readers.empty.hint')}
        </StatusMessage>
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {t('readers.count', { count: visible.length })}
          </p>
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('readers.name')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('readers.group')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('readers.memberNumber')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('readers.onLoan')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-sunken">
                    <td className="px-4 py-3">
                      <Link
                        to={`/manage/readers/${r.id}`}
                        className="font-medium hover:text-accent hover:underline"
                      >
                        {r.lastName}, {r.firstName}
                      </Link>
                      {r.category === 'teacher' && (
                        <span className="ml-2">
                          <Badge>{t('readers.categories.teacher')}</Badge>
                        </span>
                      )}
                      {!r.active && (
                        <span className="ml-2">
                          <Badge tone="warning">{t('readers.inactive')}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{r.group ?? '—'}</td>
                    <td className="px-4 py-3 font-mono">{r.memberNumber}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.activeLoanCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
