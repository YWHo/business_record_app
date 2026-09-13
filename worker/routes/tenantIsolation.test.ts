import { describe, expect, it } from 'vitest';
import type { Env } from '../types';
import { listActivities, updateActivity } from './activities';

function tenantDatabase(
  onQuery: (query: string, values: unknown[]) => unknown,
) {
  return {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) {
          values = next;
          return statement;
        },
        first: () => Promise.resolve(onQuery(query, values)),
        all: () =>
          Promise.resolve({
            results: (onQuery(query, values) as unknown[]) ?? [],
          }),
      };
      return statement;
    },
  } as unknown as D1Database;
}

const request = (url: string, init?: RequestInit) =>
  new Request(url, {
    ...init,
    headers: { cookie: 'br_session=tenant-test', ...init?.headers },
  });

describe('business-account route isolation', () => {
  it('binds list reads to the account selected by the active membership', async () => {
    const database = tenantDatabase((query, values) => {
      if (query.includes('FROM sessions'))
        return {
          id: 'owner-a',
          email: 'owner-a@example.invalid',
          role: 'OWNER',
          status: 'ACTIVE',
          businessAccountId: 'account-a',
        };
      expect(query).toContain('WHERE business_account_id = ?');
      expect(values).toEqual(['account-a']);
      return [];
    });

    const response = await listActivities(
      request('https://records.example.invalid/api/business-activities'),
      { APP_ENV: 'production', DB: database } as Env,
    );
    await expect(response.json()).resolves.toEqual({ activities: [] });
  });

  it('cannot update a record found only in another account', async () => {
    const database = tenantDatabase((query, values) => {
      if (query.includes('FROM sessions'))
        return {
          id: 'owner-a',
          email: 'owner-a@example.invalid',
          role: 'OWNER',
          status: 'ACTIVE',
          businessAccountId: 'account-a',
        };
      expect(query).toContain('id = ? AND business_account_id = ?');
      expect(values).toEqual(['account-b-activity', 'account-a']);
      return null;
    });

    await expect(
      updateActivity(
        request('https://records.example.invalid/api/business-activities', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: 'account-b-activity',
            name: 'Guessed record',
            activityType: 'OTHER',
            active: true,
          }),
        }),
        { APP_ENV: 'production', DB: database } as Env,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
