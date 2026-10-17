import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  matchReader,
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
 * Imports a batch of rows (e.g. a class list exported from the school administration). A row
 * about an existing reader (same school number, card number, or unique name; see
 * `matchReader`) updates that reader, so next school year's list can simply be imported again;
 * other rows create readers. Fields the file doesn't have (no email column, no category
 * column) keep their current value. One bad row never blocks the others.
 */
export async function importReaders(actor: Actor, rows: unknown[]): Promise<ImportRowResult[]> {
  // A few hundred readers at school scale: matching in memory is simple and cheap.
  const readers = await repository.listReaders();
  const results: ImportRowResult[] = [];
  // Sequential on purpose: batches are small and this keeps generated card numbers in order.
  for (const [index, row] of rows.entries()) {
    const parsed = ReaderInputSchema.safeParse(row);
    if (!parsed.success) {
      results.push({ index, status: 'failed', code: 'VALIDATION_FAILED' });
      continue;
    }
    try {
      const { status, reader } = await importRow(actor, parsed.data, row, readers);
      const known = readers.findIndex((r) => r.id === reader.id);
      if (known >= 0) readers[known] = reader;
      else readers.push(reader);
      results.push({ index, status, memberNumber: reader.memberNumber });
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
  raw: unknown,
  readers: Reader[],
): Promise<{ status: 'created' | 'updated'; reader: Reader }> {
  const pointer = input.memberNumber ? await getCodePointer(input.memberNumber) : undefined;
  if (pointer?.kind === 'copy') {
    throw new AppError(409, 'CODE_IN_USE', 'This number is used by a copy');
  }
  const existing = matchReader(input, readers);
  if (!existing) return { status: 'created', reader: await createReader(actor, input) };

  // Only what the file has: a list without an email column must not erase emails.
  const sent = (field: keyof ReaderInput) =>
    typeof raw === 'object' && raw !== null && field in raw;
  const { memberNumber: _fixed, ...details } = input;
  const merged = {
    ...details,
    group: sent('group') ? details.group : existing.group,
    email: sent('email') ? details.email : existing.email,
    schoolNumber: sent('schoolNumber') ? details.schoolNumber : existing.schoolNumber,
    category: sent('category') ? details.category : existing.category,
  };
  return {
    status: 'updated',
    reader: await updateReader(actor, existing.id, merged, existing.version),
  };
}

/**
 * Sets readers inactive (pupils who left, after importing the new school year's list). They
 * keep their card number and history until the retention period or an administrator removes
 * them; books they still have stay on the overdue lists.
 */
export async function deactivateReaders(
  actor: Actor,
  readerIds: string[],
): Promise<{ deactivated: number }> {
  let deactivated = 0;
  for (const id of readerIds) {
    const reader = await repository.getReader(id);
    if (!reader?.active) continue;
    const { firstName, lastName, group, schoolNumber, category, email } = reader;
    await updateReader(
      actor,
      id,
      { firstName, lastName, group, schoolNumber, category, email, active: false },
      reader.version,
    );
    deactivated++;
  }
  return { deactivated };
}
