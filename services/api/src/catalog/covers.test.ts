import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedCoverUrl, storeCover } from './covers';

describe('isAllowedCoverUrl', () => {
  it('allows known cover hosts over https, including Internet Archive redirects', () => {
    expect(isAllowedCoverUrl('https://covers.openlibrary.org/b/id/1-L.jpg')).toBe(true);
    expect(isAllowedCoverUrl('https://ia800100.us.archive.org/x.jpg')).toBe(true);
    expect(isAllowedCoverUrl('https://books.google.com/books/content?id=1')).toBe(true);
  });

  it('blocks other hosts, look-alikes and plain http', () => {
    expect(isAllowedCoverUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedCoverUrl('https://evilarchive.org/x.jpg')).toBe(false);
    expect(isAllowedCoverUrl('https://covers.openlibrary.org.evil.com/x.jpg')).toBe(false);
    expect(isAllowedCoverUrl('http://covers.openlibrary.org/b/id/1-L.jpg')).toBe(false);
  });
});

describe('storeCover', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses a file that only claims to be an image (e.g. HTML from archive.org)', async () => {
    const html = '<html><script>alert(1)</script></html>'.padEnd(2000, ' ');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { headers: { 'content-type': 'image/jpeg' } })),
    );
    expect(await storeCover('T1', 'https://archive.org/download/x/cover.jpg')).toBeUndefined();
  });

  it('refuses files announced as too big without downloading them', async () => {
    const response = new Response('x', {
      headers: { 'content-type': 'image/jpeg', 'content-length': String(50 * 1024 * 1024) },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );
    expect(await storeCover('T1', 'https://covers.openlibrary.org/b/id/1-L.jpg')).toBeUndefined();
  });
});
