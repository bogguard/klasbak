import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  calculateDueDate,
  isOverdue,
  localDate,
  monthsBetween,
  type LoanStatistics,
  type MyBooks,
  readerName,
  type Copy,
  type LibrarySettings,
  type LibrarySettingsInput,
  type Loan,
  type Reader,
  type ReaderAtDesk,
  type ScanResult,
  type Title,
} from '@library/shared';
import { ulid } from 'ulid';
import { auditItem } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { getCodePointer, getItem } from '../lib/dynamo';
import { AppError, ConflictError, NotFoundError } from '../lib/errors';
import { copyKey, titleKey } from '../lib/keys';
import { metrics } from '../lib/observability';
import { getReader, listReaders } from '../readers/repository';
import * as repository from './repository';

/** A second scan of the same book for the same reader within this time is a double scan. */
const DOUBLE_SCAN_WINDOW_MS = 60_000;

/**
 * Everything the desk does goes through one scan, so the librarian never has to choose a mode:
 *   reader card        → that reader is now at the desk
 *   book on loan       → it is returned (whoever had it)
 *   available book     → it is lent to the reader at the desk
 * The decision is made on the server, in one place, with the database enforcing the rules.
 */
export async function scan(
  actor: Actor,
  code: string,
  deskReaderId: string | undefined,
  now = new Date(),
): Promise<ScanResult> {
  const pointer = await getCodePointer(code);
  if (!pointer) throw new AppError(404, 'UNKNOWN_CODE', 'No copy or reader has this code');

  if (pointer.kind === 'reader') {
    return { outcome: 'reader', ...(await readerAtDesk(pointer.readerId)) };
  }

  const copy = await getItem<Copy>(copyKey(pointer.titleId, pointer.copyId));
  if (!copy) throw new AppError(404, 'UNKNOWN_CODE', 'No copy or reader has this code');

  if (copy.status === 'onLoan' && copy.currentLoan) {
    const { readerId, loanedAt, loanId } = copy.currentLoan;
    const justLent = now.getTime() - Date.parse(loanedAt) < DOUBLE_SCAN_WINDOW_MS;
    if (readerId === deskReaderId && justLent) {
      const loan = await repository.getLoan(readerId, loanId);
      if (loan) return { outcome: 'alreadyLoaned', loan, ...(await readerAtDesk(readerId)) };
    }
    return checkIn(actor, copy, now);
  }

  if (copy.status !== 'available') {
    throw new AppError(409, 'COPY_NOT_LENDABLE', 'This copy cannot be lent', {
      status: copy.status,
    });
  }
  if (!deskReaderId) {
    throw new AppError(409, 'NO_READER_SELECTED', 'Scan a reader card first');
  }
  return checkOut(actor, copy, deskReaderId, now);
}

async function readerAtDesk(readerId: string): Promise<ReaderAtDesk> {
  const [reader, activeLoans] = await Promise.all([
    getReader(readerId),
    repository.activeLoansOfReader(readerId),
  ]);
  if (!reader) throw new NotFoundError('Reader');
  return { reader, activeLoans };
}

async function checkOut(
  actor: Actor,
  copy: Copy,
  readerId: string,
  now: Date,
): Promise<ScanResult> {
  const [reader, title, settings] = await Promise.all([
    getReader(readerId),
    getItem<Title>(titleKey(copy.titleId)),
    repository.getSettings(),
  ]);
  if (!reader) throw new NotFoundError('Reader');

  const policy = settings.loanPolicies[reader.category];
  const loan: Loan = {
    id: ulid(now.getTime()),
    readerId,
    readerName: readerName(reader),
    readerGroup: reader.group,
    titleId: copy.titleId,
    titleTitle: title?.title ?? '?',
    copyId: copy.id,
    barcode: copy.barcode,
    loanedAt: now.toISOString(),
    dueDate: calculateDueDate(localDate(now), reader.category, settings),
  };

  const failure = await repository.checkOut({
    loan,
    copy,
    maxLoans: policy.maxLoans,
    audit: auditItem({ entity: `COPY#${copy.id}`, action: 'loan.created', actor }, now),
    // Classes are counted for pupils only: the statistics compare reading per class.
    stats: {
      month: localDate(now).slice(0, 7),
      group: reader.category === 'pupil' ? reader.group : undefined,
    },
  });
  if (failure === 'copyNotAvailable') {
    throw new ConflictError('COPY_NOT_AVAILABLE', 'This copy was just lent or changed');
  }
  if (failure === 'readerRefused') throw readerRefusal(reader, policy.maxLoans);

  metrics.addMetric('LoanCreated', MetricUnit.Count, 1);
  return { outcome: 'checkedOut', loan, ...(await readerAtDesk(readerId)) };
}

function readerRefusal(reader: Reader, maxLoans: number): AppError {
  return reader.active
    ? new AppError(409, 'MAX_LOANS_REACHED', 'This reader has the maximum number of loans', {
        maxLoans,
      })
    : new AppError(409, 'READER_INACTIVE', 'This reader is not active');
}

