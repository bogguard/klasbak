import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../lib/auth';
import { addExchangeBooks, getExchange, returnExchange } from './service';

const ddb = mockClient(DynamoDBDocumentClient);
const librarian: Actor = { userId: 'lib-1', roles: ['librarian'] };
const exchange = {
  pk: 'EXCHANGE',
  sk: 'X1',
  id: 'X1',
  name: 'Najaar 2026',
  lender: 'Bibliotheek Zele',
  returnBy: '2027-01-29',
  status: 'active',
};
const copy = (id: string, titleId: string, extra = {}) => ({
  pk: `TITLE#${titleId}`,
  sk: `COPY#${id}`,
  id,
  titleId,
  barcode: `3000${id}`,
  status: 'available',
  exchangeId: 'X1',
  ...extra,
});

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand, { Key: { pk: 'EXCHANGE', sk: 'X1' } }).resolves({ Item: exchange });
  ddb.on(TransactWriteCommand).resolves({});
  ddb.on(UpdateCommand).resolves({});
  ddb.on(DeleteCommand).resolves({});
  ddb.on(PutCommand).resolves({});
});

describe('adding books to an exchange collection', () => {
  it('keeps the library barcode, needs no label, and makes one title per new ISBN', async () => {
    const title = { type: 'book', title: 'Dolfje Weerwolfje', isbn: '9789025870447' };
    const results = await addExchangeBooks(librarian, 'X1', [
      { barcode: '30001', title },
      { barcode: '30002', title },
      { barcode: '30003', titleId: 'T-OWN' },
    ]);

    expect(results.map((r) => r.status)).toEqual(['added', 'added', 'added']);
    const writes = ddb.commandCalls(TransactWriteCommand).map((c) => c.args[0].input.TransactItems);
    const titles = writes.filter((w) => w?.some((i) => i.Put?.Item?.sk === 'TITLE'));
    expect(titles).toHaveLength(1);
    expect(titles[0]?.[0]?.Put?.Item).toMatchObject({ exchangeId: 'X1' });
    const copies = writes
      .flatMap((w) => w ?? [])
      .filter((i) => String(i.Put?.Item?.sk).startsWith('COPY#'));
    expect(copies.map((i) => i.Put?.Item)).toEqual([
      expect.objectContaining({
        barcode: '30001',
        exchangeId: 'X1',
        gsi1pk: 'EXCHANGE#X1',
      }),
      expect.objectContaining({ barcode: '30002', labelPending: false }),
      expect.objectContaining({ barcode: '30003', titleId: 'T-OWN' }),
    ]);
  });

  it('refuses a collection that already went back', async () => {
    ddb
      .on(GetCommand, { Key: { pk: 'EXCHANGE', sk: 'X1' } })
      .resolves({ Item: { ...exchange, status: 'returned' } });
    await expect(
      addExchangeBooks(librarian, 'X1', [{ barcode: '30001', titleId: 'T1' }]),
    ).rejects.toMatchObject({
      code: 'EXCHANGE_RETURNED',
    });
  });
});

describe('returning an exchange collection', () => {
  it('waits until every book is back', async () => {
    ddb
      .on(QueryCommand)
      .resolves({ Items: [copy('1', 'T1'), copy('2', 'T2', { status: 'onLoan' })] });
    await expect(returnExchange(librarian, 'X1')).rejects.toMatchObject({
      code: 'EXCHANGE_HAS_LOANS',
      details: { count: 1 },
    });
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('removes the books and the titles made only for it, and keeps the collection', async () => {
    ddb
      .on(QueryCommand, { IndexName: 'gsi1' })
      .resolves({ Items: [copy('1', 'T1', { loanCount: 2 }), copy('2', 'T-OWN')] });
    // After removing: T1 has no copies left, T-OWN still has the school's own copy.
    ddb
      .on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'TITLE#T1', ':copy': 'COPY#' } })
      .resolves({ Items: [] });
    ddb
      .on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'TITLE#T-OWN', ':copy': 'COPY#' } })
      .resolves({ Items: [{ pk: 'TITLE#T-OWN', sk: 'COPY#OWN' }] });
    ddb.on(BatchGetCommand).resolves({
      Responses: {
        'test-table': [
          { pk: 'TITLE#T1', sk: 'TITLE', id: 'T1', title: 'Van de bib', exchangeId: 'X1' },
          { pk: 'TITLE#T-OWN', sk: 'TITLE', id: 'T-OWN', title: 'Ook van de school' },
        ],
      },
    });

    const result = await returnExchange(librarian, 'X1', new Date('2027-01-25T10:00:00Z'));

    expect(result).toMatchObject({ status: 'returned', returnedOn: '2027-01-25', bookCount: 2 });
    const removed = ddb
      .commandCalls(TransactWriteCommand)
      .map((c) => c.args[0].input.TransactItems?.[1]?.Delete?.Key);
    expect(removed).toEqual([
      { pk: 'CODE#30001', sk: 'CODE' },
      { pk: 'CODE#30002', sk: 'CODE' },
    ]);
    expect(ddb.commandCalls(DeleteCommand).map((c) => c.args[0].input.Key)).toEqual([
      { pk: 'TITLE#T1', sk: 'TITLE' },
    ]);
    expect(
      ddb.commandCalls(UpdateCommand)[0]?.args[0].input.ExpressionAttributeValues,
    ).toMatchObject({
      ':returned': 'returned',
      ':count': 2,
      // The list the library evaluates: each book with its loans, most lent first.
      ':books': [
        { barcode: '30001', title: 'Van de bib', authors: [], loans: 2 },
        { barcode: '30002', title: 'Ook van de school', authors: [], loans: 0 },
      ],
    });
  });
});

describe('a returned exchange collection', () => {
  it('keeps showing how many books it had, as the overview does', async () => {
    ddb.on(GetCommand, { Key: { pk: 'EXCHANGE', sk: 'X1' } }).resolves({
      Item: { ...exchange, status: 'returned', bookCount: 3, loans: 1 },
    });
    expect(await getExchange('X1')).toMatchObject({ books: 3, onLoan: 0, loans: 1, bookList: [] });
  });
});
