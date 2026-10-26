import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminSetUserMFAPreferenceCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  UserNotFoundException,
  UsernameExistsException,
  type AttributeType,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { STAFF_MEMBER_ROLES, type StaffMember, type StaffRole } from '@klasbak/shared';
import { ConflictError } from '../lib/errors';
import { tracer } from '../lib/observability';
import type { StaffDirectory } from './directory';

let client: CognitoIdentityProviderClient | undefined;
const cognito = () => (client ??= tracer.captureAWSv3Client(new CognitoIdentityProviderClient({})));
const pool = () => process.env.USER_POOL_ID;

const attribute = (attributes: AttributeType[] | undefined, name: string) =>
  attributes?.find((a) => a.Name === name)?.Value;

async function mfaEnabled(username: string): Promise<boolean> {
  const user = await cognito().send(
    new AdminGetUserCommand({ UserPoolId: pool(), Username: username }),
  );
  return Boolean(user.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA'));
}

function toMember(user: UserType, role: StaffRole, mfa: boolean): StaffMember {
  return {
    username: user.Username ?? '',
    name: attribute(user.Attributes, 'name'),
    email: attribute(user.Attributes, 'email'),
    role,
    status: user.UserStatus === 'FORCE_CHANGE_PASSWORD' ? 'invited' : 'active',
    enabled: user.Enabled ?? true,
    mfaEnabled: mfa,
    createdAt: user.UserCreateDate?.toISOString(),
  };
}

async function usersInGroup(group: StaffRole): Promise<UserType[]> {
  const users: UserType[] = [];
  let next: string | undefined;
  do {
    const page = await cognito().send(
      new ListUsersInGroupCommand({ UserPoolId: pool(), GroupName: group, NextToken: next }),
    );
    users.push(...(page.Users ?? []));
    next = page.NextToken;
  } while (next);
  return users;
}

export const cognitoDirectory: StaffDirectory = {
  async list() {
    const byUsername = new Map<string, { user: UserType; role: StaffRole }>();
    // Librarians first, so someone in both groups is listed as admin.
    for (const role of [...STAFF_MEMBER_ROLES].reverse()) {
      for (const user of await usersInGroup(role))
        byUsername.set(user.Username ?? '', { user, role });
    }
    // A handful of staff: one extra call each for their two-step status is fine.
    return Promise.all(
      [...byUsername.values()].map(async ({ user, role }) =>
        toMember(user, role, await mfaEnabled(user.Username ?? '')),
      ),
    );
  },

  async get(username) {
    try {
      const [user, groups] = await Promise.all([
        cognito().send(new AdminGetUserCommand({ UserPoolId: pool(), Username: username })),
        cognito().send(
          new AdminListGroupsForUserCommand({ UserPoolId: pool(), Username: username }),
        ),
      ]);
      const names = groups.Groups?.map((g) => g.GroupName) ?? [];
      const role = STAFF_MEMBER_ROLES.find((r) => names.includes(r));
      if (!role) return undefined;
      return toMember(
        {
          Username: user.Username,
          Attributes: user.UserAttributes,
          UserStatus: user.UserStatus,
          Enabled: user.Enabled,
          UserCreateDate: user.UserCreateDate,
        },
        role,
        Boolean(user.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA')),
      );
    } catch (error) {
      if (error instanceof UserNotFoundException) return undefined;
      throw error;
    }
  },

  async create(input, temporaryPassword) {
    try {
      const { User } = await cognito().send(
        new AdminCreateUserCommand({
          UserPoolId: pool(),
          Username: input.username,
          TemporaryPassword: temporaryPassword,
          // The admin passes the password on; nothing is emailed.
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'name', Value: input.name },
            ...(input.email
              ? [
                  { Name: 'email', Value: input.email },
                  { Name: 'email_verified', Value: 'true' },
                ]
              : []),
          ],
        }),
      );
      await cognito().send(
        new AdminAddUserToGroupCommand({
          UserPoolId: pool(),
          Username: input.username,
          GroupName: input.role,
        }),
      );
      return toMember(User ?? { Username: input.username }, input.role, false);
    } catch (error) {
      if (error instanceof UsernameExistsException) {
        throw new ConflictError('USERNAME_TAKEN', 'This username is already in use');
      }
      throw error;
    }
  },

  async setRole(username, role) {
    // Add first, then remove: the person never ends up without any staff role.
    await cognito().send(
      new AdminAddUserToGroupCommand({ UserPoolId: pool(), Username: username, GroupName: role }),
    );
    for (const other of STAFF_MEMBER_ROLES.filter((r) => r !== role)) {
      await cognito().send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: pool(),
          Username: username,
          GroupName: other,
        }),
      );
    }
  },

  async setEnabled(username, enabled) {
    if (enabled) {
      await cognito().send(new AdminEnableUserCommand({ UserPoolId: pool(), Username: username }));
      return;
    }
    await cognito().send(new AdminDisableUserCommand({ UserPoolId: pool(), Username: username }));
    // Also end sessions that are already open.
    await cognito().send(
      new AdminUserGlobalSignOutCommand({ UserPoolId: pool(), Username: username }),
    );
  },

  async setTemporaryPassword(username, password) {
    await cognito().send(
      new AdminSetUserPasswordCommand({
        UserPoolId: pool(),
        Username: username,
        Password: password,
        Permanent: false,
      }),
    );
  },

  async resetMfa(username) {
    await cognito().send(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: pool(),
        Username: username,
        SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
      }),
    );
  },
};
