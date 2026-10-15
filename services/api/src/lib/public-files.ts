import { PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env, s3 } from './aws';

/**
 * Publishes a file that the website serves (covers, search index).
 * On AWS it goes to the web bucket; in local development to a folder the local server serves.
 */
export async function putPublicFile(
  key: string,
  body: string | Uint8Array,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  const localDir = process.env.LOCAL_PUBLIC_DIR;
  if (localDir) {
    const path = join(localDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return;
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: env.webBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}
