import {
  LogoUploadRequestSchema,
  MyBooksRequestSchema,
  StatisticsQuerySchema,
  RenewRequestSchema,
  UpdateBrandingRequestSchema,
  UpdateVocabularyRequestSchema,
  ScanRequestSchema,
  UpdateSettingsRequestSchema,
} from '@library/shared';
import { ADMIN, requireRole, STAFF } from '../lib/auth';
import { createApp, getActor, parse, readJson, toLambdaHandler } from '../lib/http';
import * as branding from '../branding/service';
import { exportPage } from '../export/service';
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

// "Mijn boeken": runs on a library device signed in by staff, where pupils scan their card.
app.post('/my-books', async (c) => {
  requireRole(getActor(c), STAFF);
  const { code } = parse(MyBooksRequestSchema, await readJson(c));
  return c.json(await circulation.myBooks(code));
});

app.get('/statistics', async (c) => {
  requireRole(getActor(c), STAFF);
  const { from, to } = parse(StatisticsQuerySchema, {
    from: c.req.query('from'),
    to: c.req.query('to'),
  });
  return c.json(await circulation.statistics(from, to));
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

app.put('/branding/vocabulary', async (c) => {
  const actor = requireRole(getActor(c), ADMIN);
  const { kind, terms } = parse(UpdateVocabularyRequestSchema, await readJson(c));
  return c.json(await branding.updateVocabulary(actor, kind, terms));
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

// Everything the school owns, page by page (administrators; see export/service.ts).
app.get('/export', async (c) => {
  const actor = requireRole(getActor(c), ADMIN);
  return c.json(await exportPage(actor, c.req.query('cursor')));
});

export const handler = toLambdaHandler(app);
