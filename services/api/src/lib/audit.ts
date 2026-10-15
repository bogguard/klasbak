import { ulid } from 'ulid';
import type { Actor } from './auth';

const RETENTION_DAYS = 730;

export type AuditEntry = {
  entity: `${string}#${string}`;
  action: string;
  actor: Actor;
  /** Field names that changed; never values, so no personal data ends up in the trail. */
  changedFields?: string[];
};

/** A DynamoDB item to include in the same transaction as the change it records. */
export function auditItem({ entity, action, actor, changedFields }: AuditEntry, now: Date) {
  return {
    pk: `AUDIT#${entity}`,
    sk: `${now.toISOString()}#${ulid()}`,
    action,
    actorId: actor.userId,
    changedFields,
    at: now.toISOString(),
    expiresAt: Math.floor(now.getTime() / 1000) + RETENTION_DAYS * 86_400,
  };
}
