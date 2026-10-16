import {
  LogoUploadRequestSchema,
  RenewRequestSchema,
  UpdateBrandingRequestSchema,
  ScanRequestSchema,
  UpdateSettingsRequestSchema,
} from '@library/shared';
import { ADMIN, requireRole, STAFF } from '../lib/auth';
import { createApp, getActor, parse, readJson, toLambdaHandler } from '../lib/http';
import * as branding from '../branding/service';
import * as circulation from './service';

export const app = createApp().basePath('/api/circulation');

app.post('/scan', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const { code, readerId } = parse(ScanRequestSchema, await readJson(c));
  return c.json(await circulation.scan(actor, code, readerId));
});

app.post('/renew', async (c) => {
  const actor = requireRole(getActor(c), STAFF);
  const { readerId, loanId } = parse(RenewRequestSchema, await readJson(c));
  return c.json(await circulation.renewLoan(actor, readerId, loanId));
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
  const actor = requireRole(getActor(c), ADMIN);
  const body = parse(UpdateSettingsRequestSchema, await readJson(c));
  return c.json(await circulation.updateSettings(actor, body.settings, body.version));
});

// The library's name and logo (administrators). Read by the website from a public file.
app.put('/branding', async (c) => {
  const actor = requireRole(getActor(c), ADMIN);
  const { libraryName } = parse(UpdateBrandingRequestSchema, await readJson(c));
  return c.json(await branding.updateLibraryName(actor, libraryName));
});

app.put('/branding/logo', async (c) => {
  const actor = requireRole(getActor(c), ADMIN);
  const { image } = parse(LogoUploadRequestSchema, await readJson(c));
  return c.json(await branding.uploadLogo(actor, Buffer.from(image, 'base64')));
});

app.delete('/branding/logo', async (c) => {
  const actor = requireRole(getActor(c), ADMIN);
  return c.json(await branding.removeLogo(actor));
});

export const handler = toLambdaHandler(app);
