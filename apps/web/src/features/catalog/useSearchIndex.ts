import { SEARCH_INDEX_PATH, searchIndexOptions, type SearchDocument } from '@library/shared';
import { useQuery } from '@tanstack/react-query';
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

/** Titles in the catalogue with exactly this (normalised ISBN-13) ISBN. */
export function findByIsbn(index: MiniSearch<SearchDocument>, isbn13: string) {
  return index
    .search(isbn13, { fields: ['isbn'], prefix: false, fuzzy: false })
    .map((result) => ({ id: result.id as string, title: result.title as string }));
}
