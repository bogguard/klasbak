import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { removeLogo, updateLibraryName, uploadLogo } from './service';

const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const admin = { userId: 'a', roles: ['admin' as const] };
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const published = () =>
  s3
    .commandCalls(PutObjectCommand)
    .map((c) => c.args[0].input)
    .find((input) => input.Key === 'branding/branding.json');

beforeEach(() => {
  ddb.reset();
  s3.reset();
  ddb.on(PutCommand).resolves({});
  s3.on(PutObjectCommand).resolves({});
  s3.on(DeleteObjectCommand).resolves({});
});

describe('branding', () => {
  it('publishes the library name for the website, without caching', async () => {
    ddb.on(GetCommand).resolves({ Item: { logoKey: 'branding/logo-1.png' } });

    await updateLibraryName(admin, 'Bib De Regenboog');

    expect(published()?.CacheControl).toBe('no-cache');
    expect(JSON.parse(String(published()?.Body))).toEqual({
      libraryName: 'Bib De Regenboog',
      logoKey: 'branding/logo-1.png',
    });
  });

  it('stores a new logo under a new name and deletes the old one', async () => {
    ddb.on(GetCommand).resolves({ Item: { libraryName: 'Bib', logoKey: 'branding/logo-old.png' } });

    const branding = await uploadLogo(admin, png);

    expect(branding.logoKey).toMatch(/^branding\/logo-[0-9a-z]{26}\.png$/);
    expect(s3.commandCalls(DeleteObjectCommand)[0]?.args[0].input.Key).toBe(
      'branding/logo-old.png',
    );
  });

  it('refuses anything that is not a PNG, JPEG or WebP image (e.g. SVG)', async () => {
    ddb.on(GetCommand).resolves({});
    const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    await expect(uploadLogo(admin, svg)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it('removes the logo', async () => {
    ddb.on(GetCommand).resolves({ Item: { libraryName: 'Bib', logoKey: 'branding/logo-old.png' } });
    const branding = await removeLogo(admin);
    expect(branding).toEqual({ libraryName: 'Bib', logoKey: undefined });
  });
});
