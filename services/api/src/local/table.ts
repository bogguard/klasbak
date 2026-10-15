import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  UpdateTableCommand,
  type GlobalSecondaryIndex,
} from '@aws-sdk/client-dynamodb';
import { DeleteCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { db, env } from '../lib/aws';
import { GSI1 } from '../lib/keys';

const client = new DynamoDBClient({ endpoint: process.env.DYNAMODB_ENDPOINT });

// Same keys and index as infra/template.yaml.
const gsi1: GlobalSecondaryIndex = {
  IndexName: GSI1,
  KeySchema: [
    { AttributeName: 'gsi1pk', KeyType: 'HASH' },
    { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
  ],
  Projection: { ProjectionType: 'ALL' },
};

const attributes = ['pk', 'sk', 'gsi1pk', 'gsi1sk'].map((name) => ({
  AttributeName: name,
  AttributeType: 'S' as const,
}));

/** Creates the local table, or adds indexes that newer code needs to an existing one. */
export async function ensureLocalTable(): Promise<void> {
  try {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: env.tableName }));
    const hasGsi1 = Table?.GlobalSecondaryIndexes?.some((index) => index.IndexName === GSI1);
    if (!hasGsi1) {
      await client.send(
        new UpdateTableCommand({
          TableName: env.tableName,
          AttributeDefinitions: attributes,
          GlobalSecondaryIndexUpdates: [{ Create: gsi1 }],
        }),
      );
    }
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
    await client.send(
      new CreateTableCommand({
        TableName: env.tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: attributes,
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [gsi1],
      }),
    );
  }
}

/**
 * Local data created before code pointers moved from BARCODE#<code> to CODE#<code> (with a
 * kind) is converted once, so nobody loses their local test data. Nothing was deployed with
 * the old format, so this only exists here.
 */
export async function migrateLocalData(): Promise<number> {
  const old = await db.send(
    new ScanCommand({
      TableName: env.tableName,
      FilterExpression: 'begins_with(pk, :old)',
      ExpressionAttributeValues: { ':old': 'BARCODE#' },
    }),
  );
  for (const item of old.Items ?? []) {
    const code = String(item.pk).slice('BARCODE#'.length);
    await db.send(
      new PutCommand({
        TableName: env.tableName,
        Item: {
          pk: `CODE#${code}`,
          sk: 'CODE',
          kind: 'copy',
          titleId: item.titleId,
          copyId: item.copyId,
        },
      }),
    );
    await db.send(
      new DeleteCommand({ TableName: env.tableName, Key: { pk: item.pk, sk: item.sk } }),
    );
  }
  return old.Items?.length ?? 0;
}
