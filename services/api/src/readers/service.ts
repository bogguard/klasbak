import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  ReaderInputSchema,
  type ImportRowResult,
  type Loan,
  type Reader,
  type ReaderInput,
} from '@library/shared';
import { ulid } from 'ulid';
import { auditItem } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { getCodePointer } from '../lib/dynamo';
import { AppError, ConflictError, NotFoundError } from '../lib/errors';
import { metrics } from '../lib/observability';
import * as repository from './repository';

export function listReaders(): Promise<Reader[]> {
  return repository.listReaders();
}

export async function getReader(readerId: string): Promise<{ reader: Reader; loans: Loan[] }> {
  const result = await repository.getReaderWithLoans(readerId);
  if (!result) throw new NotFoundError('Reader');
  return result;
}

export async function createReader(
  actor: Actor,
  input: ReaderInput,
  now = new Date(),
): Promise<Reader> {
  const { memberNumber, ...details } = input;
  const reader: Reader = {
    ...details,
    id: ulid(),
    memberNumber: memberNumber ?? (await repository.nextMemberNumber()),
    activeLoanCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1,
  };
  await repository.putNewReader(
    reader,
    auditItem({ entity: `READER#${reader.id}`, action: 'reader.created', actor }, now),
  );
  metrics.addMetric('ReaderCreated', MetricUnit.Count, 1);
  return reader;
}

export async function updateReader(
  actor: Actor,
  readerId: string,
  input: Omit<ReaderInput, 'memberNumber'>,
  expectedVersion: number,
  now = new Date(),
): Promise<Reader> {
  const existing = await repository.getReader(readerId);
  if (!existing) throw new NotFoundError('Reader');
  const updated: Reader = {
    ...input,
    id: existing.id,
    memberNumber: existing.memberNumber,
    activeLoanCount: existing.activeLoanCount,
    createdAt: existing.createdAt,
    updatedAt: now.toISOString(),
    version: expectedVersion + 1,
  };
  const changedFields = (Object.keys(input) as (keyof typeof input)[]).filter(
    (field) => existing[field] !== updated[field],
  );
  await repository.updateReaderDetails(
    updated,
    expectedVersion,
    auditItem(
      { entity: `READER#${readerId}`, action: 'reader.updated', actor, changedFields },
      now,
    ),
  );
  return updated;
}

export async function deleteReader(
  actor: Actor,
  readerId: string,
  now = new Date(),
): Promise<void> {
  const { reader, loans } = await getReader(readerId);
  if (loans.some((loan) => !loan.returnedAt)) {
    throw new ConflictError('READER_HAS_LOANS', 'This reader still has books on loan');
  }
  await repository.deleteReaderAndHistory(
    reader,
    loans,
    auditItem({ entity: `READER#${readerId}`, action: 'reader.deleted', actor }, now),
  );
  metrics.addMetric('ReaderDeleted', MetricUnit.Count, 1);
}

/**
 * Imports a batch of rows (e.g. a class list). A row with a known card number updates that
 * reader, so the same list can be imported again next school year; other rows create readers.
 * Every row gets its own result; one bad row never blocks the others.
 */
export async function importReaders(actor: Actor, rows: unknown[]): Promise<ImportRowResult[]> {
  const results: ImportRowResult[] = [];
  // Sequential on purpose: batches are small and this keeps generated card numbers in order.
  for (const [index, row] of rows.entries()) {
    const parsed = ReaderInputSchema.safeParse(row);
    if (!parsed.success) {
      results.push({ index, status: 'failed', code: 'VALIDATION_FAILED' });
      continue;
    }
    try {
      results.push({ index, ...(await importRow(actor, parsed.data)) });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      results.push({ index, status: 'failed', code: error.code });
    }
  }
  return results;
}

async function importRow(
  actor: Actor,
  input: ReaderInput,
): Promise<{ status: 'created' | 'updated'; memberNumber: string }> {
  const pointer = input.memberNumber ? await getCodePointer(input.memberNumber) : undefined;
  if (pointer?.kind === 'copy') {
    throw new AppError(409, 'CODE_IN_USE', 'This number is used by a copy');
  }
  if (pointer?.kind === 'reader') {
    const existing = await repository.getReader(pointer.readerId);
    if (existing) {
      const { memberNumber: _ignored, ...details } = input;
      await updateReader(actor, existing.id, details, existing.version);
      return { status: 'updated', memberNumber: existing.memberNumber };
    }
  }
  const created = await createReader(actor, input);
  return { status: 'created', memberNumber: created.memberNumber };
}
