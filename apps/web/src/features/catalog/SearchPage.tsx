import { AVI_LEVELS, TITLE_TYPES, type SearchDocument, type TitleType } from '@klasbak/shared';
import { BookOpen, Search, SearchX, TriangleAlert } from 'lucide-react';
import MiniSearch, { type SearchResult } from 'minisearch';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Button, Skeleton, StatusMessage } from '../../components/ui/Feedback';
import { TitleCover, TypeIcon } from './TitleCover';
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

  // Offer only filters that match something in this library (no empty "Partituur" chip).
  const facets = useMemo(() => {
    const all = (index.data?.search(MiniSearch.wildcard) ?? []) as Result[];
    const present = <T,>(values: (T | undefined)[]) => new Set(values.filter(Boolean));
    const types = present(all.map((r) => r.type));
    const levels = present(all.map((r) => r.aviLevel));
    return {
      types: TITLE_TYPES.filter((value) => types.has(value)),
      aviLevels: AVI_LEVELS.filter((value) => levels.has(value)),
    };
  }, [index.data]);

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
          <div className="-mx-4 relative overflow-x-auto px-4 pb-1">
            <div role="group" aria-label={t('search.filters.type')} className="flex w-max gap-2">
              <Chip pressed={!type} onClick={() => update('type', '')}>
                {t('search.filters.allTypes')}
              </Chip>
              {facets.types.map((value) => (
                <Chip
                  key={value}
                  pressed={type === value}
                  onClick={() => update('type', type === value ? '' : value)}
                >
                  <TypeIcon type={value} className="size-4" />
                  {t(`types.${value}`)}
                </Chip>
              ))}
              <span className="mx-1 w-px self-stretch bg-line" aria-hidden="true" />
              <Chip
                pressed={onlyAvailable}
                onClick={() => update('available', onlyAvailable ? '' : '1')}
              >
                <span className="size-2 rounded-full bg-success" aria-hidden="true" />
                {t('search.filters.onlyAvailable')}
              </Chip>
            </div>
          </div>
        </form>
      </section>

      {index.data && index.data.documentCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <p className="text-sm text-muted" aria-live="polite">
            {results &&
              (browsing
                ? t('search.browseCount', { count: results.length })
                : t('search.resultCount', { count: results.length }))}
            {hasFilters && (
              <button
                type="button"
                onClick={() =>
                  setParams(() => {
                    const keep = new URLSearchParams();
                    if (query) keep.set('q', query);
                    if (params.get('sort')) keep.set('sort', sort);
                    return keep;
                  })
                }
                className="ml-3 font-medium text-accent underline underline-offset-4"
              >
                {t('search.filters.clear')}
              </button>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {facets.aviLevels.length > 0 && (
              <FilterSelect
                label={t('search.filters.avi')}
                value={avi}
                onChange={(v) => update('avi', v)}
                options={[
                  { value: '', label: t('search.filters.anyLevel') },
                  ...facets.aviLevels.map((value) => ({ value, label: `AVI ${value}` })),
                ]}
              />
            )}
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
          </div>
        </div>
      )}

      <section aria-busy={index.isPending}>
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
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {results.slice(0, visible).map((result) => (
                <ResultCard key={result.id} result={result} to={titleLink(result.id)} />
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

function ResultCard({ result, to }: { result: Result; to: string }) {
  const { t } = useTranslation();
  return (
    <li>
      <Link to={to} className="group block space-y-2 rounded-lg focus-visible:outline-offset-4">
        <div className="relative transition duration-200 group-hover:-translate-y-1">
          <TitleCover
            coverImageKey={result.coverImageKey}
            type={result.type as TitleType}
            title={result.title}
            authors={result.authors}
          />
          {result.aviLevel && (
            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-surface/95 px-2 py-0.5 text-xs font-bold text-ink shadow-sm">
              AVI {result.aviLevel}
            </span>
          )}
        </div>
        <div className="space-y-0.5">
          <p className="line-clamp-2 font-semibold leading-snug group-hover:text-accent">
            {result.title}
          </p>
          {result.authors && <p className="line-clamp-1 text-sm text-muted">{result.authors}</p>}
          {result.copies > 0 ? (
            <p className="flex items-center gap-1.5 text-sm">
              <span
                className={`size-2 rounded-full ${result.available > 0 ? 'bg-success' : 'bg-warning'}`}
                aria-hidden="true"
              />
              <span className={result.available > 0 ? 'text-success' : 'text-warning'}>
                {result.available > 0 ? t('copyStatus.available') : t('search.notAvailable')}
              </span>
            </p>
          ) : (
            // All copies withdrawn (or none added yet): say so, rather than show nothing.
            <p className="text-sm text-muted">{t('search.noCopies')}</p>
          )}
        </div>
      </Link>
    </li>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition ${
        pressed
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line bg-surface text-ink hover:border-accent'
      }`}
    >
      {children}
    </button>
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
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink"
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
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
