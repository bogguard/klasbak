import MiniSearch from 'minisearch';
import { describe, expect, it } from 'vitest';
import type { Title } from './catalog';
import { searchIndexOptions, toSearchDocument, type SearchDocument } from './search';

function title(overrides: Partial<Title>): Title {
  return {
    id: 'T1',
    type: 'book',
    title: 'Untitled',
    authors: [],
    language: 'nl',
    subjects: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

function buildIndex(titles: Title[]) {
  const index = new MiniSearch<SearchDocument>(searchIndexOptions);
  index.addAll(titles.map(toSearchDocument));
  // Round-trip through JSON exactly like the indexer (server) and the browser do.
  return MiniSearch.loadJSON<SearchDocument>(JSON.stringify(index), searchIndexOptions);
}

describe('catalogue search', () => {
  const index = buildIndex([
    title({ id: 'A', title: 'Het café aan de haven', authors: ['Annie M.G. Schmidt'] }),
    title({ id: 'B', title: 'Dinosaurussen', subjects: ['prehistorie'] }),
    title({
      id: 'C',
      title: 'Dolfje Weerwolfje',
      authors: ['Paul van Loon'],
      isbn: '9789025857019',
    }),
  ]);

  const ids = (query: string) => index.search(query).map((r) => r.id);

  it('ignores accents and case', () => {
    expect(ids('CAFE')).toEqual(['A']);
  });

  it('matches word prefixes while typing', () => {
    expect(ids('dino')).toEqual(['B']);
  });

  it('tolerates small typos', () => {
    expect(ids('weerwolfie')).toEqual(['C']);
  });

  it('finds authors, subjects and ISBN', () => {
    expect(ids('schmidt')).toEqual(['A']);
    expect(ids('prehistorie')).toEqual(['B']);
    expect(ids('9789025857019')).toEqual(['C']);
  });
});
