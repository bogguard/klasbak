import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { INSTITUTION_NUMBER_PATTERN } from '@klasbak/shared';
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
  /** The school's instellingsnummer, the start of every code we generate (decision 038). */
  get institutionNumber() {
    const value = required('INSTITUTION_NUMBER');
    if (!INSTITUTION_NUMBER_PATTERN.test(value))
      throw new Error('INSTITUTION_NUMBER must be six digits');
    return value;
  },
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
