import { SEARCH_INDEX_PATH, searchIndexOptions, toSearchDocument } from '@library/shared';
import MiniSearch from 'minisearch';
import { scanAllTitles } from '../catalog/repository';
import { putPublicFile } from '../lib/public-files';

/** Builds the public search index from all titles and publishes it. Returns the title count. */
export async function rebuildSearchIndex(): Promise<number> {
  const titles = await scanAllTitles();
  const index = new MiniSearch(searchIndexOptions);
  index.addAll(titles.map(toSearchDocument));
  await putPublicFile(
    SEARCH_INDEX_PATH,
    JSON.stringify(index),
    'application/json',
    'public, max-age=60',
  );
  return titles.length;
}
