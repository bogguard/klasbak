import type { IsbnLookupResult } from '@library/shared';
import { z } from 'zod';
import { logger } from '../lib/observability';

/*
 * Looks up bibliographic data for an ISBN in free, open sources. Only the ISBN leaves our
 * system. Lookups are best effort: on timeouts or bad data we return undefined and the
 * librarian enters the title by hand.
 */

const TIMEOUT_MS = 4000;

export async function lookupIsbn(isbn13: string): Promise<IsbnLookupResult | undefined> {
  for (const source of [openLibrary, googleBooks]) {
    try {
      const result = await source(isbn13);
      if (result) return result;
    } catch (error) {
      logger.warn('isbn source failed', { source: source.name, error });
    }
  }
  return undefined;
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
      subjects: parsed.subjects?.slice(0, 10).map((s) => s.name) ?? [],
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
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
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

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function extractYear(date: string | undefined): number | undefined {
  const year = date?.match(/\b(1[4-9]|20)\d{2}\b/)?.[0];
  return year ? Number(year) : undefined;
}
