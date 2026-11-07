import { TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Asset, Assignment } from '@klasbak/shared';
import { db, env } from '../lib/aws';
import { failedConditionAt, getItem, queryAll, stripKeys, type Item } from '../lib/dynamo';
import { ConflictError } from '../lib/errors';
import {
  assetHistoryIndexPk,
  assetKey,
  ASSETS_INDEX_PK,
  assignmentKey,
  codeKey,
  GSI1,
  readerKey,
} from '../lib/keys';

const assetItem = (asset: Asset) => ({
  ...assetKey(asset.id),
  ...asset,
  gsi1pk: ASSETS_INDEX_PK,
  gsi1sk: asset.id,
});

const codePointerPut = (code: string, assetId: string) => ({
  Put: {
    TableName: env.tableName,
    Item: { ...codeKey(code), kind: 'asset', assetId },
    ConditionExpression: 'attribute_not_exists(pk)',
  },
});

export function getAsset(assetId: string): Promise<Asset | undefined> {
  return getItem<Asset>(assetKey(assetId));
}

export async function listAssets(): Promise<Asset[]> {
  const items = await queryAll({
    IndexName: GSI1,
    KeyConditionExpression: 'gsi1pk = :pk',
    ExpressionAttributeValues: { ':pk': ASSETS_INDEX_PK },
  });
  return items.map((item) => stripKeys<Asset>(item));
}

/** Who had this item, newest first (assignment ids are time-ordered). */
export async function assetHistory(assetId: string): Promise<Assignment[]> {
  const items = await queryAll({
    IndexName: GSI1,
    KeyConditionExpression: 'gsi1pk = :pk',
    ExpressionAttributeValues: { ':pk': assetHistoryIndexPk(assetId) },
    ScanIndexForward: false,
  });
  return items.map((item) => stripKeys<Assignment>(item));
}

/**
 * Stores a new item with its codes. False when the serial number is already in use: by another
 * item, or as the code of a book or card, since a scanned code must mean one thing.
 */
export async function putNewAsset(asset: Asset, audit: Item): Promise<boolean> {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: env.tableName,
              Item: assetItem(asset),
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          codePointerPut(asset.barcode, asset.id),
          ...(asset.serialNumber ? [codePointerPut(asset.serialNumber, asset.id)] : []),
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
    return true;
  } catch (error) {
    if (asset.serialNumber && failedConditionAt(error, 2)) return false;
    throw error;
  }
}

/** Saves edited details; a changed serial number moves its code pointer in the same step. */
export async function saveAsset(
  asset: Asset,
  previousSerialNumber: string | undefined,
  expectedVersion: number,
  audit: Item,
): Promise<void> {
  const serialChanged = asset.serialNumber !== previousSerialNumber;
  const addsSerial = serialChanged && asset.serialNumber;
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: env.tableName,
              Item: assetItem(asset),
              ConditionExpression: '#version = :expected',
              ExpressionAttributeNames: { '#version': 'version' },
              ExpressionAttributeValues: { ':expected': expectedVersion },
            },
          },
          ...(addsSerial ? [codePointerPut(asset.serialNumber as string, asset.id)] : []),
          ...(serialChanged && previousSerialNumber
            ? [
                {
                  Delete: {
                    TableName: env.tableName,
                    Key: codeKey(previousSerialNumber),
                    ConditionExpression: 'assetId = :id',
                    ExpressionAttributeValues: { ':id': asset.id },
                  },
                },
              ]
            : []),
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
  } catch (error) {
    if (failedConditionAt(error, 0)) {
      throw new ConflictError('VERSION_CONFLICT', 'This item was changed by someone else');
    }
    if (addsSerial && failedConditionAt(error, 1)) {
      throw new ConflictError('SERIAL_IN_USE', 'This serial number is already in use');
    }
    throw error;
  }
}

export type AssignFailure = 'assetNotAvailable' | 'readerRefused';

/**
 * Hands an item to a reader. The database guarantees it: the item is still available (so it can
 * never be with two people) and the reader is active.
 */
export async function assign(
  assignment: Assignment,
  holder: NonNullable<Asset['holder']>,
  now: string,
  audit: Item,
): Promise<AssignFailure | undefined> {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: assetKey(assignment.assetId),
              UpdateExpression:
                'SET #status = :assigned, holder = :holder, updatedAt = :now ADD #version :one',
              ConditionExpression: '#status = :available',
              ExpressionAttributeNames: { '#status': 'status', '#version': 'version' },
              ExpressionAttributeValues: {
                ':assigned': 'assigned',
                ':available': 'available',
                ':holder': holder,
                ':now': now,
                ':one': 1,
              },
            },
          },
          {
            Update: {
              TableName: env.tableName,
              Key: readerKey(assignment.readerId),
              UpdateExpression: 'ADD activeAssetCount :one',
              ConditionExpression: 'active = :true',
              ExpressionAttributeValues: { ':one': 1, ':true': true },
            },
          },
          {
            Put: {
              TableName: env.tableName,
              Item: {
                ...assignmentKey(assignment.readerId, assignment.id),
                ...assignment,
                gsi1pk: assetHistoryIndexPk(assignment.assetId),
                gsi1sk: assignment.id,
              },
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
    return undefined;
  } catch (error) {
    if (failedConditionAt(error, 0)) return 'assetNotAvailable';
    if (failedConditionAt(error, 1)) return 'readerRefused';
    throw error;
  }
}

/** Takes an item back. False when someone else just did: the assignment is no longer current. */
export async function takeBack(params: {
  asset: Asset;
  holder: NonNullable<Asset['holder']>;
  status: Asset['status'];
  now: string;
  audit: Item;
}): Promise<boolean> {
  const { asset, holder, status, now, audit } = params;
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: assetKey(asset.id),
              UpdateExpression:
                'SET #status = :status, updatedAt = :now ADD #version :one REMOVE holder',
              ConditionExpression: 'holder.assignmentId = :assignmentId',
              ExpressionAttributeNames: { '#status': 'status', '#version': 'version' },
              ExpressionAttributeValues: {
                ':status': status,
                ':now': now,
                ':one': 1,
                ':assignmentId': holder.assignmentId,
              },
            },
          },
          {
            Update: {
              TableName: env.tableName,
              Key: readerKey(holder.readerId),
              UpdateExpression: 'ADD activeAssetCount :minusOne',
              // A reader with equipment can't be deleted, so this never recreates one.
              ConditionExpression: 'attribute_exists(pk)',
              ExpressionAttributeValues: { ':minusOne': -1 },
            },
          },
          {
            Update: {
              TableName: env.tableName,
              Key: assignmentKey(holder.readerId, holder.assignmentId),
              UpdateExpression: 'SET returnedAt = :now',
              ExpressionAttributeValues: { ':now': now },
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
    return true;
  } catch (error) {
    if (failedConditionAt(error, 0)) return false;
    throw error;
  }
}

export async function markLabelPrinted(assetId: string, now: string): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: assetKey(assetId),
      UpdateExpression: 'SET labelPrintedAt = :now',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':now': now },
    }),
  );
}
