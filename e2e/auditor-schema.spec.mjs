import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('@api-smoke @non-ui auditor schema remains inaccessible before permission enforcement', async ({
  request,
  baseURL,
}) => {
  expect(new URL(baseURL).hostname).toBe('127.0.0.1');
  const session = 'synthetic-staged-auditor-session';
  const token = 'synthetic-staged-auditor-invitation';
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const sql = `
    INSERT INTO users (id,email,role,status,created_at,updated_at)
    VALUES ('staged-auditor','staged-auditor@local.test','AUDITOR','ACTIVE','2026-01-01','2026-01-01');
    INSERT INTO business_account_members (business_account_id,user_id,role,status,created_at,updated_at,access_expires_at)
    VALUES ('business-account-primary','staged-auditor','AUDITOR','ACTIVE','2026-01-01','2026-01-01','2099-01-01T00:00:00.000Z');
    INSERT INTO sessions (token_hash,user_id,business_account_id,expires_at,created_at)
    VALUES ('${hash(session)}','staged-auditor','business-account-primary','2099-01-01T00:00:00.000Z','2026-01-01');
    INSERT INTO invitations (id,email,role,token_hash,invited_by,expires_at,created_at,access_expires_at)
    VALUES ('staged-auditor-invite','staged-invite@local.test','AUDITOR','${hash(token)}','dev-owner','2099-01-01T00:00:00.000Z','2026-01-01','2099-01-01T00:00:00.000Z');
  `;
  const cli = fileURLToPath(
    new URL('./bin/wrangler.js', import.meta.resolve('wrangler/package.json')),
  );
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'd1',
      'execute',
      'business-records-local',
      '--local',
      '--persist-to',
      '.wrangler/state/e2e',
      '--command',
      sql,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const headers = { cookie: `br_session=${session}` };
  for (const path of ['/api/auth/me', '/api/businesses', '/api/transactions']) {
    expect((await request.get(path, { headers })).status()).toBe(401);
  }
  expect(
    (
      await request.post('/api/comments', {
        headers,
        data: { recordType: 'EXPENSE', recordId: 'guessed', body: 'denied' },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post('/api/dev/auth/login', {
        data: { email: 'staged-auditor@local.test' },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post('/api/invitations/accept', {
        data: { email: 'staged-invite@local.test', token },
      })
    ).status(),
  ).toBe(400);
  console.log(
    'Auditor schema staging checks passed: session, login, mutation, and accountant acceptance remain denied.',
  );
});
