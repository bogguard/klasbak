export const ROLES = ['admin', 'librarian', 'teacher', 'reader'] as const;
export type Role = (typeof ROLES)[number];

/** Staff who manage the collection. */
export const STAFF_ROLES: readonly Role[] = ['admin', 'librarian'];

export function isStaff(roles: readonly Role[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}
