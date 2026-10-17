import { z } from 'zod';
import { CodeSchema, text, TitleInputSchema, type Copy, type Title } from './catalog';
import { addDays, isClosed, type LibrarySettingsInput } from './circulation';

/*
 * Exchange collections (wisselcollecties): books the public library lends to the school for a
 * while. They keep the library's own barcodes, are lent like any book, stay apart from the
 * school's own collection, and all go back together (decision 031).
 */

export const CreateExchangeRequestSchema = z
  .object({
    /** E.g. "Najaar 2026". */
    name: text(80),
    /** The lending library, e.g. "Bibliotheek Zele". */
    lender: text(120),
    /** The day the books must be back at the library. */
    returnBy: z.iso.date(),
  })
  .strict();
export type CreateExchangeRequest = z.infer<typeof CreateExchangeRequestSchema>;

/** One book as it was when the collection went back: no personal data, only the book. */
export type ReturnedExchangeBook = {
  barcode: string;
  title: string;
  authors: string[];
  isbn?: string;
  aviLevel?: string;
  loans: number;
};

export type ExchangeCollection = CreateExchangeRequest & {
  id: string;
  status: 'active' | 'returned';
  /** Filled in when the collection is returned (the books themselves are then removed). */
  returnedOn?: string;
  bookCount?: number;
  /** The books it had, with how often each was lent: what the library evaluates. */
  returnedBooks?: ReturnedExchangeBook[];
  createdAt: string;
  updatedAt: string;
};

/** List view: active collections with live counts, returned ones with their final figures. */
export type ExchangeSummary = ExchangeCollection & {
  books: number;
  onLoan: number;
  /** How often its books were lent, for the library's evaluation. */
  loans: number;
};

export const EXCHANGE_BOOKS_BATCH = 50;

/**
 * One book to add: the library's barcode plus either an existing title (found by ISBN in the
 * catalogue) or the data for a new one (from an ISBN lookup or the library's list).
 */
export const ExchangeBookSchema = z.union([
  z.object({ barcode: CodeSchema, titleId: z.string().min(1).max(40) }).strict(),
  z
    .object({
      barcode: CodeSchema,
      title: TitleInputSchema,
      coverUrl: z.url({ protocol: /^https$/ }).optional(),
    })
    .strict(),
]);
export type ExchangeBook = z.infer<typeof ExchangeBookSchema>;

export const AddExchangeBooksRequestSchema = z.object({
  books: z.array(z.unknown()).min(1).max(EXCHANGE_BOOKS_BATCH),
});

export type AddExchangeBookResult =
  | { index: number; status: 'added'; titleId: string; barcode: string }
  | { index: number; status: 'failed'; code: string };

/** A book in the collection, with what the "what must go back" list needs to show. */
export type ExchangeBookView = Pick<Copy, 'id' | 'barcode' | 'status' | 'titleId'> & {
  /** How often this copy was lent while at the school. */
  loans: number;
  title: Pick<Title, 'title' | 'authors' | 'aviLevel' | 'isbn'> | undefined;
  /** For books on loan: who has it, so it can be asked back. */
  loan?: { readerName: string; readerGroup?: string; dueDate: string };
};

export type ExchangeDetail = ExchangeSummary & { bookList: ExchangeBookView[] };

/**
 * Books from an exchange collection must be back a week before the collection goes back, so
 * the school has time to collect them. The due date is never later than that limit, moved
 * back to a day the library is open; when the collection is due within a week, its own return
 * date is the limit.
 */
export function capDueDateForExchange(
  dueDate: string,
  returnBy: string,
  today: string,
  settings: Pick<LibrarySettingsInput, 'closedWeekdays' | 'closedPeriods'>,
): string {
  let limit = addDays(returnBy, -7);
  if (limit <= today) limit = returnBy;
  if (dueDate <= limit) return dueDate;
  let capped = limit;
  for (let i = 0; i < 14 && isClosed(capped, settings) && addDays(capped, -1) > today; i++) {
    capped = addDays(capped, -1);
  }
  return capped;
}
