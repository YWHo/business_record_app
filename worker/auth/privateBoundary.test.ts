import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../index';
import type { Env } from '../types';

const protectedPaths = [
  '/api/auth/me',
  '/api/businesses',
  '/api/transactions',
  '/api/dashboard',
  '/api/clients',
  '/api/vehicles',
  '/api/comments?recordType=EXPENSE&recordId=private',
  '/api/attachments/preview?id=private',
  '/api/reports/summary',
  '/api/users',
  '/api/auditor-access',
  '/api/businesses/private/documents',
];
afterEach(() => vi.unstubAllGlobals());
describe.each(['demo', 'staging', 'production'] as const)(
  '%s private API boundary',
  (environment) => {
    it.each(protectedPaths)(
      'requires a session for %s before consulting a shared cache',
      async (path) => {
        const cached = vi.fn(() =>
          Promise.resolve(new Response('private cached data')),
        );
        vi.stubGlobal('caches', { default: { match: cached } });
        const database = vi.fn(() => {
          throw new Error('Anonymous requests must not query D1');
        });
        const response = await worker.fetch(
          new Request(`https://records.example.invalid${path}`, {
            headers: { 'x-demo-role': 'OWNER', 'x-user-role': 'OWNER' },
          }),
          {
            APP_ENV: environment,
            APP_ORIGIN: 'https://records.example.invalid',
            DB: { prepare: database },
          } as unknown as Env,
        );
        expect(response.status).toBe(401);
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(database).not.toHaveBeenCalled();
        expect(cached).not.toHaveBeenCalled();
        expect(await response.text()).not.toContain('private cached data');
      },
    );
  },
);
