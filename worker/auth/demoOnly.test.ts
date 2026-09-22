import { describe, expect, it } from 'vitest';
import { authConfiguration, requestLogin, verifyLogin } from '../routes/auth';
import { acceptInvitation, bootstrapOwner } from '../routes/accounts';
import type { Env } from '../types';

function environment(overrides: Partial<Env> = {}): Env {
  const limiter = { limit: () => Promise.resolve({ success: true }) };
  return {
    APP_ENV: 'demo',
    LOCAL_AUTH_ENABLED: 'false',
    DEV_OWNER_EMAIL: 'disabled@demo.invalid',
    DEV_ACCOUNTANT_EMAIL: 'disabled@demo.invalid',
    DEV_BOOTSTRAP_KEY: 'disabled',
    APP_ORIGIN: 'https://demo.example.invalid',
    TURNSTILE_REQUIRED: 'false',
    TURNSTILE_SITE_KEY: '',
    EMAIL_DELIVERY_URL: '',
    EMAIL_FROM: 'no-reply@demo.invalid',
    AUTH_RATE_LIMITER: limiter,
    INVITE_RATE_LIMITER: limiter,
    EXPENSIVE_RATE_LIMITER: limiter,
    DB: {} as D1Database,
    DOCUMENTS: {} as R2Bucket,
    ...overrides,
  };
}

describe('demo authentication boundary', () => {
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

  it('does not expose owner bootstrap even if demo secrets are misconfigured', async () => {
    await expect(
      bootstrapOwner(
        new Request('https://demo.example.invalid/api/admin/bootstrap-owner', {
          method: 'POST',
          headers: { 'x-bootstrap-key': 'accidental-secret' },
        }),
        environment({
          BOOTSTRAP_OWNER_EMAIL: 'demo-owner@example.invalid',
          BOOTSTRAP_ADMIN_KEY: 'accidental-secret',
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['/api/auth/login', requestLogin],
    ['/api/auth/verify', verifyLogin],
    ['/api/invitations/accept', acceptInvitation],
  ] as const)('does not expose the deployed %s flow', async (path, handler) => {
    await expect(
      handler(
        new Request(`https://demo.example.invalid${path}`, {
          method: 'POST',
        }),
        environment(),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('does not expose a server-side demo login endpoint', async () => {
    const worker = (await import('../index')).default;
    const response = await worker.fetch(
      new Request('https://demo.example.invalid/api/auth/demo', {
        method: 'POST',
      }),
      environment(),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
