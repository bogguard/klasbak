import {
  SEARCH_INDEX_PATH,
  searchIndexOptions,
  toSearchDocument,
  type SearchDocument,
  type TitleWithCopies,
} from '@library/shared';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import MiniSearch from 'minisearch';

/*
 * Changes staff made on this device in the last minutes, kept for this browser tab. The
 * server rebuilds the index a few seconds after a change; a reload in between would
 * otherwise show the old state ("still available" right after withdrawing a copy).
 */
const PENDING_KEY = 'search-index-pending';
const PENDING_MS = 10 * 60_000;
type Pending = Record<string, { doc: SearchDocument; at: number }>;

function readPending(): Pending {
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '{}') as Pending;
    const fresh = Object.entries(pending).filter(([, p]) => Date.now() - p.at < PENDING_MS);
    return Object.fromEntries(fresh);
  } catch {
    return {};
  }
}

function rememberPending(doc: SearchDocument) {
  try {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ ...readPending(), [doc.id]: { doc, at: Date.now() } }),
    );
  } catch {
    // Private mode or storage full: the change still shows until the next reload.
  }
}

function put(index: MiniSearch<SearchDocument>, doc: SearchDocument) {
  if (index.has(doc.id)) index.replace(doc);
  else index.add(doc);
}

/**
 * Loads the prebuilt catalogue index (decision 003). Search then runs in the browser:
 * instant, typo-tolerant and free. A missing index just means an empty catalogue.
 */
export function useSearchIndex() {
  return useQuery({
    queryKey: ['search-index'],
    queryFn: async () => {
      // Always ask the server whether it changed (a cheap "not modified" if it didn't).
      const response = await fetch(`/${SEARCH_INDEX_PATH}`, { cache: 'no-cache' });
      if (response.status === 404) return new MiniSearch<SearchDocument>(searchIndexOptions);
      if (!response.ok) throw new Error(`Search index: HTTP ${response.status}`);
      const index = MiniSearch.loadJSON<SearchDocument>(await response.text(), searchIndexOptions);
      // Re-apply this device's recent changes that the server's index doesn't have yet.
      const built = Date.parse(response.headers.get('last-modified') ?? '') || 0;
      for (const { doc, at } of Object.values(readPending())) if (at > built) put(index, doc);
      return index;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Puts a title that staff just changed straight into the index on this screen, so it shows up
 * immediately instead of after the server has rebuilt the index (a few seconds later).
 */
export function upsertIntoSearchIndex(queryClient: QueryClient, title: TitleWithCopies) {
  const { copies, ...rest } = title;
  const doc = toSearchDocument(rest, copies);
  rememberPending(doc);
  const current = queryClient.getQueryData<MiniSearch<SearchDocument>>(['search-index']);
  if (!current) return;
  // A copy, because cached data must not be changed in place (React wouldn't notice).
  const next = MiniSearch.loadJS<SearchDocument>(current.toJSON(), searchIndexOptions);
  put(next, doc);
  queryClient.setQueryData(['search-index'], next);
}

/** Titles in the catalogue with exactly this (normalised ISBN-13) ISBN. */
export function findByIsbn(index: MiniSearch<SearchDocument>, isbn13: string) {
  return index
    .search(isbn13, { fields: ['isbn'], prefix: false, fuzzy: false })
    .map((result) => ({ id: result.id as string, title: result.title as string }));
}