async function checkIn(actor: Actor, copy: Copy, now: Date): Promise<ScanResult> {
  // Only called for copies with a current loan.
  const { readerId, loanId } = copy.currentLoan as NonNullable<Copy['currentLoan']>;
  const loan = await repository.getLoan(readerId, loanId);
  if (!loan) throw new NotFoundError('Loan');

  const returned = await repository.checkIn({
    loan,
    copy,
    returnedAt: now.toISOString(),
    audit: auditItem({ entity: `COPY#${copy.id}`, action: 'loan.returned', actor }, now),
  });
  if (!returned) {
    const title = await getItem<Title>(titleKey(copy.titleId));
    return {
      outcome: 'alreadyReturned',
      copy,
      title: { id: copy.titleId, title: title?.title ?? '?' },
    };
  }

  const wasOverdue = isOverdue(loan, localDate(now));
  metrics.addMetric('LoanReturned', MetricUnit.Count, 1);
  if (wasOverdue) metrics.addMetric('LoanReturnedOverdue', MetricUnit.Count, 1);
  return { outcome: 'returned', loan: { ...loan, returnedAt: now.toISOString() }, wasOverdue };
}

/**
 * Extends a loan from today with the reader's normal loan period (closed days skipped).
 * Refused when that wouldn't be later than the current due date. No maximum yet: the librarian decides; a limit
 * belongs with reservations (someone else waiting for the book).
 */
export async function renewLoan(
  actor: Actor,
  readerId: string,
  loanId: string,
  now = new Date(),
): Promise<{ loan: Loan } & ReaderAtDesk> {
  const [reader, loan, settings] = await Promise.all([
    getReader(readerId),
    repository.getLoan(readerId, loanId),
    repository.getSettings(),
  ]);
  if (!reader || !loan) throw new NotFoundError('Loan');
  if (loan.returnedAt) throw new ConflictError('LOAN_NOT_ACTIVE', 'This book was already returned');
  if (!reader.active) throw new AppError(409, 'READER_INACTIVE', 'This reader is not active');

  const copy = await getItem<Copy>(copyKey(loan.titleId, loan.copyId));
  if (!copy) throw new NotFoundError('Copy');
  const dueDate = calculateDueDate(localDate(now), reader.category, settings);
  if (dueDate <= loan.dueDate) {
    // E.g. just lent: renewing wouldn't give more time, so don't pretend it did.
    throw new AppError(409, 'RENEWAL_NOT_LONGER', 'The due date would not move', {
      dueDate: loan.dueDate,
    });
  }

  const renewed = await repository.renew({
    loan,
    copy,
    dueDate,
    audit: auditItem({ entity: `COPY#${copy.id}`, action: 'loan.renewed', actor }, now),
  });
  if (!renewed) throw new ConflictError('LOAN_NOT_ACTIVE', 'This book was already returned');
  metrics.addMetric('LoanRenewed', MetricUnit.Count, 1);
  return {
    loan: { ...loan, dueDate, renewals: (loan.renewals ?? 0) + 1 },
    ...(await readerAtDesk(readerId)),
  };
}

/**
 * The "Mijn boeken" screen: a reader scans their own card and sees what they have and until
 * when. Read-only, so a pupil at that screen can't lend or return anything.
 */
export async function myBooks(code: string): Promise<MyBooks> {
  const pointer = await getCodePointer(code);
  if (!pointer) throw new AppError(404, 'UNKNOWN_CODE', 'No copy or reader has this code');
  if (pointer.kind !== 'reader') {
    throw new AppError(409, 'NOT_A_READER_CARD', 'This is a book, not a reader card');
  }
  const { reader, activeLoans } = await readerAtDesk(pointer.readerId);
  return {
    firstName: reader.firstName,
    loans: activeLoans
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map(({ id, titleTitle, dueDate }) => ({ id, titleTitle, dueDate })),
  };
}

/** Anonymous loan counts per month, title and class (decision 028). */
export async function statistics(from: string, to: string): Promise<LoanStatistics> {
  const months = monthsBetween(from, to);
  const [counters, readers] = await Promise.all([repository.statisticsOf(months), listReaders()]);

  const perMonth = new Map(months.map((month) => [month, 0]));
  const titles = new Map<string, number>();
  const groups = new Map<string, number>();
  for (const { month, sk, loans } of counters) {
    if (sk === 'TOTAL') perMonth.set(month, (perMonth.get(month) ?? 0) + loans);
    else if (sk.startsWith('TITLE#')) add(titles, sk.slice('TITLE#'.length), loans);
    else if (sk.startsWith('GROUP#')) add(groups, sk.slice('GROUP#'.length), loans);
  }

  // Classes as they are now, so classes without loans show up too (with 0).
  const pupils = new Map<string, number>();
  for (const reader of readers) {
    if (reader.active && reader.category === 'pupil' && reader.group) add(pupils, reader.group, 1);
  }
  const groupNames = new Set([...groups.keys(), ...pupils.keys()]);

  return {
    months: [...perMonth].map(([month, loans]) => ({ month, loans })),
    titles: [...titles]
      .map(([titleId, loans]) => ({ titleId, loans }))
      .sort((a, b) => b.loans - a.loans),
    groups: [...groupNames].map((group) => ({
      group,
      loans: groups.get(group) ?? 0,
      pupils: pupils.get(group) ?? 0,
    })),
  };
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

export function listLoans(filter: { overdue: boolean }, now = new Date()): Promise<Loan[]> {
  return repository.listActiveLoans(filter.overdue ? localDate(now) : undefined);
}

export function getSettings(): Promise<LibrarySettings> {
  return repository.getSettings();
}

export async function updateSettings(
  actor: Actor,
  input: LibrarySettingsInput,
  expectedVersion: number,
  now = new Date(),
): Promise<LibrarySettings> {
  const settings: LibrarySettings = { ...input, version: expectedVersion + 1 };
  await repository.saveSettings(
    settings,
    expectedVersion,
    auditItem({ entity: 'SETTINGS#LIBRARY', action: 'settings.updated', actor }, now),
  );
  return settings;
}
