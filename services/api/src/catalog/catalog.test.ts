import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LambdaEvent } from 'hono/aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from './handler';
import { formatBarcode } from './service';

const ddb = mockClient(DynamoDBDocumentClient);

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

beforeEach(() => ddb.reset());

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
  it('generates a zero-padded barcode when none is given', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { value: 42 } });
    ddb.on(TransactWriteCommand).resolves({});

    const res = await request('POST', `/api/catalog/titles/${TITLE_ID}/copies`, '[librarian]', {});

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ barcode: '00000042', status: 'available' });
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

describe('formatBarcode', () => {
  it('pads to eight digits', () => {
    expect(formatBarcode(7)).toBe('00000007');
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
