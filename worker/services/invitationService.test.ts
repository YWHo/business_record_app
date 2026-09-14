import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../lib/http';
import type { Env } from '../types';
import {
  acceptAccountantInvitation,
  normalizeEmail,
} from './invitationService';

interface TestStatement {
  query: string;
  values: unknown[];
  bind: (...values: unknown[]) => TestStatement;
  first: <T>() => Promise<T | null>;
}

function invitationEnvironment({
  existingUser = null,
  invitation = {
    id: 'invitation-1',
    business_account_id: 'account-1',
  },
  acceptanceChanges = 1,
}: {
  existingUser?: { id: string; status: string } | null;
  invitation?: { id: string; business_account_id: string } | null;
  acceptanceChanges?: number;
} = {}) {
  const statements: TestStatement[] = [];
  const prepare = vi.fn((query: string) => {
    const statement: TestStatement = {
      query,
      values: [],
      bind(...values: unknown[]) {
        statement.values = values;
        return statement;
      },
      first: <T>() => {
        if (query.includes('FROM users WHERE email'))
          return Promise.resolve(existingUser as T | null);
        if (query.includes('FROM invitations'))
          return Promise.resolve(invitation as T | null);
        return Promise.resolve(null);
      },
    };
    statements.push(statement);
    return statement;
  });
  const batch = vi.fn((batched: TestStatement[]) =>
    Promise.resolve(
      batched.map((_, index) => ({
        success: true,
        meta: {
          changes: index === batched.length - 1 ? acceptanceChanges : 1,
        },
      })),
    ),
  );
  return {
    env: { DB: { prepare, batch } } as unknown as Env,
    batch,
    statements,
  };
}

describe('normalizeEmail', () => {
  it('normalizes a valid address', () => {
    expect(normalizeEmail('  Person@Example.test ')).toBe(
      'person@example.test',
    );
  });

  it('rejects an invalid address', () => {
    expect(() => normalizeEmail('not-an-email')).toThrow(HttpError);
  });

  it('creates a new identity, membership, and token consumption in one batch', async () => {
    const { env, batch } = invitationEnvironment();

    await expect(
      acceptAccountantInvitation(env, 'person@example.test', 'valid-token'),
    ).resolves.toMatchObject({
      email: 'person@example.test',
      businessAccountId: 'account-1',
    });

    const batched = batch.mock.calls[0][0];
    expect(batched).toHaveLength(3);
    expect(batched[0].query).toContain('INSERT INTO users');
    expect(batched[0].query).toContain('accepted_at IS NULL');
    expect(batched[1].query).toContain('INSERT INTO business_account_members');
    expect(batched[2].query).toContain('UPDATE invitations');
    expect(batched[2].query).toContain('EXISTS');
  });

  it('does not reactivate a globally disabled identity', async () => {
    const { env, batch } = invitationEnvironment({
      existingUser: { id: 'disabled-user', status: 'DISABLED' },
    });

    await expect(
      acceptAccountantInvitation(env, 'person@example.test', 'valid-token'),
    ).rejects.toMatchObject({ status: 400 });
    expect(batch).not.toHaveBeenCalled();
  });

  it('does not report success unless the guarded token update is applied', async () => {
    const { env } = invitationEnvironment({ acceptanceChanges: 0 });

    await expect(
      acceptAccountantInvitation(env, 'person@example.test', 'stale-token'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('adds an existing active user without rewriting global identity status', async () => {
    const { env, batch } = invitationEnvironment({
      existingUser: { id: 'existing-user', status: 'ACTIVE' },
    });

    await acceptAccountantInvitation(env, 'person@example.test', 'valid-token');

    const batched = batch.mock.calls[0][0];
    expect(batched).toHaveLength(2);
    expect(batched.every(({ query }) => !query.includes('UPDATE users'))).toBe(
      true,
    );
  });
});
