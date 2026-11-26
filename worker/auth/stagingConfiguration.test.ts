import { expect, it } from 'vitest';
import { authConfiguration } from '../routes/auth';
import { bootstrapOwner } from '../routes/accounts';
import {
  isTurnstileRequired,
  requireSameOrigin,
} from '../services/securityService';
import { requireLocalAuth } from './localOnly';
import type { Env } from '../types';

const environment = {
  APP_ENV: 'staging',
  APP_ORIGIN: 'https://staging.example.invalid',
  LOCAL_AUTH_ENABLED: 'true',
  TURNSTILE_REQUIRED: 'false',
  TURNSTILE_SITE_KEY: 'staging-widget',
  BOOTSTRAP_OWNER_EMAIL: 'accidental-owner@example.invalid',
  BOOTSTRAP_ADMIN_KEY: 'accidental-key',
} as Env;

it('requires a deployed challenge even when the staging flag is accidentally disabled', async () => {
  expect(isTurnstileRequired(environment)).toBe(true);
  const response = authConfiguration(
    new Request('http://localhost/api/auth/config'),
    environment,
  );
  expect(await response.json()).toEqual({
    environment: 'staging',
    localHelper: false,
    demoHelper: false,
    turnstileRequired: true,
    turnstileSiteKey: 'staging-widget',
  });
});
it('keeps origin defenses and the local-helper environment guard on loopback hosts', () => {
  const request = new Request('http://localhost/api/dev/auth/login', {
    method: 'POST',
  });
  expect(() => requireLocalAuth(request, environment)).toThrow();
  expect(() => requireSameOrigin(request, environment)).toThrow();
});
it('cannot bootstrap a staging owner through accidentally copied production bootstrap secrets', async () => {
  await expect(
    bootstrapOwner(
      new Request('https://staging.example.invalid/api/admin/bootstrap-owner', {
        method: 'POST',
        headers: { 'x-bootstrap-key': 'accidental-key' },
      }),
      environment,
    ),
  ).rejects.toMatchObject({ status: 404 });
});
