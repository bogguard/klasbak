import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { env } from '../lib/aws';

const client = new DynamoDBClient({ endpoint: process.env.DYNAMODB_ENDPOINT });

/** Creates the local table with the same keys as infra/template.yaml, if it doesn't exist yet. */
export async function ensureLocalTable(): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: env.tableName }));
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
    await client.send(
      new CreateTableCommand({
        TableName: env.tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
      }),
    );
  }
}
