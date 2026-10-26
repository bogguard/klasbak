import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_SETTINGS, type Copy, type LibrarySettings, type Loan } from '@klasbak/shared';
import { db, env } from '../lib/aws';
import { failedConditionAt, getItem, queryAll, stripKeys, type Item } from '../lib/dynamo';
import { ConflictError } from '../lib/errors';
import {
  ACTIVE_LOANS_INDEX_PK,
  copyKey,
  exchangeKey,
  GSI1,
  loanKey,
  readerKey,
  settingsKey,
  statsKey,
} from '../lib/keys';

export async function getSettings(): Promise<LibrarySettings> {
  // Defaults first, so settings saved before a new option existed still get a value for it.
  return { ...DEFAULT_SETTINGS, ...(await getItem<LibrarySettings>(settingsKey)) };
}

export async function saveSettings(
  settings: LibrarySettings,
  expectedVersion: number,
  audit: Item,
) {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: env.tableName,
              Item: { ...settingsKey, ...settings },
              // Version 0 means "never saved": the item must not exist yet.
              ConditionExpression:
                expectedVersion === 0 ? 'attribute_not_exists(pk)' : '#version = :expected',
              ...(expectedVersion === 0
                ? {}
                : {
                    ExpressionAttributeNames: { '#version': 'version' },
                    ExpressionAttributeValues: { ':expected': expectedVersion },
                  }),
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
  } catch (error) {
    if (failedConditionAt(error, 0)) {
      throw new ConflictError('VERSION_CONFLICT', 'The settings were changed by someone else');
    }
    throw error;
  }
}

export async function activeLoansOfReader(readerId: string): Promise<Loan[]> {
  const items = await queryAll({
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :loan)',
    FilterExpression: 'attribute_not_exists(returnedAt)',
    ExpressionAttributeValues: { ':pk': readerKey(readerId).pk, ':loan': 'LOAN#' },
  });
  return items.map((item) => stripKeys<Loan>(item));
}

export function getLoan(readerId: string, loanId: string): Promise<Loan | undefined> {
  return getItem<Loan>(loanKey(readerId, loanId));
}

/** Active loans by due date; with `dueBefore`, only those due before that date (overdue). */
export async function listActiveLoans(dueBefore?: string): Promise<Loan[]> {
  const items = await queryAll({
    IndexName: GSI1,
    KeyConditionExpression: dueBefore ? 'gsi1pk = :pk AND gsi1sk < :before' : 'gsi1pk = :pk',
    ExpressionAttributeValues: {
      ':pk': ACTIVE_LOANS_INDEX_PK,
      ...(dueBefore ? { ':before': dueBefore } : {}),
    },
  });
  return items.map((item) => stripKeys<Loan>(item));
}

export type CheckOutFailure = 'readerRefused' | 'copyNotAvailable';

/**
 * Lends a copy in one transaction. The database itself guarantees the rules:
 * the reader is active and below their maximum, and the copy is still available.
 * The anonymous statistics are counted in the same transaction, so they never drift.
 */
export async function checkOut(params: {
  loan: Loan;
  copy: Copy;
  maxLoans: number;
  audit: Item;
  /**
   * Month (YYYY-MM, Brussels time), for pupils the class, and the title's AVI level to count
   * the loan under; for a book of an exchange collection also that collection (its loan
   * counter, for the library).
   */
  stats: { month: string; group?: string; aviLevel?: string; exchangeId?: string };
}): Promise<CheckOutFailure | undefined> {
  const { loan, copy, maxLoans, audit, stats } = params;
  // The title counter keeps the name too: the title may leave the catalogue later.
  const counters: Array<{ sk: string; title?: string }> = [
    { sk: 'TOTAL' },
    { sk: `TITLE#${loan.titleId}`, title: loan.titleTitle },
    ...(stats.group ? [{ sk: `GROUP#${stats.group}` }] : []),
    ...(stats.aviLevel ? [{ sk: `AVI#${stats.aviLevel}` }] : []),
  ];
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: readerKey(loan.readerId),
              UpdateExpression: 'ADD activeLoanCount :one',
              ConditionExpression:
                'active = :true AND (attribute_not_exists(activeLoanCount) OR activeLoanCount < :max)',
              ExpressionAttributeValues: { ':one': 1, ':true': true, ':max': maxLoans },
            },
          },
          {
            Update: {
              TableName: env.tableName,
              Key: copyKey(copy.titleId, copy.id),
              // The copy counts its own loans too (e.g. per book of an exchange collection).
              UpdateExpression:
                'SET #status = :onLoan, currentLoan = :loan, updatedAt = :now ADD loanCount :one',
              ConditionExpression: '#status = :available',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':one': 1,
                ':onLoan': 'onLoan',
                ':available': 'available',
                ':now': loan.loanedAt,
                ':loan': {
                  loanId: loan.id,
                  readerId: loan.readerId,
                  dueDate: loan.dueDate,
                  loanedAt: loan.loanedAt,
                },
              },
            },
          },
          {
            Put: {
              TableName: env.tableName,
              Item: {
                ...loanKey(loan.readerId, loan.id),
                // Only active loans are in the index: overdue lists stay small and cheap.
                gsi1pk: ACTIVE_LOANS_INDEX_PK,
                gsi1sk: `${loan.dueDate}#${loan.id}`,
                ...loan,
              },
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
          ...counters.map(({ sk, title }) => ({
            Update: {
              TableName: env.tableName,
              Key: statsKey(stats.month, sk),
              UpdateExpression: title ? 'ADD loans :one SET #title = :title' : 'ADD loans :one',
              ...(title ? { ExpressionAttributeNames: { '#title': 'title' } } : {}),
              ExpressionAttributeValues: { ':one': 1, ...(title ? { ':title': title } : {}) },
            },
          })),
          ...(stats.exchangeId
            ? [
                {
                  Update: {
                    TableName: env.tableName,
                    Key: exchangeKey(stats.exchangeId),
                    UpdateExpression: 'ADD loans :one',
                    ConditionExpression: 'attribute_exists(pk)',
                    ExpressionAttributeValues: { ':one': 1 },
                  },
                },
              ]
            : []),
        ],
      }),
    );
    return undefined;
  } catch (error) {
    if (failedConditionAt(error, 0)) return 'readerRefused';
    if (failedConditionAt(error, 1)) return 'copyNotAvailable';
    throw error;
  }
}

