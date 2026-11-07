import {
  AssignAssetRequestSchema,
  CreateAssetsRequestSchema,
  MarkAssetLabelsPrintedRequestSchema,
  ReturnAssetRequestSchema,
  UpdateAssetRequestSchema,
} from '@klasbak/shared';
import type { Context } from 'hono';
import { EQUIPMENT, requireRole } from '../lib/auth';
import {
  createApp,
  getActor,
  IdSchema,
  parse,
  readJson,
  toLambdaHandler,
  type Env,
} from '../lib/http';
import * as equipment from './service';

/*
 * Materiaal (decision 039). Open to the equipment role, without rights in the library. Who has
 * which item is personal data: request logs hold route patterns, never paths or bodies.
 */
export const app = createApp().basePath('/api/equipment');

/** Role first: someone without rights learns nothing about what this school has switched on. */
async function authorize(c: Context<Env>) {
  const actor = requireRole(getActor(c), EQUIPMENT);
  await equipment.assertEquipmentEnabled();
  return actor;
}

app.get('/assets', async (c) => {
  await authorize(c);
  return c.json(await equipment.listAssets());
});

app.post('/assets', async (c) => {
  const actor = await authorize(c);
  const body = parse(CreateAssetsRequestSchema, await readJson(c));
  return c.json(await equipment.createAssets(actor, body), 201);
});

app.post('/assets/labels/printed', async (c) => {
  await authorize(c);
  const { ids } = parse(MarkAssetLabelsPrintedRequestSchema, await readJson(c));
  await equipment.markLabelsPrinted(ids.map((id) => parse(IdSchema, id)));
  return c.body(null, 204);
});

app.get('/assets/:id', async (c) => {
  await authorize(c);
  return c.json(await equipment.getAssetDetail(parse(IdSchema, c.req.param('id'))));
});

app.put('/assets/:id', async (c) => {
  const actor = await authorize(c);
  const id = parse(IdSchema, c.req.param('id'));
  const body = parse(UpdateAssetRequestSchema, await readJson(c));
  return c.json(await equipment.updateAsset(actor, id, body.asset, body.version));
});

app.post('/assets/:id/assign', async (c) => {
  const actor = await authorize(c);
  const id = parse(IdSchema, c.req.param('id'));
  const { readerId, dueDate } = parse(AssignAssetRequestSchema, await readJson(c));
  return c.json(await equipment.assignAsset(actor, id, parse(IdSchema, readerId), dueDate));
});

app.post('/assets/:id/return', async (c) => {
  const actor = await authorize(c);
  const id = parse(IdSchema, c.req.param('id'));
  const { status } = parse(ReturnAssetRequestSchema, await readJson(c));
  return c.json(await equipment.returnAsset(actor, id, status));
});

app.get('/recipients', async (c) => {
  await authorize(c);
  return c.json(await equipment.listRecipients());
});

export const handler = toLambdaHandler(app);
