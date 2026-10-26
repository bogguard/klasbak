import type {
  CreateStaffRequest,
  StaffMember,
  StaffRole,
  TemporaryCredentials,
} from '@klasbak/shared';
import { randomInt } from 'node:crypto';
import { writeAudit } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { ConflictError, NotFoundError } from '../lib/errors';
import { staffDirectory } from './directory';

/*
 * Staff accounts (admins and librarians), managed by admins. Two safety rules:
 * nobody changes their own account here (no accidental self-lockout), and there is always
 * at least one active admin left.
 */

// No look-alikes (0/O, 1/l/I), so it can be read out or copied from paper without mistakes.
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Like "Kx7m-Pq4t-Wz9a": strong enough, and easy to pass on. Valid 14 days (user pool setting). */
export function temporaryPassword(): string {
  const groups = Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join(
      '',
    ),
  );
  return groups.join('-');
}

export async function listStaff(): Promise<StaffMember[]> {
  const members = await staffDirectory().list();
  return members.sort((a, b) => (a.name ?? a.username).localeCompare(b.name ?? b.username, 'nl'));
}

export async function createStaff(
  actor: Actor,
  input: CreateStaffRequest,
): Promise<{ member: StaffMember; credentials: TemporaryCredentials }> {
  const password = temporaryPassword();
  const member = await staffDirectory().create(input, password);
  await writeAudit({ entity: `STAFF#${member.username}`, action: 'staff.created', actor });
  return { member, credentials: { username: member.username, temporaryPassword: password } };
}

export async function updateStaff(
  actor: Actor,
  username: string,
  changes: { role?: StaffRole; enabled?: boolean },
): Promise<StaffMember> {
  const member = await otherStaffMember(actor, username);
  const losesAdmin =
    member.role === 'admin' &&
    member.enabled &&
    ((changes.role && changes.role !== 'admin') || changes.enabled === false);
  if (losesAdmin) await assertAnotherActiveAdmin(username);

  const directory = staffDirectory();
  if (changes.role && changes.role !== member.role) await directory.setRole(username, changes.role);
  if (changes.enabled !== undefined && changes.enabled !== member.enabled) {
    await directory.setEnabled(username, changes.enabled);
  }
  await writeAudit({
    entity: `STAFF#${username}`,
    action: 'staff.updated',
    actor,
    changedFields: Object.keys(changes),
  });
  return { ...member, ...changes };
}

export async function resetPassword(actor: Actor, username: string): Promise<TemporaryCredentials> {
  await otherStaffMember(actor, username);
  const password = temporaryPassword();
  await staffDirectory().setTemporaryPassword(username, password);
  await writeAudit({ entity: `STAFF#${username}`, action: 'staff.passwordReset', actor });
  return { username, temporaryPassword: password };
}

/** For a lost or new phone: they set up two-step verification again at the next sign-in. */
export async function resetMfa(actor: Actor, username: string): Promise<void> {
  await otherStaffMember(actor, username);
  await staffDirectory().resetMfa(username);
  await writeAudit({ entity: `STAFF#${username}`, action: 'staff.mfaReset', actor });
}

async function otherStaffMember(actor: Actor, username: string): Promise<StaffMember> {
  if (actor.username === username) {
    throw new ConflictError('CANNOT_CHANGE_SELF', 'You cannot change your own account here');
  }
  const member = await staffDirectory().get(username);
  if (!member) throw new NotFoundError('Staff member');
  return member;
}

async function assertAnotherActiveAdmin(username: string): Promise<void> {
  const admins = (await staffDirectory().list()).filter(
    (m) => m.role === 'admin' && m.enabled && m.username !== username,
  );
  if (admins.length === 0) {
    throw new ConflictError('LAST_ADMIN', 'There must always be at least one active admin');
  }
}
