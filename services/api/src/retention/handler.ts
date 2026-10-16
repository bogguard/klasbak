import { ScanCommand, TransactWriteCommand, type ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { Loan } from '@library/shared';
import type { Context } from 'aws-lambda';
import { getSettings } from '../circulation/repository';
import { db, env } from '../lib/aws';
import { isTransactionCancelled, type Item } from '../lib/dynamo';
import { logger, metrics } from '../lib/observability';

/*
 * Runs daily (see the template). Reading history is personal data, so returned loans older
 * than the retention period (a library setting) are deleted. Before deleting, each loan is
 * added to anonymous monthly counters (per month, and per title per month) so statistics
 * stay possible without knowing who read what.
 *
 * A full table scan is fine at school scale (tens of thousands of items, a fraction of a cent).
 */
export async function handler(_event: unknown, context?: Context): Promise<{ removed: number }> {
  if (context) logger.addContext(context);
  const removed = await removeOldLoanHistory();
  logger.info('loan history cleaned up', { removed });
  metrics.addMetric('LoansAnonymised', MetricUnit.Count, removed);
  metrics.publishStoredMetrics();
  return { removed };
}

export async function removeOldLoanHistory(now = new Date()): Promise<number> {
  const { historyRetentionDays } = await getSettings();
  const cutoff = new Date(now.getTime() - historyRetentionDays * 86_400_000).toISOString();

  let removed = 0;
  let startKey: Item | undefined;
  do {
    const page: ScanCommandOutput = await db.send(
      new ScanCommand({
        TableName: env.tableName,
        FilterExpression: 'begins_with(sk, :loan) AND returnedAt < :cutoff',
        ExpressionAttributeValues: { ':loan': 'LOAN#', ':cutoff': cutoff },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      if (await anonymise(item as Item & Loan)) removed++;
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return removed;
}

/** Counts the loan in the monthly statistics and deletes it, in one transaction. */
async function anonymise(loan: Item & Loan): Promise<boolean> {
  const month = loan.loanedAt.slice(0, 7); // YYYY-MM
  const count = (sk: string) => ({
    Update: {
      TableName: env.tableName,
      Key: { pk: `STATS#${month}`, sk },
      UpdateExpression: 'ADD loans :one',
      ExpressionAttributeValues: { ':one': 1 },
    },
  });
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: env.tableName,
              Key: { pk: loan.pk, sk: loan.sk },
              // Only if it's still there, so a retry never counts a loan twice.
              ConditionExpression: 'attribute_exists(returnedAt)',
            },
          },
          count('TOTAL'),
          count(`TITLE#${loan.titleId}`),
        ],
      }),
    );
    return true;
  } catch (error) {
    if (isTransactionCancelled(error)) return false;
    throw error;
  }
}
