import type { LambdaEvent } from 'hono/aws-lambda';
import { describe, expect, it } from 'vitest';
import { app as circulation } from '../circulation/handler';
import { app as equipment } from '../equipment/handler';
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

describe('the equipment role', () => {
  it('has no rights in the library', async () => {
    const attempts = [
      readers.request('/api/readers', {}, as('equipment')),
      circulation.request('/api/circulation/loans', {}, as('equipment')),
      circulation.request(
        '/api/circulation/scan',
        { method: 'POST', headers: json, body: '{}' },
        as('equipment'),
      ),
    ];
    for (const response of await Promise.all(attempts)) expect(response.status).toBe(403);
  });

  it('keeps teachers and readers out of the equipment API', async () => {
    for (const role of ['teacher', 'reader']) {
      const response = await equipment.request('/api/equipment/recipients', {}, as(role));
      expect(response.status).toBe(403);
    }
  });
});
