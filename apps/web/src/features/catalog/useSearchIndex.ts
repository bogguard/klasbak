import {
  SEARCH_INDEX_PATH,
  searchIndexOptions,
  toSearchDocument,
  type SearchDocument,
  type TitleWithCopies,
} from '@library/shared';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import MiniSearch from 'minisearch';

/**
 * Loads the prebuilt catalogue index (decision 003). Search then runs in the browser:
 * instant, typo-tolerant and free. A missing index just means an empty catalogue.
 */
export function useSearchIndex() {
  return useQuery({
    queryKey: ['search-index'],
    queryFn: async () => {
      const response = await fetch(`/${SEARCH_INDEX_PATH}`);
      if (response.status === 404) return new MiniSearch<SearchDocument>(searchIndexOptions);
      if (!response.ok) throw new Error(`Search index: HTTP ${response.status}`);
      return MiniSearch.loadJSON<SearchDocument>(await response.text(), searchIndexOptions);
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Puts a title that staff just changed straight into the index on this screen, so it shows up
 * immediately instead of after the server has rebuilt the index (a few seconds later).
 */
export function upsertIntoSearchIndex(queryClient: QueryClient, title: TitleWithCopies) {
  const current = queryClient.getQueryData<MiniSearch<SearchDocument>>(['search-index']);
  if (!current) return;
  // A copy, because cached data must not be changed in place (React wouldn't notice).
  const next = MiniSearch.loadJS<SearchDocument>(current.toJSON(), searchIndexOptions);
  const { copies, ...rest } = title;
  const doc = toSearchDocument(rest, copies);
  if (next.has(doc.id)) next.replace(doc);
  else next.add(doc);
  queryClient.setQueryData(['search-index'], next);
}

/** Titles in the catalogue with exactly this (normalised ISBN-13) ISBN. */
export function findByIsbn(index: MiniSearch<SearchDocument>, isbn13: string) {
  return index
    .search(isbn13, { fields: ['isbn'], prefix: false, fuzzy: false })
    .map((result) => ({ id: result.id as string, title: result.title as string }));
}
