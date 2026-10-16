import { logger } from '../lib/observability';
import { ulid } from 'ulid';
import { AppError } from '../lib/errors';
import { deletePublicFile, putPublicFile } from '../lib/public-files';

/*
 * Covers are copied into our own bucket instead of hot-linked: visitors (often children)
 * then never send requests to third parties, and covers keep working if a source disappears.
 * Only known cover hosts are allowed, also after redirects, so this can't be abused to make
 * the server fetch arbitrary URLs (SSRF).
 */

const ALLOWED_HOSTS = ['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com'];
// Open Library stores many covers on the Internet Archive and redirects there.
const ALLOWED_HOST_SUFFIXES = ['.archive.org'];
const MAX_REDIRECTS = 3;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_BYTES = 2 * 1024 * 1024;
// Open Library returns a 1x1 placeholder for unknown covers; anything this small isn't a cover.
const MIN_BYTES = 1024;

export function isAllowedCoverUrl(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  return (
    protocol === 'https:' &&
    (ALLOWED_HOSTS.includes(hostname) ||
      hostname === 'archive.org' ||
      ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)))
  );
}

/** Follows redirects by hand so every hop is checked against the allow-list. */
async function fetchAllowed(url: string): Promise<Response | undefined> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedCoverUrl(current)) {
      logger.warn('cover host not allowed', { host: new URL(current).hostname });
      return undefined;
    }
    const response = await fetch(current, {
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;
    current = new URL(location, current).toString();
  }
  return undefined;
}

/** Returns the key of the stored cover, or undefined when it couldn't be copied. */
export async function storeCover(titleId: string, url: string): Promise<string | undefined> {
  try {
    const response = await fetchAllowed(url);
    if (!response) return undefined;
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
    const extension = ALLOWED_TYPES[contentType];
    if (!response.ok || !extension) return undefined;

    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength < MIN_BYTES || body.byteLength > MAX_BYTES) return undefined;

    const key = `covers/${titleId}.${extension}`;
    await putPublicFile(key, body, contentType, 'public, max-age=604800');
    return key;
  } catch (error) {
    logger.warn('cover copy failed', { error });
    return undefined;
  }
}

/** Recognises the image type from the file's first bytes; the declared type isn't trusted. */
export function detectImageType(bytes: Uint8Array): keyof typeof ALLOWED_TYPES | undefined {
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

/**
 * Stores a cover a librarian uploaded (a photo of the book, usually). Every upload gets a new
 * file name, so browsers and CloudFront never show a cached older cover.
 */
export async function storeUploadedCover(titleId: string, bytes: Uint8Array): Promise<string> {
  const type = detectImageType(bytes);
  if (!type || bytes.byteLength > MAX_BYTES) {
    throw new AppError(400, 'INVALID_IMAGE', 'Upload a JPEG, PNG or WebP image of at most 2 MB');
  }
  const key = `covers/${titleId}-${ulid().toLowerCase()}.${ALLOWED_TYPES[type]}`;
  await putPublicFile(key, bytes, type, 'public, max-age=604800, immutable');
  return key;
}

/** Best effort: a leftover file only costs a little storage, never correctness. */
export async function deleteCover(key: string): Promise<void> {
  try {
    await deletePublicFile(key);
  } catch (error) {
    logger.warn('cover delete failed', { error });
  }
}
