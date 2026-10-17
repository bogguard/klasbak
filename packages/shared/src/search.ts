import type { Options } from 'minisearch';
import type { Copy, Title, TitleType } from './catalog';

/** What the public catalogue search shows in a result list. Public data only. */
export type SearchDocument = {
  id: string;
  type: TitleType;
  title: string;
  subtitle?: string;
  authors: string;
  subjects: string;
  isbn?: string;
  publishedYear?: number;
  aviLevel?: string;
  ageMin?: number;
  ageMax?: number;
  coverImageKey?: string;
  /** When the title was added: sorts "newest first" (new acquisitions). */
  addedAt: string;
  /** Copies the public can see (withdrawn ones excluded), and how many are on the shelf. */
  copies: number;
  available: number;
  /** How many of those belong to a public library's exchange collection (not the school's). */
  exchangeCopies?: number;
};

export const SEARCH_INDEX_PATH = 'search/catalog.json';

/**
 * Availability in the index can lag a minute or two behind the desk (it's rebuilt in
 * batches); the title page always shows the live status.
 */
export function toSearchDocument(
  title: Title,
  copies: Pick<Copy, 'status' | 'exchangeId'>[] = [],
): SearchDocument {
  const visible = copies.filter((copy) => copy.status !== 'withdrawn');
  const exchangeCopies = visible.filter((copy) => copy.exchangeId).length;
  return {
    id: title.id,
    type: title.type,
    title: title.title,
    subtitle: title.subtitle,
    authors: title.authors.join(', '),
    subjects: title.subjects.join(', '),
    isbn: title.isbn,
    publishedYear: title.publishedYear,
    aviLevel: title.aviLevel,
    ageMin: title.ageMin,
    ageMax: title.ageMax,
    coverImageKey: title.coverImageKey,
    addedAt: title.createdAt,
    copies: visible.length,
    available: visible.filter((copy) => copy.status === 'available').length,
    ...(exchangeCopies > 0 ? { exchangeCopies } : {}),
  };
}

/** Lowercase and strip accents so "Café" matches "cafe". */
function normalizeTerm(term: string): string {
  return term
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Must be identical when the index is built (server) and loaded (browser),
 * which is why it lives in the shared package.
 */
export const searchIndexOptions: Options<SearchDocument> = {
  fields: ['title', 'subtitle', 'authors', 'subjects', 'isbn'],
  storeFields: [
    'type',
    'title',
    'subtitle',
    'authors',
    'publishedYear',
    'aviLevel',
    'ageMin',
    'ageMax',
    'coverImageKey',
    'addedAt',
    'copies',
    'available',
    'exchangeCopies',
  ],
  processTerm: normalizeTerm,
  searchOptions: {
    boost: { title: 3, authors: 2 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: 'AND',
    processTerm: normalizeTerm,
  },
};
