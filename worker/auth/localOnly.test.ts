import { describe, expect, it } from 'vitest';
import type { Env } from '../types';
import { isLocalAuthRequest } from './localOnly';

function environment(overrides: Partial<Env> = {}): Env {
  const limiter = { limit: () => Promise.resolve({ success: true }) };
  return {
    APP_ENV: 'local',
    LOCAL_AUTH_ENABLED: 'true',
    DEV_OWNER_EMAIL: 'owner@local.test',
    DEV_ACCOUNTANT_EMAIL: 'accountant@local.test',
    DEV_BOOTSTRAP_KEY: 'test-only',
    APP_ORIGIN: 'http://localhost:5173',
    TURNSTILE_REQUIRED: 'false',
    TURNSTILE_SITE_KEY: '',
    EMAIL_DELIVERY_URL: '',
    EMAIL_FROM: 'no-reply@local.test',
    AUTH_RATE_LIMITER: limiter,
    INVITE_RATE_LIMITER: limiter,
    DB: {} as D1Database,
    DOCUMENTS: {} as R2Bucket,
    ...overrides,
  };
}

describe('local-only authentication boundary', () => {
  it('allows an explicitly enabled loopback request', () => {
    expect(
      isLocalAuthRequest(
        new Request('http://127.0.0.1:5173/api/dev/auth/login'),
        environment(),
      ),
    ).toBe(true);
  });

  it('rejects a remote hostname even when variables are misconfigured', () => {
    expect(
      isLocalAuthRequest(
        new Request('https://records.example/api/dev/auth/login'),
        environment(),
      ),
    ).toBe(false);
  });

  it.each(['demo', 'production'] as const)(
    'rejects the %s environment',
    (appEnvironment) => {
      expect(
        isLocalAuthRequest(
          new Request('http://localhost:5173/api/dev/auth/login'),
          environment({ APP_ENV: appEnvironment }),
        ),
      ).toBe(false);
    },
  );
});
