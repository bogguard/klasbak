import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { isStaff } from '@klasbak/shared';
import type { Actor } from './auth';
import { AppError } from './errors';
import { tracer } from './observability';

/*
 * Staff accounts can change the catalogue and see pupils' data, so they must use two-step
 * verification (TOTP). Cognito can't require it per group, so the API checks it: a staff
 * member without an authenticator app gets MFA_REQUIRED and the app shows the setup screen.
 * Once TOTP is set up, Cognito asks for the code at every sign-in, so a valid token from such
 * an account was signed in with two steps.
 *
 * Only "enabled" answers are cached: right after someone sets it up, the next request
 * re-checks and lets them in.
 */

const CACHE_MS = 15 * 60_000;
const enabledSince = new Map<string, number>();
let client: CognitoIdentityProviderClient | undefined;

export async function assertStaffMfa(actor: Actor, now = Date.now()): Promise<void> {
  if (process.env.STAFF_MFA_REQUIRED !== 'true' || !isStaff(actor.roles)) return;
  const cachedAt = enabledSince.get(actor.userId);
  if (cachedAt && now - cachedAt < CACHE_MS) return;

  client ??= tracer.captureAWSv3Client(new CognitoIdentityProviderClient({}));
  const user = await client.send(
    new AdminGetUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: actor.username ?? actor.userId,
    }),
  );
  if (!user.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA')) {
    throw new AppError(403, 'MFA_REQUIRED', 'Set up two-step verification first');
  }
  enabledSince.set(actor.userId, now);
}
