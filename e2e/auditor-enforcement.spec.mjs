import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('@api-smoke @non-ui auditors inspect scoped evidence and cannot mutate or export', async ({
  request,
  baseURL,
}) => {
  expect(new URL(baseURL).hostname).toBe('127.0.0.1');
  const business = 'business-activity-contracting';
  const other = 'business-activity-delivery';
  const activity = 'activity-contracting';
  const otherActivity = 'activity-delivery';
  const token = 'synthetic-enforcement-auditor-session';
  const cli = fileURLToPath(
    new URL('./bin/wrangler.js', import.meta.resolve('wrangler/package.json')),
  );
  function sql(command) {
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
        command,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  }
  sql(`INSERT INTO users (id,email,role,status,created_at,updated_at) VALUES ('enforcement-auditor','enforcement-auditor@local.test','AUDITOR','ACTIVE','2026-01-01','2026-01-01');
    INSERT INTO business_account_members (business_account_id,user_id,role,status,created_at,updated_at,access_expires_at)
    VALUES ('business-account-primary','enforcement-auditor','AUDITOR','ACTIVE','2026-01-01','2026-01-01','2099-01-01T00:00:00.000Z');
    INSERT INTO membership_access_scopes (id,business_account_id,user_id,scope_type,business_id,date_from,date_to,created_at,updated_at)
    VALUES ('enforcement-scope','business-account-primary','enforcement-auditor','BUSINESS','${business}','2026-09-01','2026-09-30','2026-01-01','2026-01-01');
    INSERT INTO sessions (token_hash,user_id,business_account_id,expires_at,created_at)
    VALUES ('${createHash('sha256').update(token).digest('hex')}','enforcement-auditor','business-account-primary','2099-01-01T00:00:00.000Z','2026-01-01');
    INSERT INTO expenses (id,business_account_id,business_id,legal_entity_id,business_activity_id,expense_type,expense_category_id,merchant_name,purchase_datetime,total_amount_minor,created_by,created_at,updated_at,retention_until,purge_eligible_at)
    VALUES ('audit-visible','business-account-primary','${business}','business-entity-primary','${activity}','GENERAL','category-general','Auditor permitted fixture','2026-09-15T12:00:00.000Z',12345,'dev-owner','2026-09-15','2026-09-15','2036-03-31','2036-04-01'),
    ('audit-outside-date','business-account-primary','${business}','business-entity-primary','${activity}','GENERAL','category-general','Auditor hidden date','2026-10-15T12:00:00.000Z',99999,'dev-owner','2026-10-15','2026-10-15','2036-03-31','2036-04-01'),
    ('audit-other-business','business-account-primary','${other}','business-entity-primary','${otherActivity}','GENERAL','category-general','Auditor hidden business','2026-09-15T12:00:00.000Z',88888,'dev-owner','2026-09-15','2026-09-15','2036-03-31','2036-04-01');`);
  const headers = { cookie: `br_session=${token}` };
  const directory = await request.get('/api/businesses', { headers });
  expect(directory.status(), await directory.text()).toBe(200);
  expect((await directory.json()).businesses.map((row) => row.id)).toEqual([
    business,
  ]);
  for (const path of [
    `/api/businesses/${business}/expenses`,
    `/api/transactions`,
    `/api/businesses/${business}/dashboard`,
    `/api/reports/summary`,
  ]) {
    const response = await request.get(path, { headers });
    expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
    expect(await response.text()).not.toContain('Auditor hidden');
  }
  for (const id of ['audit-outside-date', 'audit-other-business']) {
    expect(
      (
        await request.get(`/api/businesses/${business}/expenses/${id}`, {
          headers,
        })
      ).status(),
    ).toBe(404);
  }
  expect(
    (await request.get(`/api/businesses/${other}`, { headers })).status(),
  ).toBe(404);
  for (const [method, path] of [
    ['post', '/api/comments'],
    ['patch', '/api/record-status'],
    ['post', '/api/attachments'],
    ['post', '/api/income-reconciliations'],
    ['patch', '/api/insurance-allocations'],
    ['post', '/api/trash'],
    ['delete', '/api/trash'],
    ['post', '/api/invitations'],
    ['patch', `/api/businesses/${business}`],
    ['post', `/api/businesses/${business}/expenses`],
  ]) {
    expect(
      (
        await request[method](path, {
          headers,
          data: { recordId: 'audit-visible' },
        })
      ).status(),
      path,
    ).toBe(403);
  }
  for (const path of [
    '/api/exports/archive?scope=FULL',
    '/api/reports/export?scope=FULL',
    '/api/users',
    '/api/retention-settings',
  ]) {
    expect((await request.get(path, { headers })).status(), path).toBe(403);
  }
  const login = await request.post('/api/dev/auth/login', {
    data: { email: 'owner@local.test' },
  });
  expect(login.status()).toBe(200);
  const ownerHeaders = { cookie: login.headers()['set-cookie'].split(';')[0] };
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN8sAAAAASUVORK5CYII=',
    'base64',
  );
  const uploaded = await request.post('/api/attachments', {
    headers: ownerHeaders,
    multipart: {
      recordType: 'EXPENSE',
      recordId: 'audit-visible',
      confirmDuplicate: 'true',
      file: {
        name: 'auditor-evidence.png',
        mimeType: 'image/png',
        buffer: png,
      },
    },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const attachmentId = (await uploaded.json()).attachment.id;
  const metadata = await request.get(
    '/api/attachments?recordType=EXPENSE&recordId=audit-visible',
    { headers },
  );
  expect(metadata.status(), await metadata.text()).toBe(200);
  const attachment = (await metadata.json()).attachments.find(
    (row) => row.id === attachmentId,
  );
  expect(attachment.downloadUrl).toBeNull();
  const preview = await request.get(attachment.previewUrl, { headers });
  expect(preview.status(), await preview.text()).toBe(200);
  expect(preview.headers()['content-disposition']).toMatch(/^inline;/);
  expect(preview.headers()['x-frame-options']).toBe('SAMEORIGIN');
  expect(Buffer.from(await preview.body())).toEqual(png);
  expect(
    (
      await request.get(`/api/attachments/file?id=${attachmentId}`, { headers })
    ).status(),
  ).toBe(403);
  const audit = await request.get('/api/audit-log', { headers });
  expect(audit.status(), await audit.text()).toBe(200);
  expect(await audit.text()).toContain('audit-visible');
  sql(
    "UPDATE membership_access_scopes SET scope_type='LEGAL_ENTITY',business_id=NULL,legal_entity_id='business-entity-primary' WHERE id='enforcement-scope'",
  );
  expect(
    (await request.get(`/api/businesses/${other}`, { headers })).status(),
  ).toBe(200);
  sql(
    "UPDATE business_account_members SET access_expires_at='2020-01-01T00:00:00.000Z' WHERE user_id='enforcement-auditor'",
  );
  expect((await request.get('/api/businesses', { headers })).status()).toBe(
    403,
  );
  sql(
    "UPDATE business_account_members SET status='DISABLED',access_expires_at='2099-01-01T00:00:00.000Z' WHERE user_id='enforcement-auditor'",
  );
  expect((await request.get('/api/businesses', { headers })).status()).toBe(
    401,
  );
});
