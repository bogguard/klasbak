import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  calculateDueDate,
  isOverdue,
  localDate,
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
import { getReader } from '../readers/repository';
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
