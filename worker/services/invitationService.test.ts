import { describe, expect, it, vi } from 'vitest';
import {
  normalizeEmail,
  acceptAccountantInvitation,
} from './invitationService';
import type { Env } from '../types';

describe('invitation identity validation', () => {
  it('normalizes a valid address', () =>
    expect(normalizeEmail('  Person@Example.test ')).toBe(
      'person@example.test',
    ));
  it.each([
    'not-an-email',
    'person@invalid',
    '@example.test',
    `${'a'.repeat(250)}@example.test`,
  ])('rejects invalid address %s', (email) => {
    expect(() => normalizeEmail(email)).toThrow('valid email');
  });
  it('rejects an unavailable token before any writes', async () => {
    const batch = vi.fn();
    const env = {
      APP_ENV: 'local',
      DB: {
        prepare: () => ({
          bind: () => ({ first: () => Promise.resolve(null) }),
        }),
        batch,
      },
    } as unknown as Env;
    await expect(
      acceptAccountantInvitation(env, 'person@example.test', 'invalid-token'),
    ).rejects.toMatchObject({ status: 400 });
    expect(batch).not.toHaveBeenCalled();
  });
});
