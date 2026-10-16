import { SEARCH_INDEX_PATH, searchIndexOptions, toSearchDocument } from '@library/shared';
import MiniSearch from 'minisearch';
import { scanCatalogue } from '../catalog/repository';
import { putPublicFile } from '../lib/public-files';

/** Builds the public search index (titles and their availability) and publishes it. */
export async function rebuildSearchIndex(): Promise<number> {
  const titles = await scanCatalogue();
  const index = new MiniSearch(searchIndexOptions);
  index.addAll(titles.map(({ copies, ...title }) => toSearchDocument(title, copies)));
  await putPublicFile(
    SEARCH_INDEX_PATH,
    JSON.stringify(index),
    'application/json',
    'public, max-age=60',
  );
  return titles.length;
}
