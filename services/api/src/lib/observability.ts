import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';

// Service name, namespace and log level come from environment variables set in the SAM template.
export const logger = new Logger();
export const metrics = new Metrics();
export const tracer = new Tracer();
