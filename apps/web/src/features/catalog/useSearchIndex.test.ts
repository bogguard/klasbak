import { searchIndexOptions, toSearchDocument, type SearchDocument } from '@library/shared';
import { QueryClient } from '@tanstack/react-query';
import MiniSearch from 'minisearch';
import { describe, expect, it } from 'vitest';
import { upsertIntoSearchIndex } from './useSearchIndex';

const base = {
  type: 'book' as const,
  authors: [],
  language: 'nl',
  subjects: [],
  createdAt: '2026-10-16T08:00:00.000Z',
  updatedAt: '2026-10-16T08:00:00.000Z',
  version: 1,
};

describe('upsertIntoSearchIndex', () => {
  it('makes a new title findable at once, with its availability, without mutating the cache', () => {
    const queryClient = new QueryClient();
    const original = new MiniSearch<SearchDocument>(searchIndexOptions);
    original.add(toSearchDocument({ ...base, id: 'A', title: 'Dolfje Weerwolfje' }));
    queryClient.setQueryData(['search-index'], original);

    upsertIntoSearchIndex(queryClient, {
      ...base,
      id: 'B',
      title: 'De Zoete Zusjes zijn de baas',
      copies: [
        {
          id: 'C1',
          titleId: 'B',
          barcode: '00000099',
          status: 'available',
          createdAt: '',
          updatedAt: '',
        },
      ],
    });

    const updated = queryClient.getQueryData<MiniSearch<SearchDocument>>(['search-index']);
    expect(updated).not.toBe(original);
    expect(original.documentCount).toBe(1);
    expect(updated?.search('zoete zusjes').map((r) => [r.id, r.available])).toEqual([['B', 1]]);
  });

  it('replaces a title that changed', () => {
    const queryClient = new QueryClient();
    const index = new MiniSearch<SearchDocument>(searchIndexOptions);
    index.add(toSearchDocument({ ...base, id: 'A', title: 'Oude titel' }));
    queryClient.setQueryData(['search-index'], index);

    upsertIntoSearchIndex(queryClient, { ...base, id: 'A', title: 'Nieuwe titel', copies: [] });

    const updated = queryClient.getQueryData<MiniSearch<SearchDocument>>(['search-index']);
    expect(updated?.documentCount).toBe(1);
    expect(updated?.search('nieuwe').map((r) => r.id)).toEqual(['A']);
    expect(updated?.search('oude')).toEqual([]);
  });
});
