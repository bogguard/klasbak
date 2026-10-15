import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Loan, Reader } from '@library/shared';
import { db, env } from '../lib/aws';
import {
  failedConditionAt,
  getItem,
  nextCounterValue,
  queryAll,
  stripKeys,
  type Item,
} from '../lib/dynamo';
import { ConflictError } from '../lib/errors';
import { codeKey, GSI1, READERS_INDEX_PK, readerKey } from '../lib/keys';

/** Sorts the reader list by class, then last name, then first name. */
function readerIndexKeys(reader: Reader) {
  const sortable = (value: string | undefined) => (value ?? '~').toLocaleLowerCase('nl');
  return {
    gsi1pk: READERS_INDEX_PK,
    gsi1sk: [
      sortable(reader.group),
      sortable(reader.lastName),
      sortable(reader.firstName),
      reader.id,
    ].join('#'),
  };
}

export function getReader(readerId: string): Promise<Reader | undefined> {
  return getItem<Reader>(readerKey(readerId));
}

export async function getReaderWithLoans(
  readerId: string,
): Promise<{ reader: Reader; loans: Loan[] } | undefined> {
  const items = await queryAll({
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': readerKey(readerId).pk },
    ScanIndexForward: false, // newest loans first (loan ids are time-ordered)
  });
  const readerItem = items.find((item) => item.sk === 'READER');
  if (!readerItem) return undefined;
  const loans = items
    .filter((item) => String(item.sk).startsWith('LOAN#'))
    .map((item) => stripKeys<Loan>(item));
  return { reader: stripKeys<Reader>(readerItem), loans };
}

export async function listReaders(): Promise<Reader[]> {
  const items = await queryAll({
    IndexName: GSI1,
    KeyConditionExpression: 'gsi1pk = :pk',
    ExpressionAttributeValues: { ':pk': READERS_INDEX_PK },
  });
  return items.map((item) => stripKeys<Reader>(item));
}

export async function nextMemberNumber(): Promise<string> {
  // The "L" keeps generated card numbers visually and technically apart from book barcodes.
  return `L${String(await nextCounterValue('MEMBER')).padStart(6, '0')}`;
}

/** Stores a new reader and claims the card number, which must not be used by any copy or reader. */
export async function putNewReader(reader: Reader, audit: Item): Promise<void> {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: env.tableName,
              Item: { ...readerKey(reader.id), ...readerIndexKeys(reader), ...reader },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Put: {
              TableName: env.tableName,
              Item: { ...codeKey(reader.memberNumber), kind: 'reader', readerId: reader.id },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
  } catch (error) {
    if (failedConditionAt(error, 1)) {
      throw new ConflictError('CODE_IN_USE', 'This number is already used by a reader or copy');
    }
    throw error;
  }
}

/**
 * Updates the fields a librarian edits. An update (not a put) so the loan counter, which the
 * lending desk changes concurrently, is never overwritten.
 */
export async function updateReaderDetails(
  reader: Reader,
  expectedVersion: number,
  audit: Item,
): Promise<void> {
  const set: Record<string, unknown> = {
    firstName: reader.firstName,
    lastName: reader.lastName,
    category: reader.category,
    active: reader.active,
    updatedAt: reader.updatedAt,
    version: reader.version,
    gsi1sk: readerIndexKeys(reader).gsi1sk,
  };
  const remove: string[] = [];
  for (const field of ['group', 'email'] as const) {
    if (reader[field] === undefined) remove.push(field);
    else set[field] = reader[field];
  }

  const names = Object.fromEntries(
    [...Object.keys(set), ...remove].map((field) => [`#${field}`, field]),
  );
  const values = Object.fromEntries(Object.entries(set).map(([field, v]) => [`:${field}`, v]));
  const expression =
    `SET ${Object.keys(set)
      .map((f) => `#${f} = :${f}`)
      .join(', ')}` + (remove.length ? ` REMOVE ${remove.map((f) => `#${f}`).join(', ')}` : '');

  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: readerKey(reader.id),
              UpdateExpression: expression,
              ConditionExpression: 'attribute_exists(pk) AND #version = :expected',
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: { ...values, ':expected': expectedVersion },
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
  } catch (error) {
    if (failedConditionAt(error, 0)) {
      throw new ConflictError('VERSION_CONFLICT', 'This reader was changed by someone else');
    }
    throw error;
  }
}
