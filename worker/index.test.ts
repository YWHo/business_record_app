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

  it('fails closed when a demo rate-limit binding is unavailable', async () => {
    const response = await worker.fetch(
      incoming(new Request('https://demo.example.invalid/api/not-present')),
      {
        ...environment,
        APP_ENV: 'demo',
        APP_ORIGIN: 'https://demo.example.invalid',
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Demo protection is temporarily unavailable.',
    });
  });

  it('rejects an excessive demo action before route handling', async () => {
    const response = await worker.fetch(
      incoming(
        new Request('https://demo.example.invalid/api/not-present', {
          headers: { 'cf-connecting-ip': '192.0.2.10' },
        }),
      ),
      {
        ...environment,
        APP_ENV: 'demo',
        APP_ORIGIN: 'https://demo.example.invalid',
        DEMO_READ_RATE_LIMITER: {
          limit: () => Promise.resolve({ success: false }),
        },
      },
    );

    expect(response.status).toBe(429);
  });

  it('rejects every demo mutation before a database, bucket, or limiter call', async () => {
    const response = await worker.fetch(
      incoming(
        new Request('https://demo.example.invalid/api/comments', {
          method: 'POST',
        }),
      ),
      {
        ...environment,
        APP_ENV: 'demo',
        APP_ORIGIN: 'https://demo.example.invalid',
        DB: new Proxy({} as D1Database, {
          get: () => {
            throw new Error('D1 must not be accessed');
          },
        }),
        DOCUMENTS: new Proxy({} as R2Bucket, {
          get: () => {
            throw new Error('R2 must not be accessed');
          },
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('reports exhausted demo storage capacity without internal details', async () => {
    const allow = { limit: () => Promise.resolve({ success: true }) };
    const response = await worker.fetch(
      incoming(new Request('https://demo.example.invalid/api/health')),
      {
        ...environment,
        APP_ENV: 'demo',
        APP_ORIGIN: 'https://demo.example.invalid',
        DEMO_READ_RATE_LIMITER: allow,
        DB: {
          prepare: () => {
            throw new Error('provider quota detail');
          },
        } as unknown as D1Database,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error:
        'The public demo is temporarily at capacity. Please try again later.',
    });
  });
});
