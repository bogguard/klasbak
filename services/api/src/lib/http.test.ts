import { describe, expect, it } from 'vitest';
import { createApp, type Env } from './http';

describe('unexpected errors', () => {
  it('answer with a short reference that is also in the logs, and nothing internal', async () => {
    const app = createApp();
    app.get('/boom', () => {
      throw new Error('table "library-prod" exploded at line 42');
    });
    const env = {
      event: { requestContext: { requestId: 'r1' } },
      lambdaContext: { awsRequestId: 'abcdef12-3456-7890' },
    } as unknown as Env['Bindings'];

    const response = await app.request('/boom', {}, env);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong', reference: 'abcdef12' },
    });
    expect(body).not.toContain('library-prod');
  });
});
