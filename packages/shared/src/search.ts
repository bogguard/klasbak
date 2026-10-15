import type { Options } from 'minisearch';
import type { Title, TitleType } from './catalog';

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
};

export const SEARCH_INDEX_PATH = 'search/catalog.json';

export function toSearchDocument(title: Title): SearchDocument {
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
