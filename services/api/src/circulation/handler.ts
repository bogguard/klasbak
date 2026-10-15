import { ScanRequestSchema, UpdateSettingsRequestSchema } from '@library/shared';
import { requireRole, STAFF } from '../lib/auth';
import { createApp, getActor, parse, readJson, toLambdaHandler } from '../lib/http';
import * as circulation from './service';

export const app = createApp().basePath('/api/circulation');

app.post('/scan', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const { code, readerId } = parse(ScanRequestSchema, await readJson(c));
  return c.json(await circulation.scan(actor, code, readerId));
});

app.get('/loans', async (c) => {
  requireRole(getActor(c), STAFF);
  return c.json(await circulation.listLoans({ overdue: c.req.query('overdue') === 'true' }));
});

app.get('/settings', async (c) => {
  requireRole(getActor(c), STAFF);
  return c.json(await circulation.getSettings());
});

app.put('/settings', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const body = parse(UpdateSettingsRequestSchema, await readJson(c));
  return c.json(await circulation.updateSettings(actor, body.settings, body.version));
});

export const handler = toLambdaHandler(app);
