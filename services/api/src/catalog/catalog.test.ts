import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LambdaEvent } from 'hono/aws-lambda';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from './handler';

const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);

const TITLE_ID = '01JABCDEFGHJKMNPQRSTVWXYZ0';

const titleItem = {
  pk: `TITLE#${TITLE_ID}`,
  sk: 'TITLE',
  id: TITLE_ID,
  type: 'book',
  title: 'Dolfje Weerwolfje',
  authors: ['Paul van Loon'],
  language: 'nl',
  subjects: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
};

const copyItem = {
  pk: `TITLE#${TITLE_ID}`,
  sk: 'COPY#C1',
  id: 'C1',
  titleId: TITLE_ID,
  barcode: '00000001',
  status: 'available',
  note: 'cover slightly torn',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function eventWithGroups(groups?: string): { event: LambdaEvent } {
  const authorizer = groups
    ? { jwt: { claims: { sub: 'user-1', 'cognito:groups': groups } } }
    : undefined;
  return { event: { requestContext: { requestId: 'r1', authorizer } } as unknown as LambdaEvent };
}

function request(method: string, path: string, groups?: string, body?: unknown) {
  return app.request(
    path,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    eventWithGroups(groups),
  );
}

function conditionFailedAt(index: number, total: number) {
  return new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: Array.from({ length: total }, (_, i) => ({
      Code: i === index ? 'ConditionalCheckFailed' : 'None',
    })),
  });
}

beforeEach(() => {
  ddb.reset();
  s3.reset();
});

describe('public title', () => {
  it('hides internal copy notes from the public', async () => {
    ddb.on(QueryCommand).resolves({ Items: [titleItem, copyItem] });

    const res = await request('GET', `/api/catalog/public/titles/${TITLE_ID}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string; copies: object[] };
    expect(body.title).toBe('Dolfje Weerwolfje');
    expect(body.copies).toEqual([{ id: 'C1', status: 'available' }]);
  });

  it('returns 404 with a stable error code for unknown titles', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });

    const res = await request('GET', `/api/catalog/public/titles/${TITLE_ID}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('creating titles', () => {
  const validTitle = { type: 'book', title: 'Het geheim van de keel', isbn: '978-0-306-40615-7' };

  it('requires a staff role', async () => {
    expect(
      (await request('POST', '/api/catalog/titles', undefined, { title: validTitle })).status,
    ).toBe(401);
    expect(
      (await request('POST', '/api/catalog/titles', '[reader]', { title: validTitle })).status,
    ).toBe(403);
  });

  it('rejects invalid input with field details', async () => {
    const res = await request('POST', '/api/catalog/titles', '[librarian]', {
      title: { ...validTitle, isbn: '123' },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('stores the title with an audit entry and normalised ISBN', async () => {
    ddb.on(TransactWriteCommand).resolves({});

    const res = await request('POST', '/api/catalog/titles', '[librarian]', { title: validTitle });

    expect(res.status).toBe(201);
    const [items] = ddb
      .commandCalls(TransactWriteCommand)
      .map((c) => c.args[0].input.TransactItems);
    expect(items?.[0]?.Put?.Item).toMatchObject({
      sk: 'TITLE',
      isbn: '9780306406157',
      version: 1,
      language: 'nl',
    });
    expect(items?.[1]?.Put?.Item).toMatchObject({ action: 'title.created', actorId: 'user-1' });
  });
});

describe('updating titles', () => {
  it('reports a version conflict when someone else saved first', async () => {
    ddb.on(QueryCommand).resolves({ Items: [titleItem] });
    ddb.on(TransactWriteCommand).rejects(conditionFailedAt(0, 2));

    const res = await request('PUT', `/api/catalog/titles/${TITLE_ID}`, '[librarian]', {
      title: { type: 'book', title: 'New title' },
      version: 1,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'VERSION_CONFLICT' } });
  });
});

describe('copies', () => {
  it("generates a barcode with the school's number when none is given", async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { value: 42 } });
    ddb.on(TransactWriteCommand).resolves({});

    const res = await request('POST', `/api/catalog/titles/${TITLE_ID}/copies`, '[librarian]', {});

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ barcode: '012345000042', status: 'available' });
  });

  it('refuses a barcode that is already in use', async () => {
    ddb.on(TransactWriteCommand).rejects(conditionFailedAt(1, 4));

    const res = await request('POST', `/api/catalog/titles/${TITLE_ID}/copies`, '[librarian]', {
      barcode: 'B-123',
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'BARCODE_IN_USE' } });
  });

  it('does not change the status of a copy that is on loan', async () => {
    ddb
      .on(GetCommand)
      .resolvesOnce({ Item: { titleId: TITLE_ID, copyId: 'C1' } })
      .resolvesOnce({ Item: { ...copyItem, status: 'onLoan' } });

    const res = await request('PATCH', '/api/catalog/copies/00000001', '[librarian]', {
      status: 'lost',
    });

    expect(res.status).toBe(409);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});

describe('label data', () => {
  it('returns titles in the order asked, and lists unknown codes and reader cards apart', async () => {
    ddb
      .on(BatchGetCommand)
      .resolvesOnce({
        Responses: {
          'test-table': [
            { pk: 'CODE#00000002', sk: 'CODE', kind: 'copy', titleId: TITLE_ID, copyId: 'C2' },
            { pk: 'CODE#00000001', sk: 'CODE', titleId: TITLE_ID, copyId: 'C1' },
            { pk: 'CODE#L000001', sk: 'CODE', kind: 'reader', readerId: 'R1' },
          ],
        },
      })
      .resolvesOnce({ Responses: { 'test-table': [titleItem] } });

    const res = await request('POST', '/api/catalog/copies/labels', '[librarian]', {
      codes: ['00000001', 'NOPE-1', '00000002', 'L000001'],
    });

    expect(await res.json()).toEqual({
      labels: [
        {
          barcode: '00000001',
          titleId: TITLE_ID,
          title: 'Dolfje Weerwolfje',
          authors: ['Paul van Loon'],
        },
        {
          barcode: '00000002',
          titleId: TITLE_ID,
          title: 'Dolfje Weerwolfje',
          authors: ['Paul van Loon'],
        },
      ],
      unknown: ['NOPE-1', 'L000001'],
    });
  });
});

describe('uploaded covers', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(2000).fill(1)]).toString('base64');

  it('stores the image under a new name, points the title to it and removes the old one', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ ...titleItem, coverImageKey: 'covers/old.jpg' }] });
    ddb.on(TransactWriteCommand).resolves({});
    s3.on(PutObjectCommand).resolves({});
    s3.on(DeleteObjectCommand).resolves({});

    const res = await request('PUT', `/api/catalog/titles/${TITLE_ID}/cover`, '[librarian]', {
      image: jpeg,
    });

    expect(res.status).toBe(200);
    const { coverImageKey } = (await res.json()) as { coverImageKey: string };
    expect(coverImageKey).toMatch(new RegExp(`^covers/${TITLE_ID}-[0-9a-z]{26}\\.jpg$`));
    expect(s3.commandCalls(PutObjectCommand)[0]?.args[0].input).toMatchObject({
      Key: coverImageKey,
      ContentType: 'image/jpeg',
    });
    const update = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[0];
    // The cover change must not bump the version, so a parallel edit of the details still saves.
    expect(update?.Update?.UpdateExpression).toBe('SET coverImageKey = :key, updatedAt = :now');
    expect(s3.commandCalls(DeleteObjectCommand)[0]?.args[0].input.Key).toBe('covers/old.jpg');
  });

  it('refuses files that are not images, whatever they claim to be', async () => {
    ddb.on(QueryCommand).resolves({ Items: [titleItem] });
    const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    const res = await request('PUT', `/api/catalog/titles/${TITLE_ID}/cover`, '[librarian]', {
      image: html,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'INVALID_IMAGE' } });
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it('removes a cover', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ ...titleItem, coverImageKey: 'covers/old.jpg' }] });
    ddb.on(TransactWriteCommand).resolves({});
    s3.on(DeleteObjectCommand).resolves({});

    const res = await request('DELETE', `/api/catalog/titles/${TITLE_ID}/cover`, '[librarian]');

    expect(res.status).toBe(204);
    const update = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[0];
    expect(update?.Update?.UpdateExpression).toBe('SET updatedAt = :now REMOVE coverImageKey');
  });
});

