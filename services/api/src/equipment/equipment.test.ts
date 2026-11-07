import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Asset } from '@klasbak/shared';
import { mockClient } from 'aws-sdk-client-mock';
import type { LambdaEvent } from 'hono/aws-lambda';
import { beforeEach, describe, expect, it } from 'vitest';
import { scan } from '../circulation/service';
import { app } from './handler';
import {
  assertEquipmentEnabled,
  assignAsset,
  createAssets,
  listRecipients,
  returnAsset,
  updateAsset,
} from './service';

const ddb = mockClient(DynamoDBDocumentClient);
const actor = { userId: 'u1', roles: ['equipment' as const] };
const now = new Date('2026-11-05T09:00:00Z');
const details = { kind: 'Chromebook', name: 'Acer 314' };

const asset: Asset = {
  id: 'A1',
  ...details,
  barcode: 'M123456000001',
  serialNumber: 'NXK1',
  status: 'available',
  createdAt: '2026-09-01T08:00:00Z',
  updatedAt: '2026-09-01T08:00:00Z',
  version: 3,
};
const holder = {
  assignmentId: 'S1',
  readerId: 'R1',
  readerName: 'Lotte Peeters',
  since: '2026-10-01T08:00:00Z',
};
const reader = { id: 'R1', firstName: 'Lotte', lastName: 'Peeters', group: '3B', active: true };

function stored(items: { asset?: Asset; reader?: object; pointers?: string[] }) {
  ddb.on(GetCommand).callsFake(({ Key }: { Key: { pk: string } }) => {
    if (Key.pk.startsWith('ASSET#')) return { Item: items.asset };
    if (Key.pk.startsWith('READER#')) return { Item: items.reader };
    if (Key.pk.startsWith('CODE#') && items.pointers?.includes(Key.pk.slice(5))) {
      return { Item: { kind: 'asset', assetId: 'A1' } };
    }
    return {};
  });
}

const cancelledAt = (index: number) =>
  new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: [0, 1, 2, 3].map((i) => ({
      Code: i === index ? 'ConditionalCheckFailed' : 'None',
    })),
  });

beforeEach(() => {
  ddb.reset();
  ddb.on(TransactWriteCommand).resolves({});
  ddb.on(UpdateCommand).resolves({ Attributes: { value: 7 } });
  stored({});
});

describe('adding stock', () => {
  it('makes one item per serial number, each with its own label and both codes', async () => {
    const results = await createAssets(actor, { details, serialNumbers: ['NXK1', 'NXK2'] }, now);

    expect(results.map((r) => r.status)).toEqual(['created', 'created']);
    const items = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.map((i) => i.Put?.Item?.pk).slice(1, 3)).toEqual([
      'CODE#M012345000007',
      'CODE#NXK1',
    ]);
    expect(items?.[0]?.Put?.Item).toMatchObject({
      status: 'available',
      barcode: 'M012345000007',
      gsi1pk: 'ASSETS',
    });
  });

  it('makes items without a serial number from a quantity', async () => {
    const results = await createAssets(actor, { details, serialNumbers: [], quantity: 3 }, now);
    expect(results).toHaveLength(3);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(3);
  });

  it('skips a serial number it already knows, so a list can be pasted twice', async () => {
    stored({ pointers: ['NXK1'] });
    const results = await createAssets(actor, { details, serialNumbers: ['NXK1', 'NXK2'] }, now);
    expect(results[0]).toEqual({ status: 'duplicate', serialNumber: 'NXK1' });
    expect(results[1]?.status).toBe('created');
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it('treats losing the race for a serial number as a duplicate', async () => {
    ddb.on(TransactWriteCommand).rejects(cancelledAt(2));
    const results = await createAssets(actor, { details, serialNumbers: ['NXK1'] }, now);
    expect(results).toEqual([{ status: 'duplicate', serialNumber: 'NXK1' }]);
  });
});

describe('editing an item', () => {
  it('clears a field left empty', async () => {
    stored({ asset: { ...asset, location: 'Kar A' } });
    const updated = await updateAsset(actor, 'A1', { ...details, serialNumber: 'NXK1' }, 3, now);
    expect(updated.location).toBeUndefined();
    const audit = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.at(-1);
    expect(audit?.Put?.Item?.changedFields).toEqual(['location']);
  });

  it('moves the code when the serial number changes', async () => {
    stored({ asset });
    await updateAsset(actor, 'A1', { ...details, serialNumber: 'NEW1' }, 3, now);
    const items = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.[1]?.Put?.Item).toMatchObject({ pk: 'CODE#NEW1', assetId: 'A1' });
    expect(items?.[2]?.Delete?.Key).toEqual({ pk: 'CODE#NXK1', sk: 'CODE' });
  });

  it('refuses a serial number that is already in use', async () => {
    stored({ asset });
    ddb.on(TransactWriteCommand).rejects(cancelledAt(1));
    await expect(
      updateAsset(actor, 'A1', { ...details, serialNumber: 'NEW1' }, 3, now),
    ).rejects.toMatchObject({ code: 'SERIAL_IN_USE' });
  });

  it('does not change the status of an item someone has', async () => {
    stored({ asset: { ...asset, status: 'assigned', holder } });
    await expect(
      updateAsset(actor, 'A1', { ...details, status: 'repair' }, 3, now),
    ).rejects.toMatchObject({ code: 'ASSET_ASSIGNED' });
  });

  it('keeps who has it when details change', async () => {
    stored({ asset: { ...asset, status: 'assigned', holder } });
    const updated = await updateAsset(
      actor,
      'A1',
      { ...details, serialNumber: 'NXK1', location: 'Kar B' },
      3,
      now,
    );
    expect(updated).toMatchObject({ status: 'assigned', holder, location: 'Kar B', version: 4 });
  });
});

