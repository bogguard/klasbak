import { AVI_LEVELS, TITLE_TYPES, type SearchDocument, type TitleType } from '@library/shared';
import { BookOpen, Search, SearchX, TriangleAlert } from 'lucide-react';
import MiniSearch, { type SearchResult } from 'minisearch';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Badge, Button, Skeleton, StatusMessage } from '../../components/ui/Feedback';
import { TitleCover } from './TitleCover';
import { useSearchIndex } from './useSearchIndex';

const PAGE_SIZE = 30;

type Result = SearchResult & Omit<SearchDocument, 'id'>;

type SearchPageProps = {
  heading?: string;
  /** Extra controls next to the heading, e.g. "New title" for staff. */
  headerAction?: ReactNode;
  /** Where a result leads; the public title page by default. */
  titleLink?: (id: string) => string;
};

export function SearchPage({
  heading,
  headerAction,
  titleLink = (id) => `/titles/${id}`,
}: SearchPageProps) {
  const { t } = useTranslation();
  const index = useSearchIndex();
  // Query and filters live in the URL so searches can be shared and the back button works.
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const avi = params.get('avi') ?? '';
  const [visible, setVisible] = useState(PAGE_SIZE);

  const results = useMemo(() => {
    if (!index.data || (!query.trim() && !type && !avi)) return undefined;
    const filter = (r: SearchResult) => (!type || r.type === type) && (!avi || r.aviLevel === avi);
    // No words but a filter (e.g. "all AVI E4 books") lists everything matching the filter.
    return index.data.search(query.trim() || MiniSearch.wildcard, { filter }) as Result[];
  }, [index.data, query, type, avi]);

  function update(key: string, value: string) {
    setVisible(PAGE_SIZE);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const hasFilters = Boolean(type || avi);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {heading ?? t('search.heading')}
          </h1>
          {headerAction}
        </div>
        <form role="search" onSubmit={(e) => e.preventDefault()} className="space-y-3">
          <label htmlFor="q" className="sr-only">
            {t('search.label')}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id="q"
              type="search"
              value={query}
              onChange={(e) => update('q', e.target.value)}
              placeholder={t('search.placeholder')}
              autoComplete="off"
              className="h-14 w-full rounded-xl border border-line bg-surface pl-12 pr-4 text-lg shadow-sm placeholder:text-muted"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <FilterSelect
              label={t('search.filters.type')}
              value={type}
              onChange={(v) => update('type', v)}
              options={[
                { value: '', label: t('search.filters.allTypes') },
                ...TITLE_TYPES.map((value) => ({ value, label: t(`types.${value}`) })),
              ]}
            />
            <FilterSelect
              label={t('search.filters.avi')}
              value={avi}
              onChange={(v) => update('avi', v)}
              options={[
                { value: '', label: t('search.filters.anyLevel') },
                ...AVI_LEVELS.map((value) => ({ value, label: value })),
              ]}
            />
            {hasFilters && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => setParams(query ? { q: query } : {})}
              >
                {t('search.filters.clear')}
              </Button>
            )}
          </div>
        </form>
      </section>

      <section aria-live="polite" aria-busy={index.isPending}>
        {index.isPending ? (
          <ResultsSkeleton />
        ) : index.isError ? (
          <StatusMessage
            icon={<TriangleAlert className="size-6" />}
            title={t('search.loadError')}
            action={<Button onClick={() => void index.refetch()}>{t('errors.retry')}</Button>}
          />
        ) : index.data.documentCount === 0 ? (
          <StatusMessage
            icon={<BookOpen className="size-6" />}
            title={t('search.emptyCatalogue.title')}
          >
            {t('search.emptyCatalogue.hint')}
          </StatusMessage>
        ) : !results ? (
          <p className="text-muted">
            {t('search.catalogueSize', { count: index.data.documentCount })}.{' '}
            {t('search.startHint')}
          </p>
        ) : results.length === 0 ? (
          <StatusMessage icon={<SearchX className="size-6" />} title={t('search.noResults.title')}>
            {t('search.noResults.hint')}
          </StatusMessage>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {t('search.resultCount', { count: results.length })}
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {results.slice(0, visible).map((result) => (
                <ResultItem key={result.id} result={result} to={titleLink(result.id)} />
              ))}
            </ul>
            {results.length > visible && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  {t('search.showMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ResultItem({ result, to }: { result: Result; to: string }) {
  const { t } = useTranslation();
  return (
    <li>
      <Link to={to} className="flex gap-4 p-4 hover:bg-surface-sunken">
        <TitleCover
          coverImageKey={result.coverImageKey}
          type={result.type as TitleType}
          size="small"
        />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold leading-snug">
            {result.title}
            {result.subtitle && (
              <span className="font-normal text-muted"> · {result.subtitle}</span>
            )}
          </p>
          {result.authors && <p className="text-muted">{result.authors}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge>{t(`types.${result.type}`)}</Badge>
            {result.aviLevel && <Badge>AVI {result.aviLevel}</Badge>}
            {result.publishedYear && <Badge>{result.publishedYear}</Badge>}
          </div>
        </div>
      </Link>
    </li>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-24 w-16" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
