import { describe, expect, it } from 'vitest';
import { isAllowedCoverUrl } from './covers';

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
