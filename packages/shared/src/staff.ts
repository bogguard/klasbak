import { z } from 'zod';
import { text } from './catalog';

export const STAFF_MEMBER_ROLES = ['admin', 'librarian'] as const;
export const StaffRoleSchema = z.enum(STAFF_MEMBER_ROLES);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

export const CreateStaffRequestSchema = z
  .object({
    /** What they type to sign in. Lowercase so "Juf.An" and "juf.an" can't both exist. */
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    name: text(100),
    email: z.email().max(254).optional(),
    role: StaffRoleSchema,
  })
  .strict();
export type CreateStaffRequest = z.infer<typeof CreateStaffRequestSchema>;

export const UpdateStaffRequestSchema = z
  .object({ role: StaffRoleSchema.optional(), enabled: z.boolean().optional() })
  .strict();

export type StaffMember = {
  username: string;
  name?: string;
  email?: string;
  role: StaffRole;
  /** "invited" until they signed in and chose their own password. */
  status: 'invited' | 'active';
  enabled: boolean;
  mfaEnabled: boolean;
  createdAt?: string;
};

/** Returned once, when an account is created or a password is reset. */
export type TemporaryCredentials = { username: string; temporaryPassword: string };
