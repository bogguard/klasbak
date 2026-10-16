import type { LambdaEvent } from 'hono/aws-lambda';
import { describe, expect, it } from 'vitest';
import { app as circulation } from '../circulation/handler';
import { app as readers } from '../readers/handler';

const as = (role: string) => ({
  event: {
    requestContext: {
      requestId: 'r',
      authorizer: { jwt: { claims: { sub: 'u', username: 'u', 'cognito:groups': `[${role}]` } } },
    },
  } as unknown as LambdaEvent,
});
const json = { 'content-type': 'application/json' };

describe('administrator-only tasks', () => {
  it('refuses librarians before touching any data', async () => {
    const attempts = [
      circulation.request(
        '/api/circulation/settings',
        { method: 'PUT', headers: json, body: '{}' },
        as('librarian'),
      ),
      readers.request(
        '/api/readers/import',
        { method: 'POST', headers: json, body: '{}' },
        as('librarian'),
      ),
      readers.request(
        '/api/readers/01JABCDEFGHJKMNPQRSTVWXYZ0',
        { method: 'DELETE' },
        as('librarian'),
      ),
    ];
    for (const response of await Promise.all(attempts)) expect(response.status).toBe(403);
  });
});
