import type {
  Copy,
  CopyInput,
  IsbnLookupResult,
  PublicTitle,
  Title,
  TitleInput,
  TitleWithCopies,
} from '@library/shared';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { ulid } from 'ulid';
import { auditItem } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { ConflictError, NotFoundError } from '../lib/errors';
import { metrics } from '../lib/observability';
import { deleteCover, storeCover, storeUploadedCover } from './covers';
import { lookupIsbn } from './isbn-lookup';
import * as repository from './repository';

const BARCODE_DIGITS = 8;

export async function getPublicTitle(titleId: string): Promise<PublicTitle> {
  const title = await getTitle(titleId);
  return {
    ...title,
    // Internal notes ("pages 3-5 torn") are for staff only.
    copies: title.copies
      .filter((copy) => copy.status !== 'withdrawn')
      .map(({ id, status, location }) => ({ id, status, location })),
  };
}

export async function getTitle(titleId: string): Promise<TitleWithCopies> {
  const title = await repository.getTitleWithCopies(titleId);
  if (!title) throw new NotFoundError('Title');
  return title;
}

export async function createTitle(
  actor: Actor,
  input: TitleInput,
  coverUrl: string | undefined,
  now = new Date(),
): Promise<Title> {
  const id = ulid();
  const coverImageKey = coverUrl ? await storeCover(id, coverUrl) : undefined;
  const title: Title = {
    ...input,
    id,
    coverImageKey,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1,
  };
  await repository.putNewTitle(
    title,
    auditItem({ entity: `TITLE#${id}`, action: 'title.created', actor }, now),
  );
  metrics.addMetric('TitleCreated', MetricUnit.Count, 1);
  return title;
}

export async function updateTitle(
  actor: Actor,
  titleId: string,
  input: TitleInput,
  expectedVersion: number,
  now = new Date(),
): Promise<Title> {
  const { copies: _copies, ...existing } = await getTitle(titleId);
  const updated: Title = {
    ...input,
    id: existing.id,
    coverImageKey: existing.coverImageKey,
    createdAt: existing.createdAt,
    updatedAt: now.toISOString(),
    version: expectedVersion + 1,
  };
  const audit = auditItem(
    {
      entity: `TITLE#${titleId}`,
      action: 'title.updated',
      actor,
      changedFields: changedFields(existing, updated),
    },
    now,
  );
  await repository.replaceTitle(updated, expectedVersion, audit);
  return updated;
}

export async function addCopy(
  actor: Actor,
  titleId: string,
  input: CopyInput,
  now = new Date(),
): Promise<Copy> {
  const barcode = input.barcode ?? formatBarcode(await repository.nextBarcodeNumber());
  const copy: Copy = {
    id: ulid(),
    titleId,
    barcode,
    status: 'available',
    // A generated barcode needs a printed label; a typed one usually has a sticker already.
    labelPending: input.barcode === undefined,
    location: input.location,
    note: input.note,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await repository.putNewCopy(
    copy,
    auditItem({ entity: `COPY#${copy.id}`, action: 'copy.created', actor }, now),
  );
  metrics.addMetric('CopyCreated', MetricUnit.Count, 1);
  return copy;
}

export async function getCopyByBarcode(barcode: string): Promise<Copy> {
  const copy = await repository.getCopyByBarcode(barcode);
  if (!copy) throw new NotFoundError('Copy');
  return copy;
}

export type CopyChanges = {
  status?: Exclude<Copy['status'], 'onLoan'>;
  location?: string | null;
  note?: string | null;
};

export async function updateCopy(
  actor: Actor,
  barcode: string,
  changes: CopyChanges,
  now = new Date(),
): Promise<Copy> {
  const existing = await getCopyByBarcode(barcode);
  // Loans are created and ended by circulation only; this keeps loans and copy status consistent.
  if (changes.status && existing.status === 'onLoan') {
    throw new ConflictError('COPY_ON_LOAN', 'Return this copy before changing its status');
  }
  const updated: Copy = {
    ...existing,
    status: changes.status ?? existing.status,
    location: changes.location === null ? undefined : (changes.location ?? existing.location),
    note: changes.note === null ? undefined : (changes.note ?? existing.note),
    updatedAt: now.toISOString(),
  };
  const audit = auditItem(
    {
      entity: `COPY#${existing.id}`,
      action: 'copy.updated',
      actor,
      changedFields: changedFields(existing, updated),
    },
    now,
  );
  await repository.replaceCopy(updated, existing.status, audit);
  return updated;
}

export async function findByIsbn(isbn13: string): Promise<IsbnLookupResult> {
  const result = await lookupIsbn(isbn13);
  if (!result) throw new NotFoundError('ISBN');
  return result;
}

/** System barcodes are zero-padded numbers, e.g. 00000042, so they sort and scan reliably. */
export function formatBarcode(n: number): string {
  return String(n).padStart(BARCODE_DIGITS, '0');
}

function changedFields<T extends object>(before: T, after: T): string[] {
  const ignored = new Set(['updatedAt', 'version']);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (key) =>
      !ignored.has(key) &&
      JSON.stringify(before[key as keyof T]) !== JSON.stringify(after[key as keyof T]),
  );
}

export function getCopyLabels(codes: string[]) {
  return repository.getCopyLabels([...new Set(codes)]);
}

/** Replaces the cover with an uploaded image; returns the new cover's key. */
export async function uploadCover(
  actor: Actor,
  titleId: string,
  image: Uint8Array,
  now = new Date(),
): Promise<{ coverImageKey: string }> {
  const { coverImageKey: previous } = await getTitle(titleId);
  const coverImageKey = await storeUploadedCover(titleId, image);
  await repository.setCoverImageKey(
    titleId,
    coverImageKey,
    now.toISOString(),
    auditItem({ entity: `TITLE#${titleId}`, action: 'title.coverUploaded', actor }, now),
  );
  if (previous) await deleteCover(previous);
  return { coverImageKey };
}

export async function removeCover(actor: Actor, titleId: string, now = new Date()): Promise<void> {
  const { coverImageKey: previous } = await getTitle(titleId);
  if (!previous) return;
  await repository.setCoverImageKey(
    titleId,
    undefined,
    now.toISOString(),
    auditItem({ entity: `TITLE#${titleId}`, action: 'title.coverRemoved', actor }, now),
  );
  await deleteCover(previous);
}

/** The label print queue: copies whose barcode label hasn't been printed yet. */
export function pendingLabels() {
  return repository.pendingLabels();
}

export function markLabelsPrinted(codes: string[]) {
  return repository.markLabelsPrinted([...new Set(codes)]);
}
