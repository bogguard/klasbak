import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { isAccessCode, type Photo, type PhotoDay } from '@klasbak/shared';
import { mockClient } from 'aws-sdk-client-mock';
import type { LambdaEvent } from 'hono/aws-lambda';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from './handler';
import {
  accessPhotos,
  deleteReaderPhotos,
  ensureCodes,
  newAccessCode,
  registerPhoto,
  removeExpiredPhotoDays,
  updateDay,
} from './service';

const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const admin = { userId: 'a1', roles: ['admin' as const] };
const now = new Date('2026-11-02T09:00:00Z');

const DAY = '01JD0000000000000000000000';
const PHOTO = '01JP0000000000000000000000';
const day: PhotoDay = {
  id: DAY,
  name: 'Schoolfoto’s',
  takenOn: '2026-10-15',
  open: true,
  availableUntil: '2026-12-01',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
};
const emma = { id: 'R1', firstName: 'Emma', lastName: 'Peeters', group: '3B', active: true };
const photo = (id: string, extra: Partial<Photo> = {}): Photo => ({
  id,
  photoDayId: DAY,
  kind: 'portrait',
  readerId: 'R1',
  width: 3000,
  height: 4000,
  size: 5_000_000,
  takenAt: `2026-10-15T08:0${id.slice(-1)}:00.000Z`,
  uploadedAt: '2026-10-16T08:00:00Z',
  ...extra,
});

type Item = Record<string, unknown>;

/** A small table: items by key, queries by partition or index key. */
function table(items: Item[]) {
  ddb.on(GetCommand).callsFake(({ Key }: { Key: { pk: string; sk: string } }) => ({
    Item: items.find((i) => i.pk === Key.pk && i.sk === Key.sk),
  }));
  ddb
    .on(QueryCommand)
    .callsFake(
      (input: { IndexName?: string; ExpressionAttributeValues: Record<string, string> }) => {
        const field = input.IndexName ? 'gsi1pk' : 'pk';
        return { Items: items.filter((i) => i[field] === input.ExpressionAttributeValues[':pk']) };
      },
    );
}

const settings = (photos = true) => ({
  pk: 'SETTINGS',
  sk: 'LIBRARY',
  modules: { equipment: false, photos },
});
const dayItem = (d: PhotoDay = day) => ({
  pk: `PHOTODAY#${d.id}`,
  sk: 'PHOTODAY',
  gsi1pk: 'PHOTODAYS',
  ...d,
});
const readerItem = (r: Item) => ({ pk: `READER#${String(r.id)}`, sk: 'READER', ...r });

const jpegStart = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
function s3Files(bytes: Uint8Array | undefined, size = 4_812_000) {
  s3.on(GetObjectCommand).callsFake(() => {
    if (!bytes) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    return {
      Body: { transformToByteArray: () => Promise.resolve(bytes) },
      ContentRange: `bytes 0-11/${size}`,
    };
  });
}

beforeEach(() => {
  ddb.reset();
  s3.reset();
  ddb.on(TransactWriteCommand).resolves({});
  ddb.on(BatchWriteCommand).resolves({});
  s3.on(DeleteObjectsCommand).resolves({});
});

