import { describe, expect, it } from 'vitest';
import { matchReader } from './readers';

const reader = (id: string, firstName: string, lastName: string, extra = {}) => ({
  id,
  memberNumber: `L${id}`,
  firstName,
  lastName,
  ...extra,
});

describe('matchReader', () => {
  const readers = [
    reader('1', 'Zoë', 'Maes'),
    reader('2', 'Lars', 'Janssens', { schoolNumber: '555' }),
    reader('3', 'Emma', 'Peeters'),
    reader('4', 'Emma', 'Peeters'),
  ];

  it('prefers the school number, then the card number', () => {
    expect(matchReader({ firstName: 'X', lastName: 'Y', schoolNumber: '555' }, readers)?.id).toBe(
      '2',
    );
    expect(matchReader({ firstName: 'X', lastName: 'Y', memberNumber: 'L3' }, readers)?.id).toBe(
      '3',
    );
  });

  it('recognises a hand-entered reader by name, ignoring case, accents and spaces', () => {
    expect(
      matchReader({ firstName: 'zoe', lastName: ' MAES ', schoolNumber: '1' }, readers)?.id,
    ).toBe('1');
  });

  it('never guesses: no match for two readers with the same name or one already linked', () => {
    expect(matchReader({ firstName: 'Emma', lastName: 'Peeters' }, readers)).toBeUndefined();
    expect(
      matchReader({ firstName: 'Lars', lastName: 'Janssens', schoolNumber: '777' }, readers),
    ).toBeUndefined();
  });
});
