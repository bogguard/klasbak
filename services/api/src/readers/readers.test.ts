import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { deactivateReaders, deleteReader, importReaders } from './service';

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

describe('importing a class list', () => {
  const teacher = {
    ...reader,
    pk: 'READER#R2',
    id: 'R2',
    memberNumber: 'L000002',
    firstName: 'An',
    lastName: 'Wouters',
    category: 'teacher',
    email: 'an@school.be',
    group: '3B',
    active: true,
  };

  beforeEach(() => {
    // listReaders (index query) and getReader inside updateReader.
    ddb.on(QueryCommand).resolves({ Items: [teacher] });
    ddb.on(GetCommand).resolves({ Item: teacher });
  });

  it('updates a reader entered by hand, recognised by name, and links the school number', async () => {
    const [result] = await importReaders(admin, [
      { firstName: 'an', lastName: 'Wouters', group: '4A', schoolNumber: '12345' },
    ]);

    expect(result).toMatchObject({ status: 'updated', memberNumber: 'L000002' });
    const update = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[0];
    const values = update?.Update?.ExpressionAttributeValues;
    expect(values).toMatchObject({ ':group': '4A', ':schoolNumber': '12345' });
    // Not in the file, so kept: still a teacher, email untouched.
    expect(values).toMatchObject({ ':category': 'teacher', ':email': 'an@school.be' });
  });

  it('creates readers it does not know', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { value: 7 } }); // next card number
    const [result] = await importReaders(admin, [
      { firstName: 'Noor', lastName: 'Claes', schoolNumber: '999' },
    ]);
    expect(result).toMatchObject({ status: 'created', memberNumber: 'L000007' });
  });

  it('sets pupils who left inactive, and skips readers already inactive', async () => {
    ddb
      .on(GetCommand)
      .resolvesOnce({ Item: teacher })
      .resolves({ Item: { ...teacher, active: false } });
    const result = await deactivateReaders(admin, ['R2']);
    expect(result).toEqual({ deactivated: 1 });
    const update = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[0];
    expect(update?.Update?.ExpressionAttributeValues).toMatchObject({ ':active': false });
  });
});