describe('recording an uploaded photo', () => {
  const request = {
    photoId: PHOTO,
    target: { readerId: 'R1' },
    takenAt: '2026-10-15T08:01:00.000Z',
    fileName: 'IMG_0001.JPG',
    width: 3000,
    height: 4000,
  };

  it('checks the files and lists the photo under the pupil', async () => {
    table([dayItem(), readerItem(emma)]);
    s3Files(jpegStart);
    ddb.on(PutCommand).resolves({});

    const stored = await registerPhoto(DAY, request, now);

    expect(stored).toMatchObject({ kind: 'portrait', readerId: 'R1', size: 4_812_000 });
    const item = ddb.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(item).toMatchObject({
      pk: `PHOTODAY#${DAY}`,
      sk: `PHOTO#${PHOTO}`,
      gsi1pk: `PHOTOS#${DAY}#R#R1`,
    });
    const keys = s3.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key);
    expect(keys).toEqual([`${DAY}/${PHOTO}.jpg`, `${DAY}/${PHOTO}.small.jpg`]);
  });

  it('lists a class photo under the class', async () => {
    table([dayItem()]);
    s3Files(jpegStart);
    ddb.on(PutCommand).resolves({});
    await registerPhoto(DAY, { ...request, target: { group: '3B' } }, now);
    expect(ddb.commandCalls(PutCommand)[0]?.args[0].input.Item).toMatchObject({
      kind: 'class',
      group: '3B',
      gsi1pk: `PHOTOS#${DAY}#G#3B`,
    });
  });

  it('is safe to repeat', async () => {
    table([
      dayItem(),
      readerItem(emma),
      { pk: `PHOTODAY#${DAY}`, sk: `PHOTO#${PHOTO}`, ...photo(PHOTO) },
    ]);
    s3Files(jpegStart);
    ddb
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: 'exists', $metadata: {} }));
    await expect(registerPhoto(DAY, request, now)).resolves.toMatchObject({ id: PHOTO });
  });

  it('refuses photos of a pupil who may not be photographed', async () => {
    table([
      dayItem(),
      readerItem(emma),
      { pk: `PHOTODAY#${DAY}`, sk: 'PUPIL#R1', readerId: 'R1', noPhoto: true },
    ]);
    await expect(registerPhoto(DAY, request, now)).rejects.toMatchObject({
      code: 'NO_PHOTO_CONSENT',
    });
    expect(s3.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it('refuses a photo whose files did not arrive', async () => {
    table([dayItem(), readerItem(emma)]);
    s3Files(undefined);
    await expect(registerPhoto(DAY, request, now)).rejects.toMatchObject({
      code: 'PHOTO_NOT_UPLOADED',
    });
  });

  it('refuses and removes files that are not JPEG', async () => {
    table([dayItem(), readerItem(emma)]);
    s3Files(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]));
    await expect(registerPhoto(DAY, request, now)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(1);
  });

  it('refuses a deleted photo day', async () => {
    table([dayItem({ ...day, deletedAt: '2026-11-01T10:00:00Z' })]);
    await expect(registerPhoto(DAY, request, now)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('opening a photo day to parents', () => {
  const request = { name: day.name, takenOn: day.takenOn, open: true };

  it('accepts a date from today to the end of the school year', async () => {
    table([dayItem({ ...day, open: false, availableUntil: undefined })]);
    const updated = await updateDay(admin, DAY, { ...request, availableUntil: '2027-08-31' }, now);
    expect(updated).toMatchObject({ open: true, availableUntil: '2027-08-31' });
  });

  it('refuses a date after the school year or in the past', async () => {
    table([dayItem({ ...day, open: false, availableUntil: undefined })]);
    for (const availableUntil of ['2027-09-01', '2026-11-01']) {
      await expect(
        updateDay(admin, DAY, { ...request, availableUntil }, now),
      ).rejects.toMatchObject({
        code: 'PHOTO_DATE_OUT_OF_RANGE',
        details: { latest: '2027-08-31' },
      });
    }
  });
});

describe('download codes', () => {
  it('are twelve characters that can’t be confused, and differ every time', () => {
    const codes = Array.from({ length: 200 }, newAccessCode);
    expect(codes.every(isAccessCode)).toBe(true);
    expect(new Set(codes).size).toBe(200);
  });

  it('go to pupils with photos of their own or of their class, keeping existing codes', async () => {
    const readers = [
      emma,
      { id: 'R2', firstName: 'Noah', lastName: 'Aerts', group: '3B', active: true },
      { id: 'R3', firstName: 'Lina', lastName: 'Maes', group: '3B', active: true },
      { id: 'R4', firstName: 'Finn', lastName: 'Claes', group: '4A', active: true },
      { id: 'R5', firstName: 'Mila', lastName: 'Wouters', group: '3B', active: false },
    ];
    table([
      dayItem(),
      { pk: `PHOTODAY#${DAY}`, sk: `PHOTO#${PHOTO}`, ...photo(PHOTO) },
      {
        pk: `PHOTODAY#${DAY}`,
        sk: 'PHOTO#01JP0000000000000000000001',
        ...photo('01JP0000000000000000000001', { kind: 'class', readerId: undefined, group: '3B' }),
      },
      { pk: `PHOTODAY#${DAY}`, sk: 'PUPIL#R2', readerId: 'R2', code: 'EXISTING2345' },
      { pk: `PHOTODAY#${DAY}`, sk: 'PUPIL#R3', readerId: 'R3', noPhoto: true },
      ...readers.map((r) => ({ ...readerItem(r), gsi1pk: 'READERS' })),
    ]);
    ddb.on(PutCommand).resolves({});

    const codes = await ensureCodes(admin, DAY, now);

    expect(codes.map((c) => c.readerId).sort()).toEqual(['R1', 'R2']);
    expect(codes.find((c) => c.readerId === 'R2')?.code).toBe('EXISTING2345');
    const writes = ddb.commandCalls(TransactWriteCommand).map((c) => c.args[0].input.TransactItems);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[0]?.Put?.Item).toMatchObject({ photoDayId: DAY, readerId: 'R1' });
  });
});

describe('parents downloading with a code', () => {
  const code = 'K7PM3QXD9TWA';
  const stored = (d: PhotoDay = day, photosOn = true) =>
    table([
      settings(photosOn),
      { pk: `PHOTOCODE#${code}`, sk: 'PHOTOCODE', photoDayId: DAY, readerId: 'R1' },
      dayItem(d),
      readerItem(emma),
      { gsi1pk: `PHOTOS#${DAY}#R#R1`, ...photo('01JP0000000000000000000002') },
      { gsi1pk: `PHOTOS#${DAY}#R#R1`, ...photo('01JP0000000000000000000001') },
      {
        gsi1pk: `PHOTOS#${DAY}#G#3B`,
        ...photo('01JP0000000000000000000003', { kind: 'class', readerId: undefined, group: '3B' }),
      },
    ]);

  it('gives the first name and links to the portraits, then the class photo', async () => {
    stored();
    const access = await accessPhotos('k7pm-3qxd-9twa', now);
    expect(access).toMatchObject({ firstName: 'Emma', availableUntil: '2026-12-01' });
    expect(access.photos.map((p) => [p.id.slice(-1), p.kind])).toEqual([
      ['1', 'portrait'],
      ['2', 'portrait'],
      ['3', 'class'],
    ]);
    const [first] = access.photos;
    expect(first?.downloadUrl).toContain('test-photos');
    expect(decodeURIComponent(first?.downloadUrl ?? '')).toContain(
      'attachment; filename="Emma-1.jpg"',
    );
    expect(first?.smallUrl).toContain(`${DAY}/01JP0000000000000000000001.small.jpg`);
    // No last name: the first name is enough to see it's the right child.
    expect(JSON.stringify(access)).not.toContain('Peeters');
  });

  it('says nothing about codes that are malformed, unknown or switched off', async () => {
    stored(day, false);
    for (const attempt of ['nonsense', 'K7PM3QXD9TWB', code]) {
      await expect(accessPhotos(attempt, now)).rejects.toMatchObject({
        code: 'PHOTO_CODE_UNKNOWN',
      });
    }
  });

  it('refuses while the photo day is closed or after its last day', async () => {
    stored({ ...day, open: false });
    await expect(accessPhotos(code, now)).rejects.toMatchObject({ code: 'PHOTOS_NOT_AVAILABLE' });
    stored();
    await expect(accessPhotos(code, new Date('2026-12-02T09:00:00Z'))).rejects.toMatchObject({
      code: 'PHOTOS_NOT_AVAILABLE',
    });
  });
});

describe('deleting photos', () => {
  it('erases a reader’s portraits, entry, code and files on every photo day', async () => {
    table([
      dayItem(),
      { pk: `PHOTODAY#${DAY}`, sk: 'PUPIL#R1', readerId: 'R1', code: 'K7PM3QXD9TWA' },
      { gsi1pk: `PHOTOS#${DAY}#R#R1`, ...photo(PHOTO) },
    ]);

    await deleteReaderPhotos('R1');

    const deleted = ddb
      .commandCalls(BatchWriteCommand)
      .flatMap((c) => c.args[0].input.RequestItems?.['test-table'] ?? [])
      .map((r) => r.DeleteRequest?.Key);
    expect(deleted).toEqual([
      { pk: `PHOTODAY#${DAY}`, sk: `PHOTO#${PHOTO}` },
      { pk: `PHOTODAY#${DAY}`, sk: 'PUPIL#R1' },
      { pk: 'PHOTOCODE#K7PM3QXD9TWA', sk: 'PHOTOCODE' },
    ]);
    const files = s3.commandCalls(DeleteObjectsCommand)[0]?.args[0].input.Delete?.Objects;
    expect(files).toEqual([{ Key: `${DAY}/${PHOTO}.jpg` }, { Key: `${DAY}/${PHOTO}.small.jpg` }]);
  });

  it('removes photo days after their last day, files first, and keeps the others', async () => {
    const expired = { ...day, id: '01JD0000000000000000000001', availableUntil: '2026-11-01' };
    table([
      dayItem(day),
      dayItem(expired),
      { pk: `PHOTODAY#${expired.id}`, sk: 'PUPIL#R1', readerId: 'R1', code: 'K7PM3QXD9TWA' },
      { pk: `PHOTODAY#${expired.id}`, sk: `PHOTO#${PHOTO}` },
    ]);
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: `${expired.id}/${PHOTO}.jpg` }] });
    ddb.on(DeleteCommand).resolves({});

    expect(await removeExpiredPhotoDays(now)).toBe(1);

    expect(s3.commandCalls(ListObjectsV2Command)[0]?.args[0].input.Prefix).toBe(`${expired.id}/`);
    expect(ddb.commandCalls(DeleteCommand)[0]?.args[0].input.Key).toEqual({
      pk: `PHOTODAY#${expired.id}`,
      sk: 'PHOTODAY',
    });
    const deleted = ddb
      .commandCalls(BatchWriteCommand)
      .flatMap((c) => c.args[0].input.RequestItems?.['test-table'] ?? [])
      .map((r) => r.DeleteRequest?.Key?.pk);
    expect(deleted).toContain('PHOTOCODE#K7PM3QXD9TWA');
    expect(deleted).not.toContain(`PHOTODAY#${DAY}`);
  });
});

