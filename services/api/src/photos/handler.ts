import {
  CreateUploadSlotsRequestSchema,
  MovePhotoRequestSchema,
  PhotoAccessRequestSchema,
  PhotoDayInputSchema,
  PhotoImagesRequestSchema,
  RegisterPhotoRequestSchema,
  SetNoPhotoRequestSchema,
  UpdatePhotoDayRequestSchema,
  type Role,
} from '@klasbak/shared';
import type { Context } from 'hono';
import { ADMIN, PHOTOS, requireRole } from '../lib/auth';
import {
  createApp,
  getActor,
  IdSchema,
  parse,
  readJson,
  toLambdaHandler,
  type Env,
} from '../lib/http';
import * as photos from './service';

/*
 * Schoolfoto's (decision 040). The photographer uploads and sorts the photos; opening a photo
 * day to parents, consent and the download codes are for administrators: the school decides
 * who gets which photos, and a hired photographer never sees a code. Request logs hold route
 * patterns only, never codes or ids.
 */
export const app = createApp().basePath('/api/photos');

/** Role first: someone without rights learns nothing about what this school has switched on. */
async function authorize(c: Context<Env>, roles: readonly Role[] = PHOTOS) {
  const actor = requireRole(getActor(c), roles);
  await photos.assertPhotosEnabled();
  return actor;
}

const dayId = (c: Context<Env>) => parse(IdSchema, c.req.param('id'));

// Parents: no sign-in. The code is the permission (see the throttling in the template).
app.post('/public/access', async (c) => {
  const { code } = parse(PhotoAccessRequestSchema, await readJson(c));
  return c.json(await photos.accessPhotos(code));
});

app.get('/pupils', async (c) => {
  await authorize(c);
  return c.json(await photos.listPupils());
});

app.get('/days', async (c) => {
  await authorize(c);
  return c.json(await photos.listDays());
});

app.post('/days', async (c) => {
  const actor = await authorize(c, ADMIN);
  const body = parse(PhotoDayInputSchema, await readJson(c));
  return c.json(await photos.createDay(actor, body), 201);
});

app.get('/days/:id', async (c) => {
  await authorize(c);
  return c.json(await photos.getDayDetail(dayId(c)));
});

app.put('/days/:id', async (c) => {
  const actor = await authorize(c, ADMIN);
  const body = parse(UpdatePhotoDayRequestSchema, await readJson(c));
  return c.json(await photos.updateDay(actor, dayId(c), body));
});

app.delete('/days/:id', async (c) => {
  const actor = await authorize(c, ADMIN);
  await photos.deleteDay(actor, dayId(c));
  return c.body(null, 204);
});

app.post('/days/:id/uploads', async (c) => {
  await authorize(c);
  const { count } = parse(CreateUploadSlotsRequestSchema, await readJson(c));
  return c.json(await photos.createUploadSlots(dayId(c), count));
});

app.post('/days/:id/photos', async (c) => {
  await authorize(c);
  const body = parse(RegisterPhotoRequestSchema, await readJson(c));
  return c.json(await photos.registerPhoto(dayId(c), body), 201);
});

app.put('/days/:id/photos/:photoId', async (c) => {
  await authorize(c);
  const photoId = parse(IdSchema, c.req.param('photoId'));
  const { target } = parse(MovePhotoRequestSchema, await readJson(c));
  return c.json(await photos.movePhoto(dayId(c), photoId, target));
});

app.delete('/days/:id/photos/:photoId', async (c) => {
  const actor = await authorize(c);
  const photoId = parse(IdSchema, c.req.param('photoId'));
  await photos.deletePhoto(actor, dayId(c), photoId);
  return c.body(null, 204);
});

app.post('/days/:id/images', async (c) => {
  await authorize(c);
  const { photoIds } = parse(PhotoImagesRequestSchema, await readJson(c));
  return c.json(await photos.imageLinks(dayId(c), photoIds));
});

app.put('/days/:id/pupils/:readerId', async (c) => {
  const actor = await authorize(c, ADMIN);
  const readerId = parse(IdSchema, c.req.param('readerId'));
  const { noPhoto } = parse(SetNoPhotoRequestSchema, await readJson(c));
  await photos.setNoPhoto(actor, dayId(c), readerId, noPhoto);
  return c.body(null, 204);
});

app.post('/days/:id/codes', async (c) => {
  const actor = await authorize(c, ADMIN);
  return c.json(await photos.ensureCodes(actor, dayId(c)));
});

app.post('/days/:id/pupils/:readerId/code', async (c) => {
  const actor = await authorize(c, ADMIN);
  const readerId = parse(IdSchema, c.req.param('readerId'));
  return c.json(await photos.renewCode(actor, dayId(c), readerId));
});

export const handler = toLambdaHandler(app);
