import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupIsbn } from './isbn-lookup';

const ISBN = '9789043933728';

function respond(routes: Record<string, () => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
      if (!route) throw new Error(`unexpected ${url}`);
      return routes[route]?.() ?? new Response(null, { status: 500 });
    }),
  );
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });
const openLibraryEmpty = { 'https://openlibrary.org/': json({}) };
const dutchLibrariesEmpty = {
  'https://data.bibliotheken.nl/': json({ results: { bindings: [] } }),
};

beforeEach(() => vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-key'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('lookupIsbn', () => {
  it("finds recent Dutch children's books in the Dutch libraries' catalogue", async () => {
    const row = (author: string) => ({
      name: { value: 'De Zoete Zusjes zijn de baas' },
      author: { value: author },
      publisher: { value: 'Kosmos Uitgevers' },
      issued: { value: '2024' },
      language: { value: 'nl' },
    });
    respond({
      ...openLibraryEmpty,
      'https://www.googleapis.com/': json({ totalItems: 0 }),
      'https://data.bibliotheken.nl/': json({
        results: { bindings: [row('Hanneke de Zoete'), row('Hanneke de Zoete')] },
      }),
    });

    await expect(lookupIsbn(ISBN)).resolves.toEqual({
      source: 'Nederlandse bibliotheken',
      title: {
        type: 'book',
        title: 'De Zoete Zusjes zijn de baas',
        authors: ['Hanneke de Zoete'],
        publisher: 'Kosmos Uitgevers',
        publishedYear: 2024,
        isbn: ISBN,
        language: 'nl',
        subjects: [],
      },
    });
  });

  it('falls back to Google Books, with the API key, for books Open Library lacks', async () => {
    respond({
      ...openLibraryEmpty,
      'https://www.googleapis.com/': json({
        items: [
          {
            volumeInfo: {
              title: 'Een Nederlands boek',
              authors: ['A. Auteur'],
              language: 'nl',
              imageLinks: { thumbnail: 'http://books.google.com/x' },
            },
          },
        ],
      }),
    });

    const result = await lookupIsbn(ISBN);

    expect(result).toMatchObject({
      source: 'Google Books',
      title: { title: 'Een Nederlands boek', authors: ['A. Auteur'], language: 'nl' },
      coverUrl: 'https://books.google.com/x',
    });
    const googleUrl = vi.mocked(fetch).mock.calls[1]?.[0] as string;
    expect(googleUrl).toContain('key=test-key');
  });

  it('says "not found" only when every source answered and none knows the ISBN', async () => {
    respond({
      ...openLibraryEmpty,
      ...dutchLibrariesEmpty,
      'https://www.googleapis.com/': json({ totalItems: 0 }),
    });
    await expect(lookupIsbn(ISBN)).resolves.toBeUndefined();
  });

  it('reports "unavailable" when a source failed, e.g. Google quota exceeded', async () => {
    respond({
      ...openLibraryEmpty,
      'https://www.googleapis.com/': json({ error: { code: 429 } }, 429),
    });
    await expect(lookupIsbn(ISBN)).rejects.toMatchObject({
      status: 502,
      code: 'LOOKUP_UNAVAILABLE',
    });
  });

  it('skips Google Books without an API key', async () => {
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', '');
    respond({ ...openLibraryEmpty, ...dutchLibrariesEmpty });
    await expect(lookupIsbn(ISBN)).resolves.toBeUndefined();
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('googleapis'))).toBe(false);
  });
});
