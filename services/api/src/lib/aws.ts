import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { tracer } from './observability';

// Created once per Lambda container and reused across invocations.
// DYNAMODB_ENDPOINT is only set in local development (DynamoDB Local); on AWS it is undefined.
export const db = DynamoDBDocumentClient.from(
  tracer.captureAWSv3Client(new DynamoDBClient({ endpoint: process.env.DYNAMODB_ENDPOINT })),
  { marshallOptions: { removeUndefinedValues: true } },
);
export const s3 = tracer.captureAWSv3Client(new S3Client({}));

export const env = {
  get tableName() {
    return required('TABLE_NAME');
  },
  get webBucket() {
    return required('WEB_BUCKET');
  },
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
