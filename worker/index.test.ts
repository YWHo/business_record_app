import { describe, expect, it } from 'vitest';
import worker from './index';
import type { Env } from './types';

const environment = {
  APP_ENV: 'production',
  APP_ORIGIN: 'https://records.example.invalid',
} as Env;
const incoming = (request: Request) =>
  request as Parameters<typeof worker.fetch>[0];

describe('Worker security middleware', () => {
  it('hardens API errors and returns a correlation identifier', async () => {
    const response = await worker.fetch(
      incoming(new Request('https://records.example.invalid/api/not-present')),
      environment,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('x-request-id')).toMatch(
      /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/,
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('strict-transport-security')).toContain(
      'includeSubDomains',
    );
  });

  it('rejects a deployed unsafe request before route handling', async () => {
    const response = await worker.fetch(
      incoming(
        new Request('https://records.example.invalid/api/not-present', {
          method: 'POST',
        }),
      ),
      environment,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Request origin could not be verified.',
    });
  });
});
