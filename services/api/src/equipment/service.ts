import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  assetBarcode,
  readerName,
  type Asset,
  type AssetDetail,
  type AssetInput,
  type AssetHolder,
  type AssetRecipient,
  type Assignment,
  type CreateAssetResult,
  type CreateAssetsRequest,
} from '@klasbak/shared';
import { ulid } from 'ulid';
import { getSettings } from '../circulation/repository';
import { auditItem } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { env } from '../lib/aws';
import { getCodePointer, nextCounterValue } from '../lib/dynamo';
import { AppError, ConflictError, NotFoundError } from '../lib/errors';
import { metrics } from '../lib/observability';
import { getReader, listReaders } from '../readers/repository';
import * as repository from './repository';

const EDITABLE_FIELDS = [
  'kind',
  'name',
  'serialNumber',
  'location',
  'status',
  'note',
  'purchasedOn',
  'warrantyUntil',
] as const;

/** A module that is off refuses requests, whoever asks (decision 036). */
export async function assertEquipmentEnabled(): Promise<void> {
  const { modules } = await getSettings();
  if (!modules.equipment) throw new AppError(403, 'MODULE_OFF', 'This module is switched off');
}

export function listAssets(): Promise<Asset[]> {
  return repository.listAssets();
}

export async function getAssetDetail(assetId: string): Promise<AssetDetail> {
  const [asset, history] = await Promise.all([
    repository.getAsset(assetId),
    repository.assetHistory(assetId),
  ]);
  if (!asset) throw new NotFoundError('Asset');
  return { asset, history };
}

/** Sequential on purpose: labels are numbered in the order of the list that was scanned. */
export async function createAssets(
  actor: Actor,
  { details, serialNumbers, quantity }: CreateAssetsRequest,
  now = new Date(),
): Promise<CreateAssetResult[]> {
  const lines =
    serialNumbers.length > 0 ? serialNumbers : Array<undefined>(quantity ?? 0).fill(undefined);
  const results: CreateAssetResult[] = [];
  for (const serialNumber of lines) {
    results.push(await createAsset(actor, details, serialNumber, now));
  }
  metrics.addMetric(
    'AssetsAdded',
    MetricUnit.Count,
    results.filter((result) => result.status === 'created').length,
  );
  return results;
}

async function createAsset(
  actor: Actor,
  details: CreateAssetsRequest['details'],
  serialNumber: string | undefined,
  now: Date,
): Promise<CreateAssetResult> {
  // Checked first, so pasting a list again doesn't use up label numbers.
  if (serialNumber && (await getCodePointer(serialNumber))) {
    return { status: 'duplicate', serialNumber };
  }
  const id = ulid(now.getTime());
  const asset: Asset = {
    ...details,
    id,
    barcode: assetBarcode(env.institutionNumber, await nextCounterValue('ASSET')),
    serialNumber,
    status: 'available',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1,
  };
  const stored = await repository.putNewAsset(
    asset,
    auditItem({ entity: `ASSET#${id}`, action: 'asset.created', actor }, now),
  );
  if (stored) return { status: 'created', asset };
  // Another request won the race for this serial number: the same outcome as the check above.
  return { status: 'duplicate', serialNumber: serialNumber as string };
}

export async function updateAsset(
  actor: Actor,
  assetId: string,
  input: AssetInput,
  expectedVersion: number,
  now = new Date(),
): Promise<Asset> {
  const existing = await repository.getAsset(assetId);
  if (!existing) throw new NotFoundError('Asset');
  if (existing.status === 'assigned' && input.status) {
    throw new ConflictError('ASSET_ASSIGNED', 'Take this item back first');
  }
  // From the input, not over `existing`: a field left empty in the form must be cleared.
  const { id, barcode, holder, labelPrintedAt, createdAt } = existing;
  const updated: Asset = {
    id,
    barcode,
    holder,
    labelPrintedAt,
    createdAt,
    ...input,
    status: input.status ?? existing.status,
    updatedAt: now.toISOString(),
    version: expectedVersion + 1,
  };
  const changedFields = EDITABLE_FIELDS.filter((field) => existing[field] !== updated[field]);
  await repository.saveAsset(
    updated,
    existing.serialNumber,
    expectedVersion,
    auditItem({ entity: `ASSET#${assetId}`, action: 'asset.updated', actor, changedFields }, now),
  );
  return updated;
}

