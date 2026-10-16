import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { logger, metrics } from '../lib/observability';
import { rebuildSearchIndex } from './rebuild';

/*
 * Rebuilds the public search index whenever titles or copies change (see decision 003);
 * copies change on every loan and return, which keeps "available" up to date.
 * The DynamoDB stream only acts as a trigger: we always rebuild from the table, so the
 * result is correct no matter which or how many changes are in the batch. Changes that arrive
 * while a rebuild runs are handled together by the next one, so bulk edits don't cause hundreds.
 */
export async function handler(_event: DynamoDBStreamEvent, context: Context): Promise<void> {
  logger.addContext(context);
  const started = Date.now();

  const titles = await rebuildSearchIndex();

  logger.info('search index rebuilt', { titles, durationMs: Date.now() - started });
  metrics.addMetric('SearchIndexTitles', MetricUnit.Count, titles);
  metrics.publishStoredMetrics();
}
