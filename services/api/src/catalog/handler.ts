import {
  AddExchangeBooksRequestSchema,
  CodeSchema,
  CopyInputSchema,
  CreateExchangeRequestSchema,
  CoverUploadRequestSchema,
  CreateTitleRequestSchema,
  LabelLookupRequestSchema,
  MarkLabelsPrintedRequestSchema,
  UpdateCopyRequestSchema,
  UpdateTitleRequestSchema,
  isValidIsbn,
  toIsbn13,
} from '@library/shared';
import { requireRole, STAFF } from '../lib/auth';
import { ValidationError } from '../lib/errors';
import { createApp, getActor, IdSchema, parse, readJson, toLambdaHandler } from '../lib/http';
import * as exchanges from '../exchange/service';
import * as catalog from './service';

export const app = createApp().basePath('/api/catalog');

// Public: the online catalogue (no authorizer on this route in the SAM template).
app.get('/public/titles/:id', async (c) => {
  const title = await catalog.getPublicTitle(parse(IdSchema, c.req.param('id')));
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(title);
});

// Staff only from here on. The authorizer verified the token; we check the role.
app.get('/titles/:id', async (c) => {
  requireRole(getActor(c), STAFF);
  return c.json(await catalog.getTitle(parse(IdSchema, c.req.param('id'))));
});

app.post('/titles', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const body = parse(CreateTitleRequestSchema, await readJson(c));
  return c.json(await catalog.createTitle(actor, body.title, body.coverUrl), 201);
});

app.put('/titles/:id', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const id = parse(IdSchema, c.req.param('id'));
  const body = parse(UpdateTitleRequestSchema, await readJson(c));
  return c.json(await catalog.updateTitle(actor, id, body.title, body.version));
});

app.put('/titles/:id/cover', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const id = parse(IdSchema, c.req.param('id'));
  const { image } = parse(CoverUploadRequestSchema, await readJson(c));
  return c.json(await catalog.uploadCover(actor, id, Buffer.from(image, 'base64')));
});

app.delete('/titles/:id/cover', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  await catalog.removeCover(actor, parse(IdSchema, c.req.param('id')));
  return c.body(null, 204);
});

app.post('/titles/:id/copies', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const id = parse(IdSchema, c.req.param('id'));
  const input = parse(CopyInputSchema, await readJson(c));
  return c.json(await catalog.addCopy(actor, id, input), 201);
});

app.get('/labels/pending', async (c) => {
  requireRole(getActor(c), STAFF);
  return c.json(await catalog.pendingLabels());
});

app.post('/labels/printed', async (c) => {
  requireRole(getActor(c), STAFF);
  const { codes } = parse(MarkLabelsPrintedRequestSchema, await readJson(c));
  return c.json({ marked: await catalog.markLabelsPrinted(codes) });
});

// POST because a sheet can hold hundreds of codes, too many for a URL.
app.post('/copies/labels', async (c) => {
  requireRole(getActor(c), STAFF);
  const { codes } = parse(LabelLookupRequestSchema, await readJson(c));
  return c.json(await catalog.getCopyLabels(codes));
});

app.get('/copies/:barcode', async (c) => {
  requireRole(getActor(c), STAFF);
  return c.json(await catalog.getCopyByBarcode(parse(CodeSchema, c.req.param('barcode'))));
});

app.patch('/copies/:barcode', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const changes = parse(UpdateCopyRequestSchema, await readJson(c));
  return c.json(
    await catalog.updateCopy(actor, parse(CodeSchema, c.req.param('barcode')), changes),
  );
});

// Exchange collections from the public library (decision 031); in the catalogue function
// because they add and remove titles and copies.
app.get('/exchanges', async (c) => {
  requireRole(getActor(c), STAFF);
  return c.json(await exchanges.listExchanges());
});

app.post('/exchanges', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const input = parse(CreateExchangeRequestSchema, await readJson(c));
  return c.json(await exchanges.createExchange(actor, input), 201);
});

app.get('/exchanges/:id', async (c) => {
  requireRole(getActor(c), STAFF);
  return c.json(await exchanges.getExchange(parse(IdSchema, c.req.param('id'))));
});

app.post('/exchanges/:id/books', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const { books } = parse(AddExchangeBooksRequestSchema, await readJson(c));
  return c.json(await exchanges.addExchangeBooks(actor, parse(IdSchema, c.req.param('id')), books));
});

app.post('/exchanges/:id/return', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  return c.json(await exchanges.returnExchange(actor, parse(IdSchema, c.req.param('id'))));
});

app.get('/isbn/:isbn', async (c) => {
  requireRole(getActor(c), STAFF);
  const isbn = c.req.param('isbn');
  if (!isValidIsbn(isbn)) throw new ValidationError([{ path: ['isbn'], message: 'Invalid ISBN' }]);
  return c.json(await catalog.findByIsbn(toIsbn13(isbn)));
});

export const handler = toLambdaHandler(app);
