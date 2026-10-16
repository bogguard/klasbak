import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { removeOldLoanHistory } from './handler';

const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand).resolves({}); // default settings: 365 days
  ddb.on(TransactWriteCommand).resolves({});
});

describe('removeOldLoanHistory', () => {
  it('deletes returned loans older than the retention period and counts them anonymously', async () => {
    ddb.on(ScanCommand).resolves({
      Items: [
        {
          pk: 'READER#R1',
          sk: 'LOAN#L1',
          titleId: 'T1',
          loanedAt: '2025-03-02T10:00:00Z',
          returnedAt: '2025-03-20T10:00:00Z',
        },
      ],
    });

    const removed = await removeOldLoanHistory(new Date('2026-10-16T03:00:00Z'));

    expect(removed).toBe(1);
    const scan = ddb.commandCalls(ScanCommand)[0]?.args[0].input;
    expect(scan?.ExpressionAttributeValues?.[':cutoff']).toBe('2025-10-16T03:00:00.000Z');
    const items = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.[0]?.Delete?.Key).toEqual({ pk: 'READER#R1', sk: 'LOAN#L1' });
    // The statistics keep the month and the title, never the reader.
    expect(items?.slice(1).map((i) => i.Update?.Key)).toEqual([
      { pk: 'STATS#2025-03', sk: 'TOTAL' },
      { pk: 'STATS#2025-03', sk: 'TITLE#T1' },
    ]);
  });

  it('uses the retention period from the settings', async () => {
    ddb.on(GetCommand).resolves({ Item: { historyRetentionDays: 30 } });
    ddb.on(ScanCommand).resolves({ Items: [] });
    await removeOldLoanHistory(new Date('2026-10-16T03:00:00Z'));
    const scan = ddb.commandCalls(ScanCommand)[0]?.args[0].input;
    expect(scan?.ExpressionAttributeValues?.[':cutoff']).toBe('2026-09-16T03:00:00.000Z');
  });
});
