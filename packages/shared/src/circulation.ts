import { z } from 'zod';
import { CodeSchema, text, type Copy, type Title } from './catalog';
import type { Reader, ReaderCategory } from './readers';

/** All business dates (due dates, closed days) are calendar dates in this time zone. */
export const LIBRARY_TIME_ZONE = 'Europe/Brussels';

const IsoDateSchema = z.iso.date();

export const LoanPolicySchema = z.object({
  loanDays: z.number().int().min(1).max(365),
  maxLoans: z.number().int().min(1).max(100),
});
export type LoanPolicy = z.infer<typeof LoanPolicySchema>;

export const ClosedPeriodSchema = z
  .object({ from: IsoDateSchema, to: IsoDateSchema, label: text(60).optional() })
  .refine((p) => p.from <= p.to, { message: 'from must not be after to', path: ['to'] });
export type ClosedPeriod = z.infer<typeof ClosedPeriodSchema>;

export const LibrarySettingsInputSchema = z
  .object({
    /** 0 = Sunday … 6 = Saturday, like Date.getUTCDay(). */
    closedWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
    closedPeriods: z.array(ClosedPeriodSchema).max(100),
    loanPolicies: z.object({ pupil: LoanPolicySchema, teacher: LoanPolicySchema }),
    /** Returned loans are removed (anonymised) after this many days: reading history is personal. */
    historyRetentionDays: z.number().int().min(30).max(3650),
  })
  .strict();
export type LibrarySettingsInput = z.infer<typeof LibrarySettingsInputSchema>;

export const UpdateSettingsRequestSchema = z.object({
  settings: LibrarySettingsInputSchema,
  /** 0 when the defaults were never saved. */
  version: z.number().int().min(0),
});

export type LibrarySettings = LibrarySettingsInput & { version: number };

export const DEFAULT_SETTINGS: LibrarySettings = {
  closedWeekdays: [0, 6],
  closedPeriods: [],
  loanPolicies: {
    pupil: { loanDays: 21, maxLoans: 3 },
    teacher: { loanDays: 28, maxLoans: 10 },
  },
  historyRetentionDays: 365,
  version: 0,
};

export type Loan = {
  id: string;
  readerId: string;
  /** Snapshots at loan time, so lists don't need to look up every reader and title. */
  readerName: string;
  readerGroup?: string;
  titleId: string;
  titleTitle: string;
  copyId: string;
  barcode: string;
  loanedAt: string;
  dueDate: string;
  /** How many times the loan was extended. */
  renewals?: number;
  returnedAt?: string;
};

export const RenewRequestSchema = z.object({ readerId: z.string(), loanId: z.string() });

export const ScanRequestSchema = z.object({
  code: CodeSchema,
  /** The reader currently at the desk, if a card was scanned before. */
  readerId: z.string().optional(),
});

/** Scanning a card on the "Mijn boeken" screen. */
export const MyBooksRequestSchema = z.object({ code: CodeSchema });

/**
 * What a reader sees after scanning their own card. Others may be looking at the screen,
 * so only the first name and the books, nothing else about the reader.
 */
export type MyBooks = {
  firstName: string;
  loans: Array<Pick<Loan, 'id' | 'titleTitle' | 'dueDate'>>;
};

/** Months as "YYYY-MM", inclusive; at most two school years at a time. */
const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const StatisticsQuerySchema = z
  .object({ from: MonthSchema, to: MonthSchema })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['to'] })
  .refine((q) => monthsBetween(q.from, q.to).length <= 24, {
    message: 'at most 24 months',
    path: ['to'],
  });

/**
 * Anonymous loan counts (decision 028): counted when a book is lent, never linked to a
 * reader. `groups` has the number of active pupils per class, for an average per pupil.
 */
export type LoanStatistics = {
  months: Array<{ month: string; loans: number }>;
  /**
   * Per title, with its name as it was when lent: a title can leave the catalogue later (an
   * exchange collection that went back) and must still count in the report.
   */
  titles: Array<{ titleId: string; loans: number; title?: string }>;
  /** Per AVI level, as the title had it when lent. */
  avi: Array<{ level: string; loans: number }>;
  groups: Array<{ group: string; loans: number; pupils: number }>;
  /** Active readers now, for the report. */
  readers: { pupils: number; teachers: number };
};

/** "2026-09" … "2027-08". */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let [year, month] = from.split('-').map(Number) as [number, number];
  let current = from;
  // The cap only guards against nonsense input; real ranges are validated to 24 months.
  while (current <= to && months.length < 120) {
    months.push(current);
    month = month === 12 ? 1 : month + 1;
    if (month === 1) year++;
    current = `${year}-${String(month).padStart(2, '0')}`;
  }
  return months;
}

/** The school year (1 September – 31 August) a date falls in, as months. */
export function schoolYear(isoDate: string): { from: string; to: string } {
  const year = Number(isoDate.slice(0, 4));
  const start = Number(isoDate.slice(5, 7)) >= 9 ? year : year - 1;
  return { from: `${start}-09`, to: `${start + 1}-08` };
}

export type ReaderAtDesk = { reader: Reader; activeLoans: Loan[] };

/** What happened after a scan at the desk. */
export type ScanResult =
  | ({ outcome: 'reader' } & ReaderAtDesk)
  | ({ outcome: 'checkedOut'; loan: Loan } & ReaderAtDesk)
  | ({ outcome: 'alreadyLoaned'; loan: Loan } & ReaderAtDesk)
  | { outcome: 'returned'; loan: Loan; wasOverdue: boolean }
  | { outcome: 'alreadyReturned'; copy: Copy; title: Pick<Title, 'id' | 'title'> };

/** Today's date in the library's time zone, e.g. "2026-10-15". */
export function localDate(at: Date = new Date(), timeZone = LIBRARY_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

/** Adds days to a calendar date. Works on dates only, so daylight saving can't shift it. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isClosed(
  isoDate: string,
  settings: Pick<LibrarySettingsInput, 'closedWeekdays' | 'closedPeriods'>,
): boolean {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return (
    settings.closedWeekdays.includes(weekday) ||
    settings.closedPeriods.some((p) => p.from <= isoDate && isoDate <= p.to)
  );
}

/**
 * The due date is `loanDays` after today, moved forward to the first day the library is open,
 * so nobody has to return a book on a day they can't. Never later than a year (safety net when
 * every day is configured as closed).
 */
export function calculateDueDate(
  today: string,
  category: ReaderCategory,
  settings: LibrarySettingsInput,
): string {
  let due = addDays(today, settings.loanPolicies[category].loanDays);
  for (let i = 0; i < 366 && isClosed(due, settings); i++) due = addDays(due, 1);
  return due;
}

export function isOverdue(loan: Pick<Loan, 'dueDate' | 'returnedAt'>, today: string): boolean {
  return !loan.returnedAt && loan.dueDate < today;
}
