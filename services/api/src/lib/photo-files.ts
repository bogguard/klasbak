import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { UploadForm } from '@klasbak/shared';
import { mkdir, open, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { env, s3 } from './aws';

/*
 * School photos live in their own private bucket (decision 040). Browsers upload and download
 * straight from S3 with short-lived signed links: photos are too big for Lambda (6 MB), and the
 * link is the permission, so nothing else about the bucket is public.
 *
 * In local development (LOCAL_PHOTOS_DIR) the files go to a folder that the local server
 * serves at /local-photos, with the same shapes of links.
 */

const UPLOAD_LINK_SECONDS = 15 * 60;
const DOWNLOAD_LINK_SECONDS = 60 * 60;
const JPEG = 'image/jpeg';

const localDir = () => process.env.LOCAL_PHOTOS_DIR;

/** The original and the screen version of a photo. */
export function photoFileKeys(dayId: string, photoId: string) {
  return { original: `${dayId}/${photoId}.jpg`, small: `${dayId}/${photoId}.small.jpg` };
}

/** A form the browser posts one JPEG of at most `maxBytes` to, under exactly this key. */
export async function createUploadForm(key: string, maxBytes: number): Promise<UploadForm> {
  if (localDir()) return { url: '/local-photos', fields: { key, 'Content-Type': JPEG } };
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: env.photosBucket,
    Key: key,
    Conditions: [
      ['content-length-range', 1, maxBytes],
      ['eq', '$Content-Type', JPEG],
    ],
    Fields: { 'Content-Type': JPEG },
    Expires: UPLOAD_LINK_SECONDS,
  });
  return { url, fields };
}

/** The first bytes and the size of an uploaded file, or undefined when it isn't there. */
export async function readFileStart(
  key: string,
  length = 12,
): Promise<{ bytes: Uint8Array; size: number } | undefined> {
  const dir = localDir();
  if (dir) {
    const path = localPath(dir, key);
    try {
      const file = await open(path);
      try {
        const bytes = new Uint8Array(length);
        const { bytesRead } = await file.read(bytes, 0, length, 0);
        return { bytes: bytes.subarray(0, bytesRead), size: (await stat(path)).size };
      } finally {
        await file.close();
      }
    } catch {
      return undefined;
    }
  }
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: env.photosBucket,
        Key: key,
        Range: `bytes=0-${length - 1}`,
      }),
    );
    const bytes = await result.Body?.transformToByteArray();
    // "bytes 0-11/4831234": the part after the slash is the whole file.
    const size = Number(result.ContentRange?.split('/')[1] ?? result.ContentLength);
    return bytes ? { bytes, size } : undefined;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/**
 * A link that works for an hour. With `downloadAs`, the browser saves the file under that
 * name instead of showing it.
 */
export async function createFileLink(key: string, downloadAs?: string): Promise<string> {
  if (localDir()) {
    const query = downloadAs ? `?download=${encodeURIComponent(downloadAs)}` : '';
    return `/local-photos/${key}${query}`;
  }
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.photosBucket,
      Key: key,
      ResponseContentDisposition: downloadAs
        ? `attachment; filename="${downloadAs.replace(/[^\w.-]/g, '_')}"`
        : undefined,
    }),
    { expiresIn: DOWNLOAD_LINK_SECONDS },
  );
}

export async function deleteFiles(keys: string[]): Promise<void> {
  const dir = localDir();
  if (dir) {
    await Promise.all(keys.map((key) => rm(localPath(dir, key), { force: true })));
    return;
  }
  for (let start = 0; start < keys.length; start += 1000) {
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: env.photosBucket,
        Delete: { Objects: keys.slice(start, start + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (result.Errors?.length) throw new Error(`Could not delete ${result.Errors.length} photos`);
  }
}

/** Deletes every file of a photo day, including uploads that were never registered. */
export async function deleteFolder(dayId: string): Promise<number> {
  const dir = localDir();
  if (dir) {
    const folder = localPath(dir, dayId);
    const count = (await readdir(folder).catch(() => [])).length;
    await rm(folder, { recursive: true, force: true });
    return count;
  }
  let deleted = 0;
  let token: string | undefined;
  do {
    const page: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.photosBucket,
        Prefix: `${dayId}/`,
        ContinuationToken: token,
      }),
    );
    const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));
    if (keys.length > 0) await deleteFiles(keys);
    deleted += keys.length;
    token = page.NextContinuationToken;
  } while (token);
  return deleted;
}

/** Local only: where a key lives on disk, refusing keys that would leave the folder. */
export function localPath(dir: string, key: string): string {
  const relative = normalize(key);
  if (relative.startsWith('..') || relative.startsWith('/')) throw new Error('Invalid key');
  return join(dir, relative);
}

export async function writeLocalFile(dir: string, key: string, bytes: Uint8Array): Promise<void> {
  const path = localPath(dir, key);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, bytes);
}

function isMissing(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  return name === 'NoSuchKey' || name === 'NotFound' || name === 'InvalidRange';
}
