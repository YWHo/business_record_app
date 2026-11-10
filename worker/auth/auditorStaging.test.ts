import { describe, expect, it } from 'vitest';
import { requireUser } from './authorization';
import type { Env } from '../types';

describe('unsupported membership roles', () => {
  it.each(['ADMIN', 'BOOKKEEPER', 'MEMBER', 'UNKNOWN'])(
    'rejects a live session for unsupported role %s',
    async (role) => {
      const env = {
        APP_ENV: 'local',
        DB: {
          prepare: () => ({
            bind: () => ({
              first: () =>
                Promise.resolve({
                  id: 'staged-user',
                  email: 'staged@example.invalid',
                  role,
                  status: 'ACTIVE',
                  businessAccountId: 'business-account-primary',
                }),
            }),
          }),
        },
      } as unknown as Env;
      await expect(
        requireUser(
          new Request('http://localhost/api/auth/me', {
            headers: { cookie: 'br_session=synthetic-token' },
          }),
          env,
        ),
      ).rejects.toMatchObject({ status: 401 });
    },
  );
});
