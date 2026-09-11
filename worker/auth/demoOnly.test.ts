import { describe, expect, it } from 'vitest';
import { authConfiguration, loginToDemo } from '../routes/auth';
import type { Env } from '../types';
import { isDemoAuthEnabled, requireDemoAuth } from './demoOnly';

function environment(overrides: Partial<Env> = {}): Env {
  const limiter = { limit: () => Promise.resolve({ success: true }) };
  return {
    APP_ENV: 'demo',
    LOCAL_AUTH_ENABLED: 'false',
    DEV_OWNER_EMAIL: 'disabled@demo.invalid',
    DEV_ACCOUNTANT_EMAIL: 'disabled@demo.invalid',
    DEV_BOOTSTRAP_KEY: 'disabled',
    DEMO_AUTH_ENABLED: 'true',
    DEMO_OWNER_EMAIL: 'demo-owner@example.invalid',
    DEMO_ACCOUNTANT_EMAIL: 'demo-accountant@example.invalid',
    APP_ORIGIN: 'https://demo.example.invalid',
    TURNSTILE_REQUIRED: 'false',
    TURNSTILE_SITE_KEY: '',
    EMAIL_DELIVERY_URL: '',
    EMAIL_FROM: 'no-reply@demo.invalid',
    AUTH_RATE_LIMITER: limiter,
    INVITE_RATE_LIMITER: limiter,
    DB: {} as D1Database,
    DOCUMENTS: {} as R2Bucket,
    ...overrides,
  };
}

describe('demo authentication boundary', () => {
  it('is enabled only by an explicit demo configuration', () => {
    expect(isDemoAuthEnabled(environment())).toBe(true);
    expect(isDemoAuthEnabled(environment({ DEMO_AUTH_ENABLED: 'false' }))).toBe(
      false,
    );
  });

  it.each(['local', 'production'] as const)(
    'cannot be enabled in the %s environment',
    (appEnvironment) => {
      const env = environment({ APP_ENV: appEnvironment });
      expect(isDemoAuthEnabled(env)).toBe(false);
      expect(() => requireDemoAuth(env)).toThrow('Not found.');
    },
  );

  it('advertises role switching only for the demo environment', async () => {
    const request = new Request('https://demo.example.invalid/api/auth/config');
    const demo = await authConfiguration(request, environment()).json<{
      demoHelper: boolean;
    }>();
    const production = await authConfiguration(
      request,
      environment({ APP_ENV: 'production' }),
    ).json<{ demoHelper: boolean }>();

    expect(demo.demoHelper).toBe(true);
    expect(production.demoHelper).toBe(false);
  });

  it('maps a public role selection to its configured synthetic identity', async () => {
    const database = {
      prepare: (query: string) => {
        if (query.includes('FROM users')) {
          return {
            bind: (email: string, role: string) => {
              expect(email).toBe('demo-accountant@example.invalid');
              expect(role).toBe('ACCOUNTANT');
              return {
                first: () =>
                  Promise.resolve({
                    id: 'demo-accountant',
                    email,
                    role,
                    status: 'ACTIVE',
                  }),
              };
            },
          };
        }
        return {
          bind: () => ({ run: () => Promise.resolve({ success: true }) }),
        };
      },
    } as unknown as D1Database;
    const response = await loginToDemo(
      new Request('https://demo.example.invalid/api/auth/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'ACCOUNTANT' }),
      }),
      environment({ DB: database }),
    );
    const body = await response.json<{
      user: { id: string; role: string };
    }>();

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('br_session=');
    expect(body.user).toEqual({
      id: 'demo-accountant',
      email: 'demo-accountant@example.invalid',
      role: 'ACCOUNTANT',
    });
  });
});
