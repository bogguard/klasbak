import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
  type QueryCommandOutput,
  type ScanCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import type { Copy, Title, TitleWithCopies } from '@library/shared';
import { db, env } from '../lib/aws';
import { ConflictError, NotFoundError } from '../lib/errors';

/*
 * Key design (single table, see docs/decisions.md):
 *   Title          pk TITLE#<titleId>    sk TITLE
 *   Copy           pk TITLE#<titleId>    sk COPY#<copyId>
 *   Barcode index  pk BARCODE#<barcode>  sk BARCODE    → { titleId, copyId }; guarantees uniqueness
 *   Counter        pk COUNTER            sk BARCODE    → last generated barcode number
 */
const titleKey = (titleId: string) => ({ pk: `TITLE#${titleId}`, sk: 'TITLE' });
const copyKey = (titleId: string, copyId: string) => ({
  pk: `TITLE#${titleId}`,
  sk: `COPY#${copyId}`,
});
const barcodeKey = (barcode: string) => ({ pk: `BARCODE#${barcode}`, sk: 'BARCODE' });

type Item = Record<string, unknown>;

function stripKeys<T>(item: Item): T {
  const { pk: _pk, sk: _sk, ...rest } = item;
  return rest as T;
}

export async function getTitleWithCopies(titleId: string): Promise<TitleWithCopies | undefined> {
  const items: Item[] = [];
  let startKey: Item | undefined;
  do {
    const page: QueryCommandOutput = await db.send(
      new QueryCommand({
        TableName: env.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `TITLE#${titleId}` },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  const titleItem = items.find((item) => item.sk === 'TITLE');
  if (!titleItem) return undefined;
  const copies = items
    .filter((item) => String(item.sk).startsWith('COPY#'))
    .map((item) => stripKeys<Copy>(item));
  return { ...stripKeys<Title>(titleItem), copies };
}

export async function putNewTitle(title: Title, audit: Item): Promise<void> {
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: env.tableName,
            Item: { ...titleKey(title.id), ...title },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        { Put: { TableName: env.tableName, Item: audit } },
      ],
    }),
  );
}

/** Replaces a title only if nobody else saved it in the meantime (optimistic locking). */
export async function replaceTitle(
  title: Title,
  expectedVersion: number,
  audit: Item,
): Promise<void> {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: env.tableName,
              Item: { ...titleKey(title.id), ...title },
              ConditionExpression: 'attribute_exists(pk) AND version = :expected',
              ExpressionAttributeValues: { ':expected': expectedVersion },
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
  } catch (error) {
    if (failedConditionAt(error, 0)) {
      throw new ConflictError('VERSION_CONFLICT', 'This title was changed by someone else');
    }
    throw error;
  }
}

/** Atomically reserves the next number for system-generated barcodes. */
export async function nextBarcodeNumber(): Promise<number> {
  const result = await db.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: { pk: 'COUNTER', sk: 'BARCODE' },
      UpdateExpression: 'ADD #value :one',
      ExpressionAttributeNames: { '#value': 'value' },
      ExpressionAttributeValues: { ':one': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return Number(result.Attributes?.value);
}

export async function putNewCopy(copy: Copy, audit: Item): Promise<void> {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: env.tableName,
              Key: titleKey(copy.titleId),
              ConditionExpression: 'attribute_exists(pk)',
            },
          },
          {
            Put: {
              TableName: env.tableName,
              Item: { ...barcodeKey(copy.barcode), titleId: copy.titleId, copyId: copy.id },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Put: { TableName: env.tableName, Item: { ...copyKey(copy.titleId, copy.id), ...copy } },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
  } catch (error) {
    if (failedConditionAt(error, 0)) throw new NotFoundError('Title');
    if (failedConditionAt(error, 1)) {
      throw new ConflictError('BARCODE_IN_USE', 'This barcode is already used by another copy');
    }
    throw error;
  }
}

export async function getCopyByBarcode(barcode: string): Promise<Copy | undefined> {
  const pointer = await db.send(
    new GetCommand({ TableName: env.tableName, Key: barcodeKey(barcode) }),
  );
  if (!pointer.Item) return undefined;
  const { titleId, copyId } = pointer.Item as { titleId: string; copyId: string };
  const copy = await db.send(
    new GetCommand({ TableName: env.tableName, Key: copyKey(titleId, copyId) }),
  );
  return copy.Item ? stripKeys<Copy>(copy.Item) : undefined;
}

/**
 * Saves a changed copy, but only if its status is still the one we read: a check-out or
 * check-in in the meantime must never be overwritten.
 */
export async function replaceCopy(
  copy: Copy,
  statusWhenRead: Copy['status'],
  audit: Item,
): Promise<void> {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: env.tableName,
              Item: { ...copyKey(copy.titleId, copy.id), ...copy },
              ConditionExpression: '#status = :statusWhenRead',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: { ':statusWhenRead': statusWhenRead },
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
  } catch (error) {
    if (failedConditionAt(error, 0)) {
      throw new ConflictError('COPY_CHANGED', 'This copy was changed meanwhile; reload and retry');
    }
    throw error;
  }
}

/** Reads every title; used to rebuild the search index. Fine for school-sized catalogues. */
export async function scanAllTitles(): Promise<Title[]> {
  const titles: Title[] = [];
  let startKey: Item | undefined;
  do {
    const page: ScanCommandOutput = await db.send(
      new ScanCommand({
        TableName: env.tableName,
        FilterExpression: 'sk = :sk',
        ExpressionAttributeValues: { ':sk': 'TITLE' },
        ExclusiveStartKey: startKey,
      }),
    );
    titles.push(...(page.Items ?? []).map((item) => stripKeys<Title>(item)));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return titles;
}

function failedConditionAt(error: unknown, index: number): boolean {
  return (
    error instanceof TransactionCanceledException &&
    error.CancellationReasons?.[index]?.Code === 'ConditionalCheckFailed'
  );
}
