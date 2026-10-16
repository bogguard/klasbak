import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { ExportPage, ExportRecord } from '@library/shared';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { db, env } from '../lib/aws';
import { stripKeys, type Item } from '../lib/dynamo';
import { ValidationError } from '../lib/errors';

/*
 * The school's data, all of it, for the school to keep or take elsewhere (data processing
 * agreement, article 11). Read in pages of at most 1 MB (DynamoDB's own page size), so each
 * response stays well under the 6 MB a Lambda can return, however big the library is.
 * Only the school's records are included; internal items (counters, code pointers, audit
 * trail, anonymous statistics) are not.
 */

const CursorSchema = z.object({ pk: z.string(), sk: z.string() }).strict();

function encodeCursor(key: Item | undefined): string | undefined {
  return key ? Buffer.from(JSON.stringify(key)).toString('base64url') : undefined;
}

function decodeCursor(cursor: string | undefined): Item | undefined {
  if (!cursor) return undefined;
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new ValidationError([{ path: ['cursor'], message: 'Invalid cursor' }]);
  }
}

function classify(item: Item): ExportRecord | undefined {
  const pk = String(item.pk);
  const sk = String(item.sk);
  if (pk.startsWith('TITLE#') && sk === 'TITLE') return { kind: 'title', data: stripKeys(item) };
  if (pk.startsWith('TITLE#') && sk.startsWith('COPY#'))
    return { kind: 'copy', data: stripKeys(item) };
  if (pk.startsWith('READER#') && sk === 'READER') return { kind: 'reader', data: stripKeys(item) };
  if (pk.startsWith('READER#') && sk.startsWith('LOAN#'))
    return { kind: 'loan', data: stripKeys(item) };
  if (pk === 'SETTINGS' && sk === 'LIBRARY') return { kind: 'settings', data: stripKeys(item) };
  return undefined;
}

export async function exportPage(actor: Actor, cursor?: string): Promise<ExportPage> {
  const startKey = decodeCursor(cursor);
  // The first page marks the start of an export in the audit trail: it holds personal data.
  if (!startKey) await writeAudit({ entity: 'DATA#EXPORT', action: 'data.exported', actor });

  const page = await db.send(
    new ScanCommand({ TableName: env.tableName, ExclusiveStartKey: startKey }),
  );
  return {
    records: (page.Items ?? []).flatMap((item) => classify(item) ?? []),
    next: encodeCursor(page.LastEvaluatedKey),
  };
}
