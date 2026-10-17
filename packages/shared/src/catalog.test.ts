import { describe, expect, it } from 'vitest';
import { text } from './catalog';

describe('text', () => {
  it('stores accents joined to their letter, however a book database sends them', () => {
    expect(text(100).parse(' Pascale Génestine ')).toBe('Pascale Génestine');
  });
});