describe('label print queue', () => {
  const putCopyItem = () =>
    ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[2]?.Put?.Item;

  it('queues copies with a generated barcode, not ones with a typed barcode', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { value: 43 } });
    ddb.on(TransactWriteCommand).resolves({});

    await request('POST', `/api/catalog/titles/${TITLE_ID}/copies`, '[librarian]', {});
    expect(putCopyItem()).toMatchObject({
      labelPending: true,
      gsi1pk: 'LABELS#PENDING',
      gsi1sk: '012345000043',
    });

    ddb.resetHistory();
    await request('POST', `/api/catalog/titles/${TITLE_ID}/copies`, '[librarian]', {
      barcode: 'OLD-0042',
    });
    expect(putCopyItem()).toMatchObject({ labelPending: false });
    expect(putCopyItem()).not.toHaveProperty('gsi1pk');
  });

  it('keeps a waiting copy in the queue when it is edited', async () => {
    ddb
      .on(GetCommand)
      .resolvesOnce({ Item: { titleId: TITLE_ID, copyId: 'C1' } })
      .resolvesOnce({ Item: { ...copyItem, labelPending: true } });
    ddb.on(TransactWriteCommand).resolves({});

    await request('PATCH', '/api/catalog/copies/00000001', '[librarian]', {
      location: 'Klasbib 3B',
    });

    const put = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[0]?.Put;
    expect(put?.Item).toMatchObject({ gsi1pk: 'LABELS#PENDING', location: 'Klasbib 3B' });
  });

  it('lists waiting labels with their titles', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ ...copyItem, labelPending: true, gsi1pk: 'LABELS#PENDING', gsi1sk: '00000001' }],
    });
    ddb.on(BatchGetCommand).resolves({ Responses: { 'test-table': [titleItem] } });

    const res = await request('GET', '/api/catalog/labels/pending', '[librarian]');

    expect(await res.json()).toEqual([
      {
        barcode: '00000001',
        titleId: TITLE_ID,
        title: 'Dolfje Weerwolfje',
        authors: ['Paul van Loon'],
      },
    ]);
  });

  it('takes printed labels out of the queue and skips copies that were not waiting', async () => {
    ddb.on(BatchGetCommand).resolves({
      Responses: {
        'test-table': [
          { pk: 'CODE#00000001', sk: 'CODE', kind: 'copy', titleId: TITLE_ID, copyId: 'C1' },
          { pk: 'CODE#00000002', sk: 'CODE', kind: 'copy', titleId: TITLE_ID, copyId: 'C2' },
        ],
      },
    });
    ddb
      .on(UpdateCommand)
      .resolvesOnce({})
      .rejectsOnce(new ConditionalCheckFailedException({ message: 'no', $metadata: {} }));

    const res = await request('POST', '/api/catalog/labels/printed', '[librarian]', {
      codes: ['00000001', '00000002'],
    });

    expect(await res.json()).toEqual({ marked: 1 });
    expect(ddb.commandCalls(UpdateCommand)[0]?.args[0].input.UpdateExpression).toBe(
      'REMOVE labelPending, gsi1pk, gsi1sk',
    );
  });
});
