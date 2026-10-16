import { CreateStaffRequestSchema, UpdateStaffRequestSchema } from '@library/shared';
import { z } from 'zod';
import { requireRole } from '../lib/auth';
import { createApp, getActor, parse, readJson, toLambdaHandler } from '../lib/http';
import * as staff from './service';

const UsernameSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, 'Invalid username');

// Managing staff accounts is for admins only.
export const app = createApp().basePath('/api/staff');

app.get('/', async (c) => {
  requireRole(getActor(c), ['admin']);
  return c.json(await staff.listStaff());
});

app.post('/', async (c) => {
  const actor = requireRole(getActor(c), ['admin']);
  const input = parse(CreateStaffRequestSchema, await readJson(c));
  return c.json(await staff.createStaff(actor, input), 201);
});

app.patch('/:username', async (c) => {
  const actor = requireRole(getActor(c), ['admin']);
  const username = parse(UsernameSchema, c.req.param('username'));
  const changes = parse(UpdateStaffRequestSchema, await readJson(c));
  return c.json(await staff.updateStaff(actor, username, changes));
});

app.post('/:username/password', async (c) => {
  const actor = requireRole(getActor(c), ['admin']);
  return c.json(await staff.resetPassword(actor, parse(UsernameSchema, c.req.param('username'))));
});

app.post('/:username/mfa-reset', async (c) => {
  const actor = requireRole(getActor(c), ['admin']);
  await staff.resetMfa(actor, parse(UsernameSchema, c.req.param('username')));
  return c.body(null, 204);
});

export const handler = toLambdaHandler(app);