describe('who may do what', () => {
  const as = (role?: string) => ({
    event: {
      requestContext: {
        requestId: 'r',
        authorizer: role
          ? { jwt: { claims: { sub: 'u', username: 'u', 'cognito:groups': `[${role}]` } } }
          : undefined,
      },
    } as unknown as LambdaEvent,
  });
  const json = { 'content-type': 'application/json' };

  it('keeps librarians, the equipment role, teachers and readers out', async () => {
    for (const role of ['librarian', 'equipment', 'teacher', 'reader']) {
      const response = await app.request('/api/photos/days', {}, as(role));
      expect(response.status).toBe(403);
    }
  });

  it('leaves opening, consent and codes to administrators, not the photographer', async () => {
    const attempts = [
      app.request(
        `/api/photos/days/${DAY}`,
        { method: 'PUT', headers: json, body: '{}' },
        as('photographer'),
      ),
      app.request(`/api/photos/days/${DAY}/codes`, { method: 'POST' }, as('photographer')),
      app.request(
        `/api/photos/days/${DAY}/pupils/${PHOTO}`,
        { method: 'PUT', headers: json, body: '{}' },
        as('photographer'),
      ),
      app.request(
        '/api/photos/days',
        { method: 'POST', headers: json, body: '{}' },
        as('photographer'),
      ),
    ];
    for (const response of await Promise.all(attempts)) expect(response.status).toBe(403);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('lets parents in without signing in', async () => {
    const response = await app.request(
      '/api/photos/public/access',
      { method: 'POST', headers: json, body: JSON.stringify({ code: 'nonsense' }) },
      as(),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'PHOTO_CODE_UNKNOWN' } });
  });
});
