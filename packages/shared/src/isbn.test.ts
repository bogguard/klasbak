import { describe, expect, it } from 'vitest';
import { isValidIsbn, normalizeIsbn, toIsbn13 } from './isbn';

describe('isbn', () => {
  it('normalizes dashes and spaces', () => {
    expect(normalizeIsbn('978-90-451 1720-9')).toBe('9789045117209');
  });

  it('accepts valid ISBN-13 and ISBN-10 (including X check digit)', () => {
    expect(isValidIsbn('978-0-306-40615-7')).toBe(true);
    expect(isValidIsbn('0-306-40615-2')).toBe(true);
    expect(isValidIsbn('0-8044-2957-X')).toBe(true);
  });

  it('rejects wrong check digits and garbage', () => {
    expect(isValidIsbn('978-0-306-40615-8')).toBe(false);
    expect(isValidIsbn('0-306-40615-3')).toBe(false);
    expect(isValidIsbn('not an isbn')).toBe(false);
  });

  it('converts ISBN-10 to ISBN-13', () => {
    expect(toIsbn13('0-306-40615-2')).toBe('9780306406157');
    expect(toIsbn13('9780306406157')).toBe('9780306406157');
  });
});
