import { describe, expect, it } from 'vitest';
import {
  addDays,
  calculateDueDate,
  DEFAULT_SETTINGS,
  isClosed,
  isOverdue,
  localDate,
} from './circulation';

const settings = {
  ...DEFAULT_SETTINGS,
  closedPeriods: [{ from: '2026-12-21', to: '2027-01-03', label: 'Kerstvakantie' }],
};

describe('calculateDueDate', () => {
  it('adds the loan period of the reader category', () => {
    // Thursday 15 October + 21 days = Thursday 5 November.
    expect(calculateDueDate('2026-10-15', 'pupil', settings)).toBe('2026-11-05');
    expect(calculateDueDate('2026-10-15', 'teacher', settings)).toBe('2026-11-12');
  });

  it('moves a due date on a weekend to Monday', () => {
    // Saturday 17 October + 21 days = Saturday 7 November → Monday 9 November.
    expect(calculateDueDate('2026-10-17', 'pupil', settings)).toBe('2026-11-09');
  });

  it('moves a due date in a holiday to the first school day after it', () => {
    // 10 December + 21 days = 31 December (Christmas holiday) → Monday 4 January.
    expect(calculateDueDate('2026-12-10', 'pupil', settings)).toBe('2027-01-04');
  });

  it('gives up after a year when every day is closed', () => {
    const alwaysClosed = { ...settings, closedWeekdays: [0, 1, 2, 3, 4, 5, 6] };
    expect(calculateDueDate('2026-10-15', 'pupil', alwaysClosed)).toBe('2027-11-06');
  });
});

describe('date helpers', () => {
  it('adds days across month, year and daylight-saving boundaries', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('knows weekends and holidays', () => {
    expect(isClosed('2026-10-17', settings)).toBe(true); // Saturday
    expect(isClosed('2026-10-19', settings)).toBe(false); // Monday
    expect(isClosed('2026-12-25', settings)).toBe(true); // holiday
  });

  it('uses the Brussels calendar date, not UTC', () => {
    // 23:30 UTC on 15 October is already 16 October in Brussels (UTC+2 in summer time).
    expect(localDate(new Date('2026-10-15T23:30:00Z'))).toBe('2026-10-16');
  });

  it('is overdue only after the due date and while not returned', () => {
    expect(isOverdue({ dueDate: '2026-10-15' }, '2026-10-15')).toBe(false);
    expect(isOverdue({ dueDate: '2026-10-15' }, '2026-10-16')).toBe(true);
    expect(isOverdue({ dueDate: '2026-10-15', returnedAt: 'x' }, '2026-10-16')).toBe(false);
  });
});
