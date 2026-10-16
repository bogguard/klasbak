import { AVI_LEVELS, TITLE_TYPES, type SearchDocument, type TitleType } from '@library/shared';
import { BookOpen, Search, SearchX, TriangleAlert } from 'lucide-react';
import MiniSearch, { type SearchResult } from 'minisearch';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Badge, Button, Skeleton, StatusMessage } from '../../components/ui/Feedback';
import { TitleCover } from './TitleCover';
import { useSearchIndex } from './useSearchIndex';

const PAGE_SIZE = 30;

type Result = SearchResult & Omit<SearchDocument, 'id'>;

const SORTS = {
  // Newest first doubles as the "new acquisitions" list.
  new: (a: Result, b: Result) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''),
  title: (a: Result, b: Result) => a.title.localeCompare(b.title, 'nl'),
  author: (a: Result, b: Result) =>
    (a.authors || '~').localeCompare(b.authors || '~', 'nl') ||
    a.title.localeCompare(b.title, 'nl'),
};
type Sort = keyof typeof SORTS;

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
  const onlyAvailable = params.get('available') === '1';
  const sort: Sort = (params.get('sort') as Sort | null) ?? 'new';
  const browsing = !query.trim();
  const [visible, setVisible] = useState(PAGE_SIZE);

  const results = useMemo(() => {
    if (!index.data) return undefined;
    const filter = (r: SearchResult) =>
      (!type || r.type === type) &&
      (!avi || r.aviLevel === avi) &&
      (!onlyAvailable || (r.available ?? 0) > 0);
    // Without words the whole catalogue is listed, so people can browse.
    const found = index.data.search(query.trim() || MiniSearch.wildcard, { filter }) as Result[];
    // With words the best matches come first; when browsing, the chosen order.
    return browsing ? [...found].sort(SORTS[sort] ?? SORTS.new) : found;
  }, [index.data, query, type, avi, onlyAvailable, sort, browsing]);

  // Load more titles automatically when the end of the list scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = (results?.length ?? 0) > visible;
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible((v) => v + PAGE_SIZE);
      },
      { rootMargin: '400px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
    // Re-observing after each load re-checks the sentinel, in case it is still in view.
  }, [hasMore, visible]);

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

  const hasFilters = Boolean(type || avi || onlyAvailable);

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
            {browsing && (
              <FilterSelect
                label={t('search.sort.label')}
                value={sort}
                onChange={(v) => update('sort', v === 'new' ? '' : v)}
                options={(Object.keys(SORTS) as Sort[]).map((value) => ({
                  value,
                  label: t(`search.sort.${value}`),
                }))}
              />
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => update('available', e.target.checked ? '1' : '')}
                className="size-4 accent-[var(--accent)]"
              />
              {t('search.filters.onlyAvailable')}
            </label>
            {hasFilters && (
              <Button
                variant="secondary"
                type="button"
                onClick={() =>
                  setParams(() => {
                    const keep = new URLSearchParams();
                    if (query) keep.set('q', query);
                    if (params.get('sort')) keep.set('sort', sort);
                    return keep;
                  })
                }
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
        ) : !results ? null : results.length === 0 ? (
          <StatusMessage icon={<SearchX className="size-6" />} title={t('search.noResults.title')}>
            {t('search.noResults.hint')}
          </StatusMessage>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {browsing
                ? t('search.browseCount', { count: results.length })
                : t('search.resultCount', { count: results.length })}
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {results.slice(0, visible).map((result) => (
                <ResultItem key={result.id} result={result} to={titleLink(result.id)} />
              ))}
            </ul>
            {hasMore && (
              <div ref={sentinel} className="mt-4 flex justify-center">
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
            {result.copies > 0 &&
              (result.available > 0 ? (
                <Badge tone="success">{t('copyStatus.available')}</Badge>
              ) : (
                // On loan, lost or damaged: for a visitor it's simply not on the shelf.
                <Badge tone="warning">{t('search.notAvailable')}</Badge>
              ))}
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
