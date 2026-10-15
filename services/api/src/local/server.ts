import './env';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { LambdaEvent } from 'hono/aws-lambda';
import { ROLES, type Role } from '../lib/auth';
import { app as catalog } from '../catalog/handler';
import { logger } from '../lib/observability';
import { rebuildSearchIndex } from '../search-indexer/rebuild';
import { ensureLocalTable } from './table';

/*
 * Local development server. It runs the same Hono apps as the Lambdas and stands in for
 * what AWS does around them:
 *   - API Gateway's JWT authorizer → a dev sign-in: "Authorization: Dev <role>"
 *   - the DynamoDB stream + indexer Lambda → rebuild the search index after each change
 *   - S3 + CloudFront → serve /search, /covers and /config.json from disk
 * It is never deployed: SAM only builds the Lambda handlers.
 */

const PORT = Number(process.env.PORT ?? 3000);
const publicDir = process.env.LOCAL_PUBLIC_DIR ?? '.local/public';

function fakeEvent(authorization: string | undefined): { event: LambdaEvent } {
  const role = authorization?.match(/^Dev (\w+)$/)?.[1] as Role | undefined;
  const authorizer =
    role && ROLES.includes(role)
      ? { jwt: { claims: { sub: `dev-${role}`, 'cognito:groups': `[${role}]` } } }
      : undefined;
  return {
    event: {
      requestContext: { requestId: crypto.randomUUID(), authorizer },
    } as unknown as LambdaEvent,
  };
}

await ensureLocalTable();
await rebuildSearchIndex();

const server = new Hono();

server.get('/config.json', (c) => c.json({ libraryName: 'Bibliotheek (lokaal)', devAuth: true }));
server.use('/search/*', serveStatic({ root: publicDir }));
server.use('/covers/*', serveStatic({ root: publicDir }));

server.all('/api/catalog/*', async (c) => {
  const response = await catalog.fetch(c.req.raw, fakeEvent(c.req.header('authorization')));
  if (c.req.method !== 'GET' && response.ok) await rebuildSearchIndex();
  return response;
});

serve({ fetch: server.fetch, port: PORT }, ({ port }) => {
  logger.info(`Local API on http://localhost:${port}`);
});
