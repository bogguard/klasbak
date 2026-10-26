import { LIBRARY_TIME_ZONE } from '@klasbak/shared';

/** "do 5 nov. 2026" for a calendar date like "2026-11-05". */
export function formatDate(isoDate: string, language: string): string {
  // Noon UTC: the same calendar day in every European time zone.
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: LIBRARY_TIME_ZONE,
  }).format(new Date(`${isoDate.slice(0, 10)}T12:00:00Z`));
}

/** Calendar date of a timestamp in the library's time zone, formatted. */
export function formatTimestampDate(timestamp: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: LIBRARY_TIME_ZONE,
  }).format(new Date(timestamp));
}

/** Whole days between two calendar dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Classes in natural order ("2A" before "10A"); readers without a class last. */
export function compareGroups(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return Number(!a) - Number(!b);
  return a.localeCompare(b, 'nl', { numeric: true });
}
