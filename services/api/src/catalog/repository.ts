import { ScanCommand, TransactWriteCommand, type ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import type { Copy, CopyLabel, Title, TitleWithCopies } from '@library/shared';
import { db, env } from '../lib/aws';
import {
  batchGetItems,
  failedConditionAt,
  getCodePointer,
  getItem,
  keyId,
  nextCounterValue,
  queryAll,
  stripKeys,
  type Item,
} from '../lib/dynamo';
import { ConflictError, NotFoundError } from '../lib/errors';
import { codeKey, copyKey, titleKey, type CodePointer } from '../lib/keys';

export async function getTitleWithCopies(titleId: string): Promise<TitleWithCopies | undefined> {
  const items = await queryAll({
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': titleKey(titleId).pk },
  });

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
/**
 * Changes only the cover. It deliberately leaves `version` alone: a librarian editing the
 * title's details at the same time can still save without a conflict.
 */
export async function setCoverImageKey(
  titleId: string,
  coverImageKey: string | undefined,
  updatedAt: string,
  audit: Item,
): Promise<void> {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: titleKey(titleId),
              UpdateExpression: coverImageKey
                ? 'SET coverImageKey = :key, updatedAt = :now'
                : 'SET updatedAt = :now REMOVE coverImageKey',
              ConditionExpression: 'attribute_exists(pk)',
              ExpressionAttributeValues: {
                ':now': updatedAt,
                ...(coverImageKey ? { ':key': coverImageKey } : {}),
              },
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
  } catch (error) {
    if (failedConditionAt(error, 0)) throw new NotFoundError('Title');
    throw error;
  }
}

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

export function nextBarcodeNumber(): Promise<number> {
  return nextCounterValue('BARCODE');
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
              Item: {
                ...codeKey(copy.barcode),
                kind: 'copy',
                titleId: copy.titleId,
                copyId: copy.id,
              },
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
      throw new ConflictError('BARCODE_IN_USE', 'This code is already used by a copy or reader');
    }
    throw error;
  }
}

export async function getCopyByBarcode(barcode: string): Promise<Copy | undefined> {
  const pointer = await getCodePointer(barcode);
  if (pointer?.kind !== 'copy') return undefined;
  return getItem<Copy>(copyKey(pointer.titleId, pointer.copyId));
}

/** Title data for printing labels, in the order of `codes`; unknown codes are listed apart. */
export async function getCopyLabels(
  codes: string[],
): Promise<{ labels: CopyLabel[]; unknown: string[] }> {
  const pointers = await batchGetItems<CodePointer>(codes.map(codeKey));
  const copyPointer = (code: string) => {
    const pointer = pointers.get(keyId(codeKey(code)));
    // Pointers from before readers existed have no kind and are copies.
    return pointer && (pointer.kind ?? 'copy') === 'copy'
      ? (pointer as Extract<CodePointer, { kind: 'copy' }>)
      : undefined;
  };
  const titleIds = codes.flatMap((code) => copyPointer(code)?.titleId ?? []);
  const titles = await batchGetItems<Title>(titleIds.map(titleKey));

  const labels: CopyLabel[] = [];
  const unknown: string[] = [];
  for (const code of codes) {
    const title = titles.get(keyId(titleKey(copyPointer(code)?.titleId ?? '')));
    if (title)
      labels.push({ barcode: code, titleId: title.id, title: title.title, authors: title.authors });
    else unknown.push(code);
  }
  return { labels, unknown };
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
