import type { Context as LambdaContext } from 'aws-lambda';
import { Hono, type Context } from 'hono';
import { handle, type ApiGatewayRequestContextV2, type LambdaEvent } from 'hono/aws-lambda';
import { z, type ZodType } from 'zod';
import { actorFromClaims, type Actor } from './auth';
import { AppError, ValidationError } from './errors';
import { assertStaffMfa } from './mfa';
import { logger, metrics } from './observability';

// We only sit behind an HTTP API, which always sends payload format 2.0.
type HttpApiEvent = Extract<LambdaEvent, { requestContext: ApiGatewayRequestContextV2 }>;

export type Env = { Bindings: { event: LambdaEvent; lambdaContext: LambdaContext } };

/** A Hono app with consistent request logging and error responses. */
export function createApp(): Hono<Env> {
  const app = new Hono<Env>();

  app.use(async (c, next) => {
    const started = Date.now();
    await next();
    // Route pattern, not the raw path: paths can contain barcodes or ids we don't want to aggregate.
    logger.info('request', {
      method: c.req.method,
      route: c.req.routePath,
      status: c.res.status,
      durationMs: Date.now() - started,
    });
  });

  // Staff without two-step verification may not use the API (see mfa.ts).
  app.use(async (c, next) => {
    const actor = getActor(c);
    if (actor) await assertStaffMfa(actor);
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        { error: { code: error.code, message: error.message, details: error.details } },
        error.status,
      );
    }
    logger.error('unhandled error', { error });
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));

  return app;
}

/** The signed-in user, if the route has an authorizer and the token was valid. */
export function getActor(c: Context<Env>): Actor | undefined {
  const requestContext = c.env.event.requestContext as {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
  return actorFromClaims(requestContext.authorizer?.jwt?.claims);
}

/** Our ids are ULIDs. */
export const IdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid id');

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError(result.error.issues);
  return result.data;
}

export async function readJson(c: Context<Env>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ValidationError([{ message: 'Body must be valid JSON' }]);
  }
}

/** Wraps a Hono app as a Lambda handler with Powertools context and metric flushing. */
export function toLambdaHandler(app: Hono<Env>) {
  const honoHandler = handle(app);
  return async (event: HttpApiEvent, context: LambdaContext) => {
    logger.addContext(context);
    logger.appendKeys({ apiRequestId: event.requestContext.requestId });
    try {
      return await honoHandler(event, context);
    } finally {
      if (metrics.hasStoredMetrics()) metrics.publishStoredMetrics();
      logger.resetKeys();
    }
  };
}
