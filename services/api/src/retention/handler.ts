import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, ScanCommand, type ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { Loan } from '@klasbak/shared';
import type { Context } from 'aws-lambda';
import { getSettings } from '../circulation/repository';
import { db, env } from '../lib/aws';
import type { Item } from '../lib/dynamo';
import { logger, metrics } from '../lib/observability';

/*
 * Runs daily (see the template). Reading history is personal data, so returned loans older
 * than the retention period (a library setting) are deleted. Statistics don't need them:
 * every loan was already counted anonymously when it was lent (decision 028).
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
      if (await removeLoan(item as Item & Loan)) removed++;
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return removed;
}

/** Deletes one returned loan; false when it was already gone (e.g. a retried run). */
async function removeLoan(loan: Item & Loan): Promise<boolean> {
  try {
    await db.send(
      new DeleteCommand({
        TableName: env.tableName,
        Key: { pk: loan.pk, sk: loan.sk },
        ConditionExpression: 'attribute_exists(returnedAt)',
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return false;
    throw error;
  }
}
