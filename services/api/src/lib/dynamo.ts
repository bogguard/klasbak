import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  type QueryCommandInput,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { db, env } from './aws';
import { codeKey, type CodePointer } from './keys';

export type Item = Record<string, unknown>;

/** Removes storage keys so items can be returned as domain objects. */
export function stripKeys<T>(item: Item): T {
  const { pk: _pk, sk: _sk, gsi1pk: _gsi1pk, gsi1sk: _gsi1sk, ...rest } = item;
  return rest as T;
}

/** Runs a query to the end, following pagination. */
export async function queryAll(input: Omit<QueryCommandInput, 'TableName'>): Promise<Item[]> {
  const items: Item[] = [];
  let startKey: Item | undefined;
  do {
    const page: QueryCommandOutput = await db.send(
      new QueryCommand({ ...input, TableName: env.tableName, ExclusiveStartKey: startKey }),
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export async function getItem<T>(key: { pk: string; sk: string }): Promise<T | undefined> {
  const result = await db.send(new GetCommand({ TableName: env.tableName, Key: key }));
  return result.Item ? stripKeys<T>(result.Item) : undefined;
}

/** Atomically reserves the next number of a counter (e.g. for generated barcodes). */
export async function nextCounterValue(name: string): Promise<number> {
  const result = await db.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: { pk: 'COUNTER', sk: name },
      UpdateExpression: 'ADD #value :one',
      ExpressionAttributeNames: { '#value': 'value' },
      ExpressionAttributeValues: { ':one': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return Number(result.Attributes?.value);
}

/** What a scanned code refers to. Pointers written before readers existed have no kind. */
export async function getCodePointer(code: string): Promise<CodePointer | undefined> {
  const pointer = await getItem<Partial<CodePointer> & Item>(codeKey(code));
  if (!pointer) return undefined;
  return (pointer.kind ?? 'copy') === 'copy'
    ? { kind: 'copy', titleId: String(pointer.titleId), copyId: String(pointer.copyId) }
    : { kind: 'reader', readerId: String(pointer.readerId) };
}

/** True when the transaction was cancelled because the condition of item `index` failed. */
export function failedConditionAt(error: unknown, index: number): boolean {
  return (
    error instanceof TransactionCanceledException &&
    error.CancellationReasons?.[index]?.Code === 'ConditionalCheckFailed'
  );
}

export function isTransactionCancelled(error: unknown): boolean {
  return error instanceof TransactionCanceledException;
}
