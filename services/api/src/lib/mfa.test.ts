import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertStaffMfa } from './mfa';

const cognito = mockClient(CognitoIdentityProviderClient);

beforeEach(() => {
  cognito.reset();
  vi.stubEnv('STAFF_MFA_REQUIRED', 'true');
  vi.stubEnv('USER_POOL_ID', 'pool');
});
afterEach(() => vi.unstubAllEnvs());

describe('assertStaffMfa', () => {
  it('refuses staff without an authenticator app', async () => {
    cognito.on(AdminGetUserCommand).resolves({ UserMFASettingList: [] });
    await expect(
      assertStaffMfa({ userId: 'u1', username: 'juf.an', roles: ['librarian'] }),
    ).rejects.toMatchObject({ status: 403, code: 'MFA_REQUIRED' });
  });

  it('lets staff with TOTP through and remembers it for a while', async () => {
    cognito.on(AdminGetUserCommand).resolves({ UserMFASettingList: ['SOFTWARE_TOKEN_MFA'] });
    const actor = { userId: 'u2', username: 'meester.jo', roles: ['admin' as const] };
    await assertStaffMfa(actor, 1_000);
    await assertStaffMfa(actor, 2_000);
    expect(cognito.commandCalls(AdminGetUserCommand)).toHaveLength(1);
    expect(cognito.commandCalls(AdminGetUserCommand)[0]?.args[0].input.Username).toBe('meester.jo');
  });

  it('does not check readers, teachers, or local development', async () => {
    await assertStaffMfa({ userId: 'u3', roles: ['teacher', 'reader'] });
    vi.stubEnv('STAFF_MFA_REQUIRED', '');
    await assertStaffMfa({ userId: 'u4', roles: ['admin'] });
    expect(cognito.commandCalls(AdminGetUserCommand)).toHaveLength(0);
  });
});
