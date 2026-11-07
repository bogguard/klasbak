export const ROLES = ['admin', 'librarian', 'equipment', 'teacher', 'reader'] as const;
export type Role = (typeof ROLES)[number];

/** Staff who manage the collection. */
export const STAFF_ROLES: readonly Role[] = ['admin', 'librarian'];

/** Staff who manage equipment: the ICT coordinator needs no rights in the library. */
export const EQUIPMENT_ROLES: readonly Role[] = [...STAFF_ROLES, 'equipment'];

/** Anyone with a management screen: they see pupils' data, so they need two-step verification. */
export function isStaff(roles: readonly Role[]): boolean {
  return roles.some((role) => EQUIPMENT_ROLES.includes(role));
}

export function isLibraryStaff(roles: readonly Role[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}
