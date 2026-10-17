import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../lib/auth';
import { codeKey, copyKey, loanKey, readerKey, titleKey } from '../lib/keys';
import { myBooks, renewLoan, scan, statistics } from './service';

const ddb = mockClient(DynamoDBDocumentClient);
const librarian: Actor = { userId: 'lib-1', roles: ['librarian'] };

// Thursday 15 October 2026, 10:00 in Brussels.
const NOW = new Date('2026-10-15T08:00:00Z');

const reader = {
  id: 'R1',
  memberNumber: 'L000001',
  firstName: 'Lotte',
  lastName: 'Peeters',
  group: '3B',
  category: 'pupil',
  active: true,
  activeLoanCount: 0,
  version: 1,
};
const copy = { id: 'C1', titleId: 'T1', barcode: '00000001', status: 'available' };
const title = { id: 'T1', title: 'Dolfje Weerwolfje', aviLevel: 'E4' };

function givenItems(items: Array<[{ pk: string; sk: string }, object]>) {
  for (const [key, item] of items) ddb.on(GetCommand, { Key: key }).resolves({ Item: item });
}

function cancelledAt(index: number) {
  return new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: [0, 1, 2, 3].map((i) => ({
      Code: i === index ? 'ConditionalCheckFailed' : 'None',
    })),
  });
}

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand).resolves({}); // anything not given below doesn't exist (e.g. settings)
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(TransactWriteCommand).resolves({});
  givenItems([
    [codeKey('L000001'), { kind: 'reader', readerId: 'R1' }],
    [codeKey('00000001'), { kind: 'copy', titleId: 'T1', copyId: 'C1' }],
    [readerKey('R1'), reader],
    [titleKey('T1'), title],
  ]);
});

