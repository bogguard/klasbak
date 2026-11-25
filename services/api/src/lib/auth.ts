import {
  EQUIPMENT_ROLES,
  MANAGEMENT_ROLES,
  PHOTO_ROLES,
  ROLES,
  STAFF_ROLES,
  type Role,
} from '@klasbak/shared';
import { ForbiddenError, UnauthorizedError } from './errors';

export { ROLES, type Role };

/** `username` is what Cognito's admin APIs need; `userId` (sub) never changes. */
export type Actor = { userId: string; username?: string; roles: Role[] };

export const STAFF = STAFF_ROLES;
export const EQUIPMENT = EQUIPMENT_ROLES;
export const PHOTOS = PHOTO_ROLES;
/** Every staff role: for what each management screen needs, like which modules are on. */
export const MANAGEMENT = MANAGEMENT_ROLES;

/**
 * Tasks with wide impact: library settings (loan rules, retention), bulk imports, deleting a
 * reader with their history, and staff accounts. Daily work stays open to librarians.
 */
export const ADMIN: readonly Role[] = ['admin'];

/**
 * Builds the actor from JWT claims that the API Gateway authorizer already verified.
 * HTTP APIs flatten array claims into a string like "[admin librarian]", so both forms are accepted.
 */
export function actorFromClaims(claims: Record<string, unknown> | undefined): Actor | undefined {
  const userId = claims?.sub;
  if (typeof userId !== 'string') return undefined;
  const username = claims?.username ?? claims?.['cognito:username'];
  return {
    userId,
    username: typeof username === 'string' ? username : undefined,
    roles: parseGroups(claims?.['cognito:groups']),
  };
}

export function requireRole(actor: Actor | undefined, allowed: readonly Role[]): Actor {
  if (!actor) throw new UnauthorizedError();
  if (!actor.roles.some((role) => allowed.includes(role))) throw new ForbiddenError();
  return actor;
}

function parseGroups(raw: unknown): Role[] {
  const groups = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.replace(/^\[|\]$/g, '').split(/[\s,]+/)
      : [];
  return groups.filter((g): g is Role => ROLES.includes(g as Role));
}
