import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteReader } from './service';

const ddb = mockClient(DynamoDBDocumentClient);
const admin = { userId: 'a1', roles: ['admin' as const] };
const reader = {
  pk: 'READER#R1',
  sk: 'READER',
  id: 'R1',
  memberNumber: 'L000001',
  firstName: 'Lotte',
  lastName: 'Peeters',
  activeLoanCount: 0,
  version: 1,
};
const returnedLoan = {
  pk: 'READER#R1',
  sk: 'LOAN#L1',
  id: 'L1',
  returnedAt: '2026-10-01T10:00:00Z',
};

beforeEach(() => {
  ddb.reset();
  ddb.on(TransactWriteCommand).resolves({});
  ddb.on(BatchWriteCommand).resolves({});
});

describe('deleting a reader', () => {
  it('removes the reader, the card number and the reading history', async () => {
    ddb.on(QueryCommand).resolves({ Items: [reader, returnedLoan] });

    await deleteReader(admin, 'R1');

    const items = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.map((i) => i.Delete?.Key ?? i.Put?.Item?.action)).toEqual([
      { pk: 'READER#R1', sk: 'READER' },
      { pk: 'CODE#L000001', sk: 'CODE' },
      'reader.deleted',
    ]);
    const deletes =
      ddb.commandCalls(BatchWriteCommand)[0]?.args[0].input.RequestItems?.['test-table'];
    expect(deletes).toEqual([{ DeleteRequest: { Key: { pk: 'READER#R1', sk: 'LOAN#L1' } } }]);
  });

  it('refuses while books are still on loan', async () => {
    ddb.on(QueryCommand).resolves({ Items: [reader, { ...returnedLoan, returnedAt: undefined }] });
    await expect(deleteReader(admin, 'R1')).rejects.toMatchObject({ code: 'READER_HAS_LOANS' });
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('refuses when a book was lent at the very moment of deleting', async () => {
    ddb.on(QueryCommand).resolves({ Items: [reader] });
    ddb.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({
        message: 'cancelled',
        $metadata: {},
        CancellationReasons: [
          { Code: 'ConditionalCheckFailed' },
          { Code: 'None' },
          { Code: 'None' },
        ],
      }),
    );
    await expect(deleteReader(admin, 'R1')).rejects.toMatchObject({ code: 'READER_HAS_LOANS' });
  });
});