/** Everyone who can receive something: the active readers, with no more than is needed. */
export async function listRecipients(): Promise<AssetRecipient[]> {
  const readers = await listReaders();
  return readers
    .filter((reader) => reader.active)
    .map(({ id, firstName, lastName, group, memberNumber, category }) => ({
      id,
      firstName,
      lastName,
      group,
      memberNumber,
      category,
    }));
}

/** Safe to repeat: a double click that hands an item to the same reader changes nothing. */
export async function assignAsset(
  actor: Actor,
  assetId: string,
  readerId: string,
  dueDate: string | undefined,
  now = new Date(),
): Promise<Asset> {
  const [asset, reader] = await Promise.all([repository.getAsset(assetId), getReader(readerId)]);
  if (!asset) throw new NotFoundError('Asset');
  if (!reader) throw new NotFoundError('Reader');
  if (asset.holder?.readerId === readerId) return asset;
  if (asset.status !== 'available') throw notAvailable();

  const nowIso = now.toISOString();
  const assignment: Assignment = {
    id: ulid(now.getTime()),
    assetId,
    assetName: `${asset.kind} ${asset.name}`,
    barcode: asset.barcode,
    readerId,
    readerName: readerName(reader),
    readerGroup: reader.group,
    assignedAt: nowIso,
    dueDate,
  };
  const holder: AssetHolder = {
    assignmentId: assignment.id,
    readerId,
    readerName: assignment.readerName,
    readerGroup: reader.group,
    since: nowIso,
    dueDate,
  };
  const failure = await repository.assign(
    assignment,
    holder,
    nowIso,
    auditItem({ entity: `ASSET#${assetId}`, action: 'asset.assigned', actor }, now),
  );
  if (failure === 'assetNotAvailable') throw notAvailable();
  if (failure === 'readerRefused') {
    throw new ConflictError('READER_INACTIVE', 'This reader is not active');
  }
  metrics.addMetric('AssetAssigned', MetricUnit.Count, 1);
  return {
    ...asset,
    status: 'assigned',
    holder,
    updatedAt: nowIso,
    version: asset.version + 1,
  };
}

function notAvailable(): ConflictError {
  return new ConflictError('ASSET_NOT_AVAILABLE', 'This item is not available');
}

/** Safe to repeat: an item that is already back stays as it is. */
export async function returnAsset(
  actor: Actor,
  assetId: string,
  status: 'available' | 'repair' | 'lost',
  now = new Date(),
): Promise<Asset> {
  const asset = await repository.getAsset(assetId);
  if (!asset) throw new NotFoundError('Asset');
  if (!asset.holder) return asset;

  const { holder, ...rest } = asset;
  const nowIso = now.toISOString();
  const taken = await repository.takeBack({
    asset,
    holder,
    status,
    now: nowIso,
    audit: auditItem({ entity: `ASSET#${assetId}`, action: 'asset.returned', actor }, now),
  });
  if (!taken) {
    const current = await repository.getAsset(assetId);
    if (!current) throw new NotFoundError('Asset');
    return current;
  }
  metrics.addMetric('AssetReturned', MetricUnit.Count, 1);
  return { ...rest, status, updatedAt: nowIso, version: asset.version + 1 };
}

export async function markLabelsPrinted(ids: string[], now = new Date()): Promise<void> {
  for (const id of ids) await repository.markLabelPrinted(id, now.toISOString());
}