describe('handing out', () => {
  it('lets the database guarantee one holder and an active reader', async () => {
    stored({ asset, reader });

    const updated = await assignAsset(actor, 'A1', 'R1', '2026-11-06', now);

    expect(updated).toMatchObject({ status: 'assigned', version: 4 });
    expect(updated.holder).toMatchObject({ readerName: 'Lotte Peeters', dueDate: '2026-11-06' });
    const items = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.[0]?.Update?.ConditionExpression).toBe('#status = :available');
    expect(items?.[1]?.Update?.ConditionExpression).toBe('active = :true');
    expect(items?.[1]?.Update?.UpdateExpression).toBe('ADD activeAssetCount :one');
    expect(items?.[2]?.Put?.Item).toMatchObject({
      pk: 'READER#R1',
      gsi1pk: 'ASSET#A1',
      assetName: 'Chromebook Acer 314',
    });
  });

  it('changes nothing on a double click', async () => {
    stored({ asset: { ...asset, status: 'assigned', holder }, reader });
    const again = await assignAsset(actor, 'A1', 'R1', undefined, now);
    expect(again.holder).toEqual(holder);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it.each(['assigned', 'repair', 'lost', 'withdrawn'] as const)(
    'refuses an item that is %s',
    async (status) => {
      stored({
        asset: { ...asset, status, holder: status === 'assigned' ? holder : undefined },
        reader: { ...reader, id: 'R2' },
      });
      await expect(assignAsset(actor, 'A1', 'R2', undefined, now)).rejects.toMatchObject({
        code: 'ASSET_NOT_AVAILABLE',
      });
    },
  );

  it('refuses when someone else was just faster', async () => {
    stored({ asset, reader });
    ddb.on(TransactWriteCommand).rejects(cancelledAt(0));
    await expect(assignAsset(actor, 'A1', 'R1', undefined, now)).rejects.toMatchObject({
      code: 'ASSET_NOT_AVAILABLE',
    });
  });

  it('refuses a reader who is no longer active', async () => {
    stored({ asset, reader });
    ddb.on(TransactWriteCommand).rejects(cancelledAt(1));
    await expect(assignAsset(actor, 'A1', 'R1', undefined, now)).rejects.toMatchObject({
      code: 'READER_INACTIVE',
    });
  });

  it('offers active readers only, without their email or school number', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        { ...reader, email: 'x@example.org', schoolNumber: '123', memberNumber: 'L1' },
        { ...reader, id: 'R2', active: false },
      ],
    });
    const recipients = await listRecipients();
    expect(recipients.map((r) => r.id)).toEqual(['R1']);
    expect(recipients[0]).not.toHaveProperty('email');
    expect(recipients[0]).not.toHaveProperty('schoolNumber');
  });
});

describe('taking back', () => {
  it('closes the assignment and frees the reader', async () => {
    stored({ asset: { ...asset, status: 'assigned', holder } });

    const back = await returnAsset(actor, 'A1', 'repair', now);

    expect(back).toMatchObject({ status: 'repair', version: 4 });
    expect(back.holder).toBeUndefined();
    const items = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.[1]?.Update?.ExpressionAttributeValues?.[':minusOne']).toBe(-1);
    expect(items?.[2]?.Update?.Key).toEqual({ pk: 'READER#R1', sk: 'ASSIGNMENT#S1' });
  });

  it('changes nothing when it is already back', async () => {
    stored({ asset });
    expect(await returnAsset(actor, 'A1', 'available', now)).toEqual(asset);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});

describe('the module switch', () => {
  it('refuses requests until an administrator switches it on', async () => {
    await expect(assertEquipmentEnabled()).rejects.toMatchObject({ code: 'MODULE_OFF' });
    ddb.on(GetCommand).resolves({ Item: { modules: { equipment: true } } });
    await expect(assertEquipmentEnabled()).resolves.toBeUndefined();
  });

  it('tells someone without rights nothing about it', async () => {
    const event = {
      requestContext: {
        requestId: 'r',
        authorizer: { jwt: { claims: { sub: 'u', 'cognito:groups': '[teacher]' } } },
      },
    } as unknown as LambdaEvent;
    const response = await app.request('/api/equipment/assets', {}, { event });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('the lending desk', () => {
  it('explains that a scanned code is equipment, instead of treating it as a book', async () => {
    ddb.on(GetCommand).resolves({ Item: { kind: 'asset', assetId: 'A1' } });
    await expect(scan(actor, 'M000000000007', undefined, now)).rejects.toMatchObject({
      code: 'CODE_IS_EQUIPMENT',
    });
  });
});
