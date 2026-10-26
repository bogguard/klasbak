import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  ExchangeBookSchema,
  localDate,
  type AddExchangeBookResult,
  type CreateExchangeRequest,
  type ExchangeCollection,
  type ExchangeDetail,
  type ExchangeSummary,
} from '@klasbak/shared';
import { ulid } from 'ulid';
import { addCopy, createTitle } from '../catalog/service';
import { deleteCover } from '../catalog/covers';
import { auditItem } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { keyId } from '../lib/dynamo';
import { AppError, ConflictError, NotFoundError } from '../lib/errors';
import { loanKey, titleKey } from '../lib/keys';
import { metrics } from '../lib/observability';
import * as repository from './repository';

/*
 * Exchange collections (decision 031): a public library's books on loan to the school. They
 * keep the library's barcodes, are lent at the desk like any book, and all leave the catalogue
 * together when the collection goes back. The collection itself stays, with how often its
 * books were lent, for the library's evaluation.
 */

export async function createExchange(
  actor: Actor,
  input: CreateExchangeRequest,
  now = new Date(),
): Promise<ExchangeCollection> {
  const exchange: ExchangeCollection = {
    ...input,
    id: ulid(),
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await repository.putNewExchange(
    exchange,
    auditItem({ entity: `EXCHANGE#${exchange.id}`, action: 'exchange.created', actor }, now),
  );
  return exchange;
}

export async function listExchanges(): Promise<ExchangeSummary[]> {
  const exchanges = await repository.listExchanges();
  const summaries = await Promise.all(
    exchanges.map(async (exchange): Promise<ExchangeSummary> => {
      if (exchange.status === 'returned') {
        // The saved book list is for the collection's own page, not the overview.
        const { returnedBooks: _books, ...rest } = exchange;
        return {
          ...rest,
          books: exchange.bookCount ?? 0,
          onLoan: 0,
          loans: exchange.loans ?? 0,
        };
      }
      const copies = await repository.copiesOf(exchange.id);
      return {
        ...exchange,
        books: copies.length,
        onLoan: copies.filter((copy) => copy.status === 'onLoan').length,
        loans: exchange.loans ?? 0,
      };
    }),
  );
  // Active first, then by return date: what needs attention comes first.
  return summaries.sort(
    (a, b) =>
      Number(a.status === 'returned') - Number(b.status === 'returned') ||
      a.returnBy.localeCompare(b.returnBy),
  );
}

async function activeExchange(exchangeId: string) {
  const exchange = await repository.getExchange(exchangeId);
  if (!exchange) throw new NotFoundError('Exchange');
  if (exchange.status !== 'active') {
    throw new ConflictError('EXCHANGE_RETURNED', 'This exchange collection was already returned');
  }
  return exchange;
}

/** The collection with every book, and for books on loan who has them (to ask them back). */
export async function getExchange(exchangeId: string): Promise<ExchangeDetail> {
  const exchange = await repository.getExchange(exchangeId);
  if (!exchange) throw new NotFoundError('Exchange');
  const copies = exchange.status === 'active' ? await repository.copiesOf(exchangeId) : [];
  const [titles, loans] = await Promise.all([
    repository.titlesById(copies.map((copy) => copy.titleId)),
    repository.loansById(
      copies.flatMap((copy) =>
        copy.currentLoan
          ? [{ readerId: copy.currentLoan.readerId, loanId: copy.currentLoan.loanId }]
          : [],
      ),
    ),
  ]);

  const bookList = copies
    .map((copy) => {
      const title = titles.get(keyId(titleKey(copy.titleId)));
      const loan = copy.currentLoan
        ? loans.get(keyId(loanKey(copy.currentLoan.readerId, copy.currentLoan.loanId)))
        : undefined;
      return {
        id: copy.id,
        barcode: copy.barcode,
        status: copy.status,
        loans: copy.loanCount ?? 0,
        titleId: copy.titleId,
        title: title && {
          title: title.title,
          authors: title.authors,
          aviLevel: title.aviLevel,
          isbn: title.isbn,
        },
        loan: loan && {
          readerName: loan.readerName,
          readerGroup: loan.readerGroup,
          dueDate: loan.dueDate,
        },
      };
    })
    .sort((a, b) => (a.title?.title ?? '').localeCompare(b.title?.title ?? '', 'nl'));

  return {
    ...exchange,
    // Once returned the books are gone; the count saved at returning is what it had.
    books: exchange.status === 'returned' ? (exchange.bookCount ?? 0) : copies.length,
    onLoan: copies.filter((copy) => copy.status === 'onLoan').length,
    loans: exchange.loans ?? 0,
    bookList,
  };
}

/**
 * Adds books with the library's own barcodes. A row names an existing title (found by ISBN in
 * the catalogue) or brings the data for a new one; the same new ISBN twice in one batch makes
 * one title. Every row gets its own result; one bad row never blocks the others.
 */
export async function addExchangeBooks(
  actor: Actor,
  exchangeId: string,
  rows: unknown[],
  now = new Date(),
): Promise<AddExchangeBookResult[]> {
  // Only while the collection is at the school; the result itself isn't needed.
  await activeExchange(exchangeId);
  const createdByIsbn = new Map<string, string>();
  const results: AddExchangeBookResult[] = [];

  for (const [index, row] of rows.entries()) {
    const parsed = ExchangeBookSchema.safeParse(row);
    if (!parsed.success) {
      results.push({ index, status: 'failed', code: 'VALIDATION_FAILED' });
      continue;
    }
    const book = parsed.data;
    try {
      let titleId =
        'titleId' in book ? book.titleId : book.title.isbn && createdByIsbn.get(book.title.isbn);
      if (!titleId && 'title' in book) {
        const title = await createTitle(actor, book.title, book.coverUrl, now, { exchangeId });
        titleId = title.id;
        if (book.title.isbn) createdByIsbn.set(book.title.isbn, title.id);
      }
      if (!titleId) throw new AppError(400, 'VALIDATION_FAILED', 'No title for this book');
      await addCopy(
        actor,
        titleId,
        // No location: that's where the book stands in the school library, which the
        // librarian sets; where it comes from is the exchange collection itself.
        { barcode: book.barcode },
        now,
        { exchangeId },
      );
      results.push({ index, status: 'added', titleId, barcode: book.barcode });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      results.push({ index, status: 'failed', code: error.code });
    }
  }
  metrics.addMetric(
    'ExchangeBooksAdded',
    MetricUnit.Count,
    results.filter((r) => r.status === 'added').length,
  );
  return results;
}

/**
 * The collection goes back to the library: every book leaves the catalogue (and titles made
 * only for it), the barcodes become free again. Refused while books are still lent out, so
 * nobody keeps a book that is no longer in the system.
 */
export async function returnExchange(
  actor: Actor,
  exchangeId: string,
  now = new Date(),
): Promise<ExchangeCollection> {
  const exchange = await activeExchange(exchangeId);
  const copies = await repository.copiesOf(exchangeId);
  const onLoan = copies.filter((copy) => copy.status === 'onLoan').length;
  if (onLoan > 0) {
    throw new AppError(409, 'EXCHANGE_HAS_LOANS', 'Some books are still on loan', {
      count: onLoan,
    });
  }

  // What the library evaluates, saved before the books leave the catalogue.
  const titles = await repository.titlesById(copies.map((copy) => copy.titleId));
  const books = copies
    .map((copy) => {
      const title = titles.get(keyId(titleKey(copy.titleId)));
      return {
        barcode: copy.barcode,
        title: title?.title ?? '?',
        authors: title?.authors ?? [],
        ...(title?.isbn ? { isbn: title.isbn } : {}),
        ...(title?.aviLevel ? { aviLevel: title.aviLevel } : {}),
        loans: copy.loanCount ?? 0,
      };
    })
    .sort((a, b) => b.loans - a.loans || a.title.localeCompare(b.title, 'nl'));

  let removed = 0;
  for (const copy of copies) {
    const audit = auditItem(
      { entity: `COPY#${copy.id}`, action: 'copy.returnedToLibrary', actor },
      now,
    );
    if (await repository.removeCopy(copy, audit)) removed++;
  }
  // Lent at the very last moment: stop before anything else changes, the list shows it.
  if (removed < copies.length) {
    throw new AppError(409, 'EXCHANGE_HAS_LOANS', 'A book was lent while returning', {
      count: copies.length - removed,
    });
  }

  for (const title of titles.values()) {
    if (title.exchangeId !== exchangeId || !(await repository.hasNoCopies(title.id))) continue;
    if (title.coverImageKey) await deleteCover(title.coverImageKey);
    await repository.deleteTitle(
      title.id,
      auditItem({ entity: `TITLE#${title.id}`, action: 'title.deleted', actor }, now),
    );
  }

  const returnedOn = localDate(now);
  await repository.markReturned(exchangeId, returnedOn, books, now.toISOString());
  metrics.addMetric('ExchangeReturned', MetricUnit.Count, 1);
  return { ...exchange, status: 'returned', returnedOn, bookCount: copies.length };
}
