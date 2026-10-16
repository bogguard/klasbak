import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { BRANDING_PATH, LOGO_MAX_BYTES, type Branding } from '@library/shared';
import { ulid } from 'ulid';
import { writeAudit } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { db, env } from '../lib/aws';
import { getItem } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { detectImageType, IMAGE_EXTENSIONS } from '../lib/images';
import { brandingKey } from '../lib/keys';
import { logger } from '../lib/observability';
import { deletePublicFile, putPublicFile } from '../lib/public-files';

/*
 * The library's own name and logo, set by an administrator. Stored in the table and published
 * as a small public file, so every page can show them without asking the API.
 */

export async function getBranding(): Promise<Branding> {
  return (await getItem<Branding>(brandingKey)) ?? {};
}

async function save(branding: Branding): Promise<Branding> {
  await db.send(
    new PutCommand({ TableName: env.tableName, Item: { ...brandingKey, ...branding } }),
  );
  const published: Branding = { libraryName: branding.libraryName, logoKey: branding.logoKey };
  // no-cache: a new name or logo shows up on the next page load.
  await putPublicFile(BRANDING_PATH, JSON.stringify(published), 'application/json', 'no-cache');
  return published;
}

export async function updateLibraryName(actor: Actor, libraryName: string): Promise<Branding> {
  const branding = await save({ ...(await getBranding()), libraryName });
  await writeAudit({ entity: 'SETTINGS#BRANDING', action: 'branding.nameChanged', actor });
  return branding;
}

export async function uploadLogo(actor: Actor, image: Uint8Array): Promise<Branding> {
  const type = detectImageType(image);
  if (!type || image.byteLength > LOGO_MAX_BYTES) {
    throw new AppError(400, 'INVALID_IMAGE', 'Upload a PNG, JPEG or WebP image of at most 1 MB');
  }
  const current = await getBranding();
  // A new name each time, so caches never show the old logo.
  const logoKey = `branding/logo-${ulid().toLowerCase()}.${IMAGE_EXTENSIONS[type]}`;
  await putPublicFile(logoKey, image, type, 'public, max-age=31536000, immutable');
  const branding = await save({ ...current, logoKey });
  await removeFile(current.logoKey);
  await writeAudit({ entity: 'SETTINGS#BRANDING', action: 'branding.logoChanged', actor });
  return branding;
}

export async function removeLogo(actor: Actor): Promise<Branding> {
  const current = await getBranding();
  const branding = await save({ ...current, logoKey: undefined });
  await removeFile(current.logoKey);
  await writeAudit({ entity: 'SETTINGS#BRANDING', action: 'branding.logoRemoved', actor });
  return branding;
}

async function removeFile(key: string | undefined) {
  if (!key) return;
  try {
    await deletePublicFile(key);
  } catch (error) {
    logger.warn('old logo delete failed', { error });
  }
}
