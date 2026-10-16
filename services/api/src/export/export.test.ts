import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportPage } from './service';

const ddb = mockClient(DynamoDBDocumentClient);
const admin = { userId: 'a', roles: ['admin' as const] };

beforeEach(() => {
  ddb.reset();
  ddb.on(PutCommand).resolves({});
});

describe('exportPage', () => {
  it("returns the school's records and leaves internal items out", async () => {
    ddb.on(ScanCommand).resolves({
      Items: [
        { pk: 'TITLE#T1', sk: 'TITLE', id: 'T1', title: 'Dolfje' },
        { pk: 'TITLE#T1', sk: 'COPY#C1', id: 'C1', barcode: '00000001' },
        {
          pk: 'READER#R1',
          sk: 'READER',
          id: 'R1',
          firstName: 'Lotte',
          gsi1pk: 'READERS',
          gsi1sk: 'x',
        },
        { pk: 'READER#R1', sk: 'LOAN#L1', id: 'L1' },
        { pk: 'SETTINGS', sk: 'LIBRARY', version: 2 },
        { pk: 'CODE#00000001', sk: 'CODE', kind: 'copy' },
        { pk: 'COUNTER', sk: 'BARCODE', value: 1 },
        { pk: 'AUDIT#TITLE#T1', sk: '2026', action: 'title.created' },
        { pk: 'STATS#2026-10', sk: 'TOTAL', loans: 3 },
      ],
      LastEvaluatedKey: { pk: 'STATS#2026-10', sk: 'TOTAL' },
    });

    const page = await exportPage(admin);

    expect(page.records.map((r) => r.kind)).toEqual([
      'title',
      'copy',
      'reader',
      'loan',
      'settings',
    ]);
    expect(page.records[2]?.data).toEqual({ id: 'R1', firstName: 'Lotte' }); // no storage keys
    expect(ddb.commandCalls(PutCommand)[0]?.args[0].input.Item).toMatchObject({
      action: 'data.exported',
    });

    // The cursor brings back exactly where the scan stopped, and isn't logged again.
    ddb.resetHistory();
    await exportPage(admin, page.next);
    expect(ddb.commandCalls(ScanCommand)[0]?.args[0].input.ExclusiveStartKey).toEqual({
      pk: 'STATS#2026-10',
      sk: 'TOTAL',
    });
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('refuses a cursor that was tampered with', async () => {
    const forged = Buffer.from(JSON.stringify({ pk: 'X', sk: 'Y', extra: 1 })).toString(
      'base64url',
    );
    await expect(exportPage(admin, forged)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(exportPage(admin, 'not-base64-json')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
