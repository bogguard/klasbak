import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { logger, metrics } from '../lib/observability';
import { rebuildSearchIndex } from './rebuild';

/*
 * Rebuilds the public search index whenever titles change (see decision 003).
 * The DynamoDB stream only acts as a trigger: we always rebuild from the table, so the
 * result is correct no matter which or how many changes are in the batch. The SAM template
 * batches changes for up to a minute so bulk edits cause one rebuild, not hundreds.
 */
export async function handler(_event: DynamoDBStreamEvent, context: Context): Promise<void> {
  logger.addContext(context);
  const started = Date.now();

  const titles = await rebuildSearchIndex();

  logger.info('search index rebuilt', { titles, durationMs: Date.now() - started });
  metrics.addMetric('SearchIndexTitles', MetricUnit.Count, titles);
  metrics.publishStoredMetrics();
}
