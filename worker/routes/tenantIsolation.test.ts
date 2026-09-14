import { describe, expect, it } from 'vitest';
import type { Env } from '../types';
import { disableUser, listInvitations, listUsers } from './accounts';
import { listActivities, updateActivity } from './activities';
import { downloadAttachment } from './attachments';
import { exportStatus } from './exports';
import { getRetentionSettings, listAuditLog } from './governance';
import { updateRecordStatus } from './review';

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

const actor = {
  id: 'owner-a',
  email: 'owner-a@example.invalid',
  role: 'OWNER',
  status: 'ACTIVE',
  businessAccountId: 'account-a',
};

describe('business-account route isolation', () => {
  it('binds list reads to the account selected by the active membership', async () => {
    const database = tenantDatabase((query, values) => {
      if (query.includes('FROM sessions')) return actor;
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
      if (query.includes('FROM sessions')) return actor;
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

  it('cannot download attachment metadata found only in another account', async () => {
    const database = tenantDatabase((query, values) => {
      if (query.includes('FROM sessions')) return actor;
      expect(query).toContain('attachments.business_account_id = ?');
      expect(values).toEqual(['attachment-from-account-b', 'account-a']);
      return null;
    });

    await expect(
      downloadAttachment(
        request(
          'https://records.example.invalid/api/attachments/file?id=attachment-from-account-b',
        ),
        { APP_ENV: 'production', DB: database } as Env,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('binds audit, retention, and export-history reads to the active account', async () => {
    const visited = new Set<string>();
    const database = tenantDatabase((query, values) => {
      if (query.includes('FROM sessions')) return actor;
      expect(values[0]).toBe('account-a');
      if (query.includes('FROM audit_log')) {
        visited.add('audit');
        return [];
      }
      if (query.includes('FROM retention_settings')) {
        visited.add('retention');
        return {
          retention_tax_years: 10,
          tax_year_end_month: 3,
          tax_year_end_day: 31,
          backup_reminder_days: 30,
          updated_at: '2026-09-14T00:00:00.000Z',
        };
      }
      if (query.includes('FROM export_history')) {
        visited.add('exports');
        return [];
      }
      throw new Error(`Unexpected tenant query: ${query}`);
    });
    const env = { APP_ENV: 'production', DB: database } as Env;

    await listAuditLog(
      request('https://records.example.invalid/api/audit-log'),
      env,
    );
    await getRetentionSettings(
      request('https://records.example.invalid/api/retention-settings'),
      env,
    );
    await exportStatus(
      request('https://records.example.invalid/api/exports/status'),
      env,
    );

    expect(visited).toEqual(new Set(['audit', 'retention', 'exports']));
  });

  it('rejects guessed cross-account record and membership mutations', async () => {
    const database = tenantDatabase((query, values) => {
      if (query.includes('FROM sessions')) return actor;
      if (query.includes('FROM expenses')) {
        expect(values).toEqual(['expense-from-account-b', 'account-a']);
        return null;
      }
      if (query.includes('FROM business_account_members')) {
        expect(values).toEqual(['user-from-account-b', 'account-a']);
        return null;
      }
      throw new Error(`Unexpected tenant query: ${query}`);
    });
    const env = { APP_ENV: 'production', DB: database } as Env;

    await expect(
      updateRecordStatus(
        request('https://records.example.invalid/api/record-status', {
          method: 'PATCH',
          body: JSON.stringify({
            recordType: 'EXPENSE',
            recordId: 'expense-from-account-b',
            status: 'READY_FOR_REVIEW',
          }),
        }),
        env,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      disableUser(
        request('https://records.example.invalid/api/users/disable', {
          method: 'POST',
          body: JSON.stringify({ userId: 'user-from-account-b' }),
        }),
        env,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('caps account-scoped user and invitation collections', async () => {
    const visited = new Set<string>();
    const database = tenantDatabase((query, values) => {
      if (query.includes('FROM sessions')) return actor;
      expect(query).toContain('LIMIT 200');
      if (query.includes('FROM business_account_members')) {
        expect(values).toEqual(['account-a']);
        visited.add('users');
      } else if (query.includes('FROM invitations')) {
        expect(values[1]).toBe('account-a');
        visited.add('invitations');
      }
      return [];
    });
    const env = { APP_ENV: 'production', DB: database } as Env;

    await listUsers(request('https://records.example.invalid/api/users'), env);
    await listInvitations(
      request('https://records.example.invalid/api/invitations'),
      env,
    );

    expect(visited).toEqual(new Set(['users', 'invitations']));
  });
});