describe('scanning at the desk', () => {
  it('selects the reader when a card is scanned', async () => {
    givenItems([[copyKey('T1', 'C1'), copy]]);
    const result = await scan(librarian, 'L000001', undefined, NOW);
    expect(result).toMatchObject({ outcome: 'reader', reader: { id: 'R1' }, activeLoans: [] });
  });

  it('asks for a reader card before lending a book', async () => {
    givenItems([[copyKey('T1', 'C1'), copy]]);
    await expect(scan(librarian, '00000001', undefined, NOW)).rejects.toMatchObject({
      code: 'NO_READER_SELECTED',
    });
  });

  it('lends an available book with a due date from the loan rules', async () => {
    givenItems([[copyKey('T1', 'C1'), copy]]);

    const result = await scan(librarian, '00000001', 'R1', NOW);

    // Default rules: pupils 21 days → Thursday 5 November.
    expect(result).toMatchObject({
      outcome: 'checkedOut',
      loan: { dueDate: '2026-11-05', readerName: 'Lotte Peeters', titleTitle: 'Dolfje Weerwolfje' },
    });
    const [items] = ddb
      .commandCalls(TransactWriteCommand)
      .map((c) => c.args[0].input.TransactItems);
    // The maximum (3 for pupils) and availability are enforced by the database itself.
    expect(items?.[0]?.Update?.ExpressionAttributeValues).toMatchObject({ ':max': 3 });
    expect(items?.[1]?.Update?.ConditionExpression).toBe('#status = :available');
    // The copy counts its own loans.
    expect(items?.[1]?.Update?.UpdateExpression).toContain('ADD loanCount :one');
    // Counted anonymously in the same transaction: month, title and class, never the reader.
    expect(items?.slice(4).map((i) => i.Update?.Key)).toEqual([
      { pk: 'STATS#2026-10', sk: 'TOTAL' },
      { pk: 'STATS#2026-10', sk: 'TITLE#T1' },
      { pk: 'STATS#2026-10', sk: 'GROUP#3B' },
      { pk: 'STATS#2026-10', sk: 'AVI#E4' },
    ]);
    // The title's name is kept with its counter, for when the title leaves the catalogue.
    expect(items?.[5]?.Update?.ExpressionAttributeValues).toMatchObject({
      ':title': 'Dolfje Weerwolfje',
    });
  });

  it('lends a book of an exchange collection until a week before the collection goes back', async () => {
    givenItems([
      [copyKey('T1', 'C1'), { ...copy, exchangeId: 'X1' }],
      [
        { pk: 'EXCHANGE', sk: 'X1' },
        { id: 'X1', status: 'active', returnBy: '2026-11-06', name: 'Najaar', lender: 'Bib' },
      ],
    ]);

    const result = await scan(librarian, '00000001', 'R1', NOW);

    // Normally 5 November; the collection goes back on 6 November → back by 30 October.
    expect(result).toMatchObject({ outcome: 'checkedOut', loan: { dueDate: '2026-10-30' } });
    const items = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.at(-1)?.Update?.Key).toEqual({ pk: 'EXCHANGE', sk: 'X1' });
  });

  it('explains when the reader already has the maximum number of books', async () => {
    givenItems([[copyKey('T1', 'C1'), copy]]);
    ddb.on(TransactWriteCommand).rejects(cancelledAt(0));
    await expect(scan(librarian, '00000001', 'R1', NOW)).rejects.toMatchObject({
      code: 'MAX_LOANS_REACHED',
      details: { maxLoans: 3 },
    });
  });

  it('returns a book that is on loan, and reports if it was late', async () => {
    const loan = {
      id: 'LN1',
      readerId: 'R2',
      dueDate: '2026-10-01',
      loanedAt: '2026-09-10T08:00:00Z',
    };
    givenItems([
      [copyKey('T1', 'C1'), { ...copy, status: 'onLoan', currentLoan: { ...loan, loanId: 'LN1' } }],
      [loanKey('R2', 'LN1'), loan],
    ]);

    const result = await scan(librarian, '00000001', 'R1', NOW);

    expect(result).toMatchObject({ outcome: 'returned', wasOverdue: true });
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it('treats a second scan right after lending as a double scan, not a return', async () => {
    const loanedAt = new Date(NOW.getTime() - 5_000).toISOString();
    const loan = { id: 'LN1', readerId: 'R1', dueDate: '2026-11-05', loanedAt };
    givenItems([
      [copyKey('T1', 'C1'), { ...copy, status: 'onLoan', currentLoan: { ...loan, loanId: 'LN1' } }],
      [loanKey('R1', 'LN1'), loan],
    ]);

    const result = await scan(librarian, '00000001', 'R1', NOW);

    expect(result.outcome).toBe('alreadyLoaned');
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('refuses copies that are lost, damaged or withdrawn', async () => {
    givenItems([[copyKey('T1', 'C1'), { ...copy, status: 'lost' }]]);
    await expect(scan(librarian, '00000001', 'R1', NOW)).rejects.toMatchObject({
      code: 'COPY_NOT_LENDABLE',
      details: { status: 'lost' },
    });
  });

  it('says so when a code is unknown', async () => {
    await expect(scan(librarian, 'NOPE-123', 'R1', NOW)).rejects.toMatchObject({
      status: 404,
      code: 'UNKNOWN_CODE',
    });
  });
});

describe('renewing', () => {
  const loan = {
    id: 'LN1',
    readerId: 'R1',
    titleId: 'T1',
    copyId: 'C1',
    dueDate: '2026-10-20',
    loanedAt: '2026-09-29T08:00:00Z',
  };

  it('extends from today with the normal rules and moves the copy and overdue list along', async () => {
    givenItems([
      [loanKey('R1', 'LN1'), loan],
      [copyKey('T1', 'C1'), { ...copy, status: 'onLoan', currentLoan: { ...loan, loanId: 'LN1' } }],
    ]);

    const result = await renewLoan(librarian, 'R1', 'LN1', NOW);

    // 15 October + 21 days = 5 November.
    expect(result.loan).toMatchObject({ dueDate: '2026-11-05', renewals: 1 });
    const items = ddb.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.[0]?.Update?.ExpressionAttributeValues).toMatchObject({
      ':due': '2026-11-05',
      ':sort': '2026-11-05#LN1',
    });
    expect(items?.[1]?.Update?.UpdateExpression).toBe('SET currentLoan.dueDate = :due');
  });

  it('says so when renewing would not give more time, and counts nothing', async () => {
    givenItems([
      [loanKey('R1', 'LN1'), { ...loan, dueDate: '2026-11-05' }],
      [copyKey('T1', 'C1'), copy],
    ]);
    await expect(renewLoan(librarian, 'R1', 'LN1', NOW)).rejects.toMatchObject({
      code: 'RENEWAL_NOT_LONGER',
      details: { dueDate: '2026-11-05' },
    });
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('refuses books that were returned and readers who are not active', async () => {
    givenItems([[loanKey('R1', 'LN1'), { ...loan, returnedAt: '2026-10-14T10:00:00Z' }]]);
    await expect(renewLoan(librarian, 'R1', 'LN1', NOW)).rejects.toMatchObject({
      code: 'LOAN_NOT_ACTIVE',
    });

    givenItems([
      [loanKey('R1', 'LN1'), loan],
      [readerKey('R1'), { ...reader, active: false }],
    ]);
    await expect(renewLoan(librarian, 'R1', 'LN1', NOW)).rejects.toMatchObject({
      code: 'READER_INACTIVE',
    });
  });
});

describe('my books', () => {
  it('shows the first name and the books by due date, nothing else', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        {
          pk: 'READER#R1',
          sk: 'LOAN#2',
          id: 'LN2',
          titleTitle: 'Later',
          dueDate: '2026-11-05',
          barcode: 'X',
        },
        {
          pk: 'READER#R1',
          sk: 'LOAN#1',
          id: 'LN1',
          titleTitle: 'Eerst',
          dueDate: '2026-10-20',
          barcode: 'Y',
        },
      ],
    });

    expect(await myBooks('L000001')).toEqual({
      firstName: 'Lotte',
      loans: [
        { id: 'LN1', titleTitle: 'Eerst', dueDate: '2026-10-20' },
        { id: 'LN2', titleTitle: 'Later', dueDate: '2026-11-05' },
      ],
    });
  });

  it('asks for a reader card when a book is scanned', async () => {
    await expect(myBooks('00000001')).rejects.toMatchObject({ code: 'NOT_A_READER_CARD' });
  });
});

