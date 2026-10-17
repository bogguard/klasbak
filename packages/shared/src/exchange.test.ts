import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './circulation';
import { capDueDateForExchange } from './exchange';

// Weekends closed (default settings).
const settings = DEFAULT_SETTINGS;

describe('capDueDateForExchange', () => {
  it('keeps the normal due date when it is well before the collection goes back', () => {
    expect(capDueDateForExchange('2026-11-05', '2027-01-29', '2026-10-15', settings)).toBe(
      '2026-11-05',
    );
  });

  it('brings the due date back to a week before the collection goes back', () => {
    // Return by Friday 20 November → books back by Friday 13 November.
    expect(capDueDateForExchange('2026-11-25', '2026-11-20', '2026-11-02', settings)).toBe(
      '2026-11-13',
    );
  });

  it('moves the limit to an open day, never into a weekend', () => {
    // Return by Sunday 22 November → limit Sunday 15 November → Friday 13 November.
    expect(capDueDateForExchange('2026-11-25', '2026-11-22', '2026-11-02', settings)).toBe(
      '2026-11-13',
    );
  });

  it('uses the collection date itself in its last week', () => {
    expect(capDueDateForExchange('2026-12-03', '2026-11-20', '2026-11-16', settings)).toBe(
      '2026-11-20',
    );
  });
});
