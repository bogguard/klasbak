import type { StaffMember } from '@library/shared';
import { ConflictError } from '../lib/errors';
import type { StaffDirectory } from './directory';

/*
 * Local development only: staff accounts in memory, lost when the local server restarts.
 * Starts with the dev sign-in accounts so the list isn't empty.
 */
const members = new Map<string, StaffMember>(
  (['admin', 'librarian'] as const).map((role) => [
    `dev-${role}`,
    {
      username: `dev-${role}`,
      name: `Dev ${role}`,
      role,
      status: 'active',
      enabled: true,
      mfaEnabled: true,
    },
  ]),
);

function existing(username: string): StaffMember {
  const member = members.get(username);
  if (!member) throw new Error(`Unknown staff member ${username}`);
  return member;
}

export const memoryDirectory: StaffDirectory = {
  list: async () => [...members.values()],
  get: async (username) => members.get(username),
  async create(input) {
    if (members.has(input.username)) {
      throw new ConflictError('USERNAME_TAKEN', 'This username is already in use');
    }
    const member: StaffMember = {
      ...input,
      status: 'invited',
      enabled: true,
      mfaEnabled: false,
      createdAt: new Date().toISOString(),
    };
    members.set(input.username, member);
    return member;
  },
  async setRole(username, role) {
    existing(username).role = role;
  },
  async setEnabled(username, enabled) {
    existing(username).enabled = enabled;
  },
  async setTemporaryPassword(username) {
    existing(username).status = 'invited';
  },
  async resetMfa(username) {
    existing(username).mfaEnabled = false;
  },
};
