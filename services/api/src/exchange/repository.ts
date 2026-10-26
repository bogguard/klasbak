import {
  DeleteCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Copy, ExchangeCollection, Loan, ReturnedExchangeBook, Title } from '@klasbak/shared';
import { db, env } from '../lib/aws';
import {
  batchGetItems,
  getItem,
  isTransactionCancelled,
  queryAll,
  stripKeys,
  type Item,
} from '../lib/dynamo';
import {
  codeKey,
  copyKey,
  exchangeCopiesIndexPk,
  exchangeKey,
  GSI1,
  loanKey,
  titleKey,
} from '../lib/keys';

/** The stored collection, with its loan counter (added to by the lending desk). */
export type StoredExchange = ExchangeCollection & { loans?: number };

export async function putNewExchange(exchange: ExchangeCollection, audit: Item): Promise<void> {
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: env.tableName,
            Item: { ...exchangeKey(exchange.id), ...exchange },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        { Put: { TableName: env.tableName, Item: audit } },
      ],
    }),
  );
}

export async function listExchanges(): Promise<StoredExchange[]> {
  const items = await queryAll({
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': exchangeKey('').pk },
  });
  return items.map((item) => stripKeys<StoredExchange>(item));
}

export function getExchange(exchangeId: string): Promise<StoredExchange | undefined> {
  return getItem<StoredExchange>(exchangeKey(exchangeId));
}

export async function copiesOf(exchangeId: string): Promise<Copy[]> {
  const items = await queryAll({
    IndexName: GSI1,
    KeyConditionExpression: 'gsi1pk = :pk',
    ExpressionAttributeValues: { ':pk': exchangeCopiesIndexPk(exchangeId) },
  });
  return items.map((item) => stripKeys<Copy>(item));
}

export function titlesById(titleIds: string[]): Promise<Map<string, Title>> {
  return batchGetItems<Title>([...new Set(titleIds)].map(titleKey));
}

export function loansById(keys: Array<{ readerId: string; loanId: string }>) {
  return batchGetItems<Loan>(keys.map((k) => loanKey(k.readerId, k.loanId)));
}

/**
 * Takes one book of a returned collection out of the catalogue: the copy and its barcode,
 * so the library can lend the same book again later. Refused while it is on loan.
 * Returns false when it was already gone or is lent out (checked by the database).
 */
export async function removeCopy(copy: Copy, audit: Item): Promise<boolean> {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: env.tableName,
              Key: copyKey(copy.titleId, copy.id),
              ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(currentLoan)',
            },
          },
          { Delete: { TableName: env.tableName, Key: codeKey(copy.barcode) } },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
    return true;
  } catch (error) {
    if (isTransactionCancelled(error)) return false;
    throw error;
  }
}

/** True when the title has no copies left (then a title made for the collection can go). */
export async function hasNoCopies(titleId: string): Promise<boolean> {
  const items = await queryAll({
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :copy)',
    ExpressionAttributeValues: { ':pk': titleKey(titleId).pk, ':copy': 'COPY#' },
  });
  return items.length === 0;
}

export async function deleteTitle(titleId: string, audit: Item): Promise<void> {
  await db.send(new DeleteCommand({ TableName: env.tableName, Key: titleKey(titleId) }));
  await db.send(new PutCommand({ TableName: env.tableName, Item: audit }));
}

/** Marks the collection as returned; an update, so the loan counter is kept. */
export async function markReturned(
  exchangeId: string,
  returnedOn: string,
  books: ReturnedExchangeBook[],
  now: string,
): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: exchangeKey(exchangeId),
      UpdateExpression:
        'SET #status = :returned, returnedOn = :on, bookCount = :count, returnedBooks = :books, updatedAt = :now',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':returned': 'returned',
        ':on': returnedOn,
        ':count': books.length,
        ':books': books,
        ':now': now,
      },
    }),
  );
}
