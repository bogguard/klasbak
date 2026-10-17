import type { Loan } from '@library/shared';
import { describe, expect, it } from 'vitest';
import { reminderSlips } from './reminders';

const loan = (
  id: string,
  readerId: string,
  readerName: string,
  group: string | undefined,
  dueDate: string,
): Loan => ({
  id,
  readerId,
  readerName,
  readerGroup: group,
  titleId: `t${id}`,
  titleTitle: `Boek ${id}`,
  copyId: `c${id}`,
  barcode: `B${id}`,
  loanedAt: '2026-09-01T10:00:00.000Z',
  dueDate,
});

describe('reminderSlips', () => {
  it('makes one slip per reader with all their late books, oldest due date first', () => {
    const slips = reminderSlips([
      loan('1', 'r1', 'Emma Peeters', '3A', '2026-10-05'),
      loan('2', 'r1', 'Emma Peeters', '3A', '2026-09-28'),
    ]);
    expect(slips).toHaveLength(1);
    expect(slips[0]?.loans.map((l) => l.id)).toEqual(['2', '1']);
  });

  it('sorts by class, then name, with readers without a class last', () => {
    const slips = reminderSlips([
      loan('1', 'r1', 'Zoë Maes', '3A', '2026-10-01'),
      loan('2', 'r2', 'Lars Janssens', undefined, '2026-10-01'),
      loan('3', 'r3', 'Amir Claes', '3A', '2026-10-01'),
      loan('4', 'r4', 'Noor Wouters', '1B', '2026-10-01'),
    ]);
    expect(slips.map((s) => s.readerName)).toEqual([
      'Noor Wouters',
      'Amir Claes',
      'Zoë Maes',
      'Lars Janssens',
    ]);
  });
});
