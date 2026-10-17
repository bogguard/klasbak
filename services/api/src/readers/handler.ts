import {
  DeactivateReadersRequestSchema,
  ImportReadersRequestSchema,
  ReaderInputSchema,
  UpdateReaderRequestSchema,
} from '@library/shared';
import { ADMIN, requireRole, STAFF } from '../lib/auth';
import { createApp, getActor, IdSchema, parse, readJson, toLambdaHandler } from '../lib/http';
import * as readers from './service';

/*
 * Readers are personal data (often children's). Staff only, and never logged by name:
 * request logs contain route patterns, not paths or bodies.
 */
export const app = createApp().basePath('/api/readers');

app.get('/', async (c) => {
  requireRole(getActor(c), STAFF);
  return c.json(await readers.listReaders());
});

app.post('/', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const input = parse(ReaderInputSchema, await readJson(c));
  return c.json(await readers.createReader(actor, input), 201);
});

app.post('/import', async (c) => {
  const actor = requireRole(getActor(c), ADMIN);
  const { rows } = parse(ImportReadersRequestSchema, await readJson(c));
  return c.json(await readers.importReaders(actor, rows));
});

// New school year: pupils missing from the imported list are set inactive (administrators).
app.post('/deactivate', async (c) => {
  const actor = requireRole(getActor(c), ADMIN);
  const { readerIds } = parse(DeactivateReadersRequestSchema, await readJson(c));
  return c.json(await readers.deactivateReaders(actor, readerIds));
});

app.get('/:id', async (c) => {
  requireRole(getActor(c), STAFF);
  return c.json(await readers.getReader(parse(IdSchema, c.req.param('id'))));
});

app.put('/:id', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const id = parse(IdSchema, c.req.param('id'));
  const body = parse(UpdateReaderRequestSchema, await readJson(c));
  return c.json(await readers.updateReader(actor, id, body.reader, body.version));
});

// Right to erasure: removes the reader, their card number and their reading history.
app.delete('/:id', async (c) => {
  const actor = requireRole(getActor(c), ADMIN);
  await readers.deleteReader(actor, parse(IdSchema, c.req.param('id')));
  return c.body(null, 204);
});

export const handler = toLambdaHandler(app);
