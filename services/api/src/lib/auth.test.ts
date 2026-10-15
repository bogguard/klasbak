import { describe, expect, it } from 'vitest';
import { actorFromClaims, requireRole } from './auth';

describe('actorFromClaims', () => {
  it('parses the flattened group string HTTP APIs send', () => {
    expect(actorFromClaims({ sub: 'u1', 'cognito:groups': '[librarian teacher]' })).toEqual({
      userId: 'u1',
      roles: ['librarian', 'teacher'],
    });
  });

  it('ignores unknown groups and handles missing groups', () => {
    expect(actorFromClaims({ sub: 'u1', 'cognito:groups': ['hacker', 'reader'] })?.roles).toEqual([
      'reader',
    ]);
    expect(actorFromClaims({ sub: 'u1' })?.roles).toEqual([]);
  });

  it('returns undefined without a subject', () => {
    expect(actorFromClaims(undefined)).toBeUndefined();
  });
});

describe('requireRole', () => {
  it('rejects anonymous and under-privileged users', () => {
    expect(() => requireRole(undefined, ['librarian'])).toThrow('Sign in');
    expect(() => requireRole({ userId: 'u', roles: ['reader'] }, ['librarian'])).toThrow(
      'not allowed',
    );
  });
});