/** Moves a loan's due date; returns false when the loan had already ended. */
export async function renew(params: { loan: Loan; copy: Copy; dueDate: string; audit: Item }) {
  const { loan, copy, dueDate, audit } = params;
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: loanKey(loan.readerId, loan.id),
              // The overdue list is sorted by due date, so its index key moves along.
              UpdateExpression: 'SET dueDate = :due, gsi1sk = :sort ADD renewals :one',
              ConditionExpression: 'attribute_not_exists(returnedAt)',
              ExpressionAttributeValues: {
                ':due': dueDate,
                ':sort': `${dueDate}#${loan.id}`,
                ':one': 1,
              },
            },
          },
          {
            Update: {
              TableName: env.tableName,
              Key: copyKey(copy.titleId, copy.id),
              UpdateExpression: 'SET currentLoan.dueDate = :due',
              ConditionExpression: 'currentLoan.loanId = :loanId',
              ExpressionAttributeValues: { ':due': dueDate, ':loanId': loan.id },
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
    return true;
  } catch (error) {
    if (failedConditionAt(error, 0) || failedConditionAt(error, 1)) return false;
    throw error;
  }
}

/** Ends a loan; returns false when it had already ended (e.g. returned at another desk). */
export async function checkIn(params: {
  loan: Loan;
  copy: Copy;
  returnedAt: string;
  audit: Item;
}): Promise<boolean> {
  const { loan, copy, returnedAt, audit } = params;
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: copyKey(copy.titleId, copy.id),
              UpdateExpression: 'SET #status = :available, updatedAt = :now REMOVE currentLoan',
              ConditionExpression: 'currentLoan.loanId = :loanId',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':available': 'available',
                ':now': returnedAt,
                ':loanId': loan.id,
              },
            },
          },
          {
            Update: {
              TableName: env.tableName,
              Key: loanKey(loan.readerId, loan.id),
              UpdateExpression: 'SET returnedAt = :now REMOVE gsi1pk, gsi1sk',
              ConditionExpression: 'attribute_not_exists(returnedAt)',
              ExpressionAttributeValues: { ':now': returnedAt },
            },
          },
          {
            Update: {
              TableName: env.tableName,
              Key: readerKey(loan.readerId),
              UpdateExpression: 'ADD activeLoanCount :minusOne',
              ExpressionAttributeValues: { ':minusOne': -1 },
            },
          },
          { Put: { TableName: env.tableName, Item: audit } },
        ],
      }),
    );
    return true;
  } catch (error) {
    if (failedConditionAt(error, 0) || failedConditionAt(error, 1)) return false;
    throw error;
  }
}

/** All counters of these months (one small partition per month). */
export async function statisticsOf(
  months: string[],
): Promise<Array<{ month: string; sk: string; loans: number; title?: string }>> {
  const perMonth = await Promise.all(
    months.map(async (month) => {
      const items = await queryAll({
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': statsKey(month, '').pk },
      });
      return items.map((item) => ({
        month,
        sk: String(item.sk),
        loans: Number(item.loans ?? 0),
        title: typeof item.title === 'string' ? item.title : undefined,
      }));
    }),
  );
  return perMonth.flat();
}