describe('statistics', () => {
  it('adds up the counters per month, title and class, with the number of pupils per class', async () => {
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'STATS#2026-09' } }).resolves({
      Items: [
        { sk: 'TOTAL', loans: 5 },
        { sk: 'TITLE#T1', loans: 3, title: 'Dolfje Weerwolfje' },
        { sk: 'AVI#E4', loans: 3 },
        { sk: 'TITLE#T2', loans: 2 },
        { sk: 'GROUP#3B', loans: 4 },
      ],
    });
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'STATS#2026-10' } }).resolves({
      Items: [
        { sk: 'TOTAL', loans: 2 },
        { sk: 'TITLE#T2', loans: 2 },
      ],
    });
    ddb.on(QueryCommand, { IndexName: 'gsi1' }).resolves({
      Items: [
        { ...reader, id: 'R1' },
        { ...reader, id: 'R2', group: '1A' },
        { ...reader, id: 'R3', active: false },
        { ...reader, id: 'R4', category: 'teacher' },
      ],
    });

    const result = await statistics('2026-09', '2026-11');

    expect(result.months).toEqual([
      { month: '2026-09', loans: 5 },
      { month: '2026-10', loans: 2 },
      { month: '2026-11', loans: 0 },
    ]);
    expect(result.titles).toEqual([
      { titleId: 'T2', loans: 4, title: undefined },
      { titleId: 'T1', loans: 3, title: 'Dolfje Weerwolfje' },
    ]);
    expect(result.avi).toEqual([{ level: 'E4', loans: 3 }]);
    expect(result.groups).toEqual(
      expect.arrayContaining([
        { group: '3B', loans: 4, pupils: 1 },
        { group: '1A', loans: 0, pupils: 1 },
      ]),
    );
    expect(result.groups).toHaveLength(2);
    expect(result.readers).toEqual({ pupils: 2, teachers: 1 });
  });
});
