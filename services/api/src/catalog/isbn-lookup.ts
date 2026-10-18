import { getParameter } from '@aws-lambda-powertools/parameters/ssm';
import type { IsbnLookupResult } from '@library/shared';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/observability';

/*
 * Looks up bibliographic data for an ISBN in free sources. Only the ISBN leaves our system.
 *   1. Open Library: no key, good for English books, has covers.
 *   2. Google Books: needs an API key (see README), has covers and summaries.
 *   3. Dutch public libraries' catalogue (data.bibliotheken.nl, open data): best coverage of
 *      Dutch and Flemish books, including recent children's books, but no covers.
 * Lookups are best effort: if nothing is found the librarian enters the title by hand.
 */

const TIMEOUT_MS = 4000;
const GOOGLE_KEY_PARAMETER = '/library/google-books-api-key';

/**
 * Returns the first source's result. `undefined` means: no source knows this ISBN.
 * Throws LOOKUP_UNAVAILABLE when a source failed and none found it, so the librarian hears
 * "try again later" instead of a misleading "not found".
 */
export async function lookupIsbn(isbn13: string): Promise<IsbnLookupResult | undefined> {
  let failed = false;
  // Names written out: the bundler shortens function names, which made the logs unreadable.
  const sources = [
    ['Open Library', openLibrary],
    ['Google Books', googleBooks],
    ['Nederlandse bibliotheken', dutchLibraries],
  ] as const;
  for (const [name, lookup] of sources) {
    try {
      const result = await lookup(isbn13);
      if (result) return result;
    } catch (error) {
      failed = true;
      logger.warn('isbn source failed', { source: name, error });
    }
  }
  if (failed) throw new AppError(502, 'LOOKUP_UNAVAILABLE', 'A book data source is unavailable');
  return undefined;
}

/** From the environment (local development) or Parameter Store (AWS), cached for an hour. */
async function googleBooksApiKey(): Promise<string | undefined> {
  if (process.env.GOOGLE_BOOKS_API_KEY) return process.env.GOOGLE_BOOKS_API_KEY;
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) return undefined;
  try {
    return await getParameter(GOOGLE_KEY_PARAMETER, { decrypt: true, maxAge: 3600 });
  } catch {
    return undefined; // Not configured: Google Books is simply skipped.
  }
}

const OpenLibraryBook = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  authors: z.array(z.object({ name: z.string() })).optional(),
  publishers: z.array(z.object({ name: z.string() })).optional(),
  publish_date: z.string().optional(),
  subjects: z.array(z.object({ name: z.string() })).optional(),
  cover: z.object({ large: z.string().optional(), medium: z.string().optional() }).optional(),
});

async function openLibrary(isbn: string): Promise<IsbnLookupResult | undefined> {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
  const data = await fetchJson(url);
  const parsed = z.record(z.string(), OpenLibraryBook).parse(data)[`ISBN:${isbn}`];
  if (!parsed) return undefined;
  return {
    source: 'Open Library',
    title: {
      type: 'book',
      title: parsed.title,
      subtitle: parsed.subtitle,
      authors: parsed.authors?.map((a) => a.name) ?? [],
      publisher: parsed.publishers?.[0]?.name,
      publishedYear: extractYear(parsed.publish_date),
      isbn,
      // Skip machine tags like "series:Harry_Potter"; they aren't subjects for readers.
      subjects:
        parsed.subjects
          ?.map((s) => s.name)
          .filter((name) => !name.includes(':'))
          .slice(0, 10) ?? [],
    },
    coverUrl: parsed.cover?.large ?? parsed.cover?.medium,
  };
}

const GoogleBooksResponse = z.object({
  items: z
    .array(
      z.object({
        volumeInfo: z.object({
          title: z.string(),
          subtitle: z.string().optional(),
          authors: z.array(z.string()).optional(),
          publisher: z.string().optional(),
          publishedDate: z.string().optional(),
          description: z.string().optional(),
          language: z.string().optional(),
          categories: z.array(z.string()).optional(),
          imageLinks: z.object({ thumbnail: z.string().optional() }).optional(),
        }),
      }),
    )
    .optional(),
});

async function googleBooks(isbn: string): Promise<IsbnLookupResult | undefined> {
  // Google refuses requests without a key, so without one there's no point asking.
  const key = await googleBooksApiKey();
  if (!key) return undefined;
  const data = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${encodeURIComponent(key)}`,
  );
  const volume = GoogleBooksResponse.parse(data).items?.[0]?.volumeInfo;
  if (!volume) return undefined;
  const language = volume.language?.slice(0, 2).toLowerCase();
  return {
    source: 'Google Books',
    title: {
      type: 'book',
      title: volume.title,
      subtitle: volume.subtitle,
      authors: volume.authors ?? [],
      publisher: volume.publisher,
      publishedYear: extractYear(volume.publishedDate),
      isbn,
      language: language && /^[a-z]{2}$/.test(language) ? language : undefined,
      subjects: volume.categories ?? [],
      summary: volume.description?.slice(0, 4000),
    },
    // Google returns http:// thumbnail links; the same URL works over https.
    coverUrl: volume.imageLinks?.thumbnail?.replace(/^http:/, 'https:'),
  };
}

const SparqlResults = z.object({
  results: z.object({
    bindings: z.array(z.record(z.string(), z.object({ value: z.string() }))),
  }),
});

async function dutchLibraries(isbn: string): Promise<IsbnLookupResult | undefined> {
  // The ISBN is 13 validated digits, so it's safe inside the query.
  const query = `PREFIX schema: <http://schema.org/>
    SELECT ?name ?author ?publisher ?issued ?language WHERE {
      ?book schema:isbn "${isbn}" ; schema:name ?name .
      OPTIONAL { ?book schema:author/schema:name ?author }
      OPTIONAL { ?book schema:publication/schema:publishedBy/schema:name ?publisher }
      OPTIONAL { ?book <http://purl.org/dc/terms#issued> ?issued } # sic: '#', not '/'
      OPTIONAL { ?book schema:inLanguage ?language }
    } LIMIT 20`;
  const data = await fetchJson(
    `https://data.bibliotheken.nl/sparql?query=${encodeURIComponent(query)}`,
    { accept: 'application/sparql-results+json' },
  );
  const rows = SparqlResults.parse(data).results.bindings;
  const first = rows[0];
  if (!first?.name) return undefined;
  const values = (key: string) => [
    ...new Set(rows.map((row) => row[key]?.value).filter((v): v is string => Boolean(v))),
  ];
  const language = first.language?.value.slice(0, 2).toLowerCase();
  return {
    source: 'Nederlandse bibliotheken',
    title: {
      type: 'book',
      title: first.name.value,
      authors: values('author'),
      publisher: first.publisher?.value,
      publishedYear: extractYear(first.issued?.value),
      isbn,
      language: language && /^[a-z]{2}$/.test(language) ? language : undefined,
      subjects: [],
    },
  };
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function extractYear(date: string | undefined): number | undefined {
  const year = date?.match(/\b(1[4-9]|20)\d{2}\b/)?.[0];
  return year ? Number(year) : undefined;
}
