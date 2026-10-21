import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { LambdaEvent } from 'hono/aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './handler';
import { cognitoDirectory } from './cognito-directory';
import { temporaryPassword } from './service';

const ddb = mockClient(DynamoDBDocumentClient);
const cognito = mockClient(CognitoIdentityProviderClient);

function request(
  method: string,
  path: string,
  as: { username: string; role: string },
  body?: unknown,
) {
  const claims = {
    sub: `sub-${as.username}`,
    username: as.username,
    'cognito:groups': `[${as.role}]`,
  };
  return app.request(
    path,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    {
      event: {
        requestContext: { requestId: 'r', authorizer: { jwt: { claims } } },
      } as unknown as LambdaEvent,
    },
  );
}

const admin = { username: 'dev-admin', role: 'admin' };

beforeEach(() => {
  vi.stubEnv('STAFF_DIRECTORY', 'memory');
  ddb.reset();
  cognito.reset();
  ddb.on(PutCommand).resolves({});
});
afterEach(() => vi.unstubAllEnvs());

describe('staff accounts', () => {
  it('is for admins only', async () => {
    const res = await request('GET', '/api/staff', {
      username: 'dev-librarian',
      role: 'librarian',
    });
    expect(res.status).toBe(403);
  });

  it('creates an account and shows its temporary password once', async () => {
    const res = await request('POST', '/api/staff', admin, {
      username: 'Juf.An',
      name: 'An Wouters',
      role: 'librarian',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      member: { username: string; status: string };
      credentials: { temporaryPassword: string };
    };
    expect(body.member).toMatchObject({ username: 'juf.an', status: 'invited' });
    expect(body.credentials.temporaryPassword).toMatch(/^[\w]{4}-[\w]{4}-[\w]{4}$/);
    expect(ddb.commandCalls(PutCommand)[0]?.args[0].input.Item).toMatchObject({
      action: 'staff.created',
    });

    const again = await request('POST', '/api/staff', admin, {
      username: 'juf.an',
      name: 'X',
      role: 'admin',
    });
    expect(await again.json()).toMatchObject({ error: { code: 'USERNAME_TAKEN' } });
  });

  it('never lets you change your own account', async () => {
    const res = await request('PATCH', '/api/staff/dev-admin', admin, { enabled: false });
    expect(await res.json()).toMatchObject({ error: { code: 'CANNOT_CHANGE_SELF' } });
  });

  it('always keeps at least one active admin', async () => {
    await request('POST', '/api/staff', admin, {
      username: 'meester.jo',
      name: 'Jo',
      role: 'admin',
    });
    const jo = { username: 'meester.jo', role: 'admin' };

    // With two admins, one may make the other a librarian…
    expect((await request('PATCH', '/api/staff/dev-admin', jo, { role: 'librarian' })).status).toBe(
      200,
    );
    // …but then Jo is the last active admin and can't be deactivated.
    const res = await request('PATCH', '/api/staff/meester.jo', admin, { enabled: false });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'LAST_ADMIN' } });

    await request('PATCH', '/api/staff/dev-admin', jo, { role: 'admin' }); // restore for other tests
  });
});

describe('temporaryPassword', () => {
  it('avoids characters that look alike', () => {
    for (let i = 0; i < 50; i++) expect(temporaryPassword()).not.toMatch(/[0O1lI]/);
  });
});

describe('cognitoDirectory', () => {
  it('creates the user without emailing, then adds the role', async () => {
    cognito
      .on(AdminCreateUserCommand)
      .resolves({ User: { Username: 'juf.an', UserStatus: 'FORCE_CHANGE_PASSWORD' } });
    cognito.on(AdminAddUserToGroupCommand).resolves({});

    const member = await cognitoDirectory.create(
      { username: 'juf.an', name: 'An', email: 'an@example.org', role: 'librarian' },
      'Abcd-Efgh-Jkmn',
    );

    expect(member).toMatchObject({ username: 'juf.an', status: 'invited', role: 'librarian' });
    expect(cognito.commandCalls(AdminCreateUserCommand)[0]?.args[0].input).toMatchObject({
      MessageAction: 'SUPPRESS',
      TemporaryPassword: 'Abcd-Efgh-Jkmn',
    });
    expect(cognito.commandCalls(AdminAddUserToGroupCommand)[0]?.args[0].input.GroupName).toBe(
      'librarian',
    );
  });
});
