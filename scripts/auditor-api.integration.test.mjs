// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import app from '../worker/index';
import { scopedReadDatabase } from '../worker/services/scopedReadDatabase';
import { loadAuthorizationContext } from '../worker/services/accessControlService';

let db, env, business, otherBusiness, expense, otherExpense;
const account = 'business-account-primary';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function statement(sql, values = []) {
  return {
    bind(...bindings) {
      return statement(sql, bindings);
    },
    async first(column) {
      const row = db.prepare(sql).get(...values) ?? null;
      return column && row ? row[column] : row;
    },
    async all() {
      return { success: true, results: db.prepare(sql).all(...values) };
    },
    async run() {
      const result = db.prepare(sql).run(...values);
      return { success: true, meta: { changes: Number(result.changes) } };
    },
  };
}
async function request(
  path,
  method = 'GET',
  token = 'auditor-token',
  body = {},
) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        cookie: `br_session=${token}`,
        'content-type': 'application/json',
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
}
function scope(type = 'BUSINESS', id = business, from = null, to = null) {
  db.exec("DELETE FROM membership_access_scopes WHERE user_id='api-auditor'");
  db.prepare(
    `INSERT INTO membership_access_scopes (business_account_id,user_id,scope_type,business_id,legal_entity_id,date_from,date_to,created_at,updated_at)
    VALUES (?,'api-auditor',?,?,?,?,?,'2026-01-01','2026-01-01')`,
  ).run(
    account,
    type,
    type === 'BUSINESS' ? id : null,
    type === 'LEGAL_ENTITY' ? id : null,
    from,
    to,
  );
}
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const sql = read('../migrations/' + name);
    db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
  }
  db.exec(read('./seed-local.sql'));
  db.exec(read('./seed-local-showcase.sql'));
  [business, otherBusiness] = db
    .prepare('SELECT id FROM businesses ORDER BY id LIMIT 2')
    .all()
    .map((row) => row.id);
  expense = db
    .prepare('SELECT id FROM expenses WHERE business_id=? LIMIT 1')
    .get(business).id;
  otherExpense = db
    .prepare('SELECT id FROM expenses WHERE business_id=? LIMIT 1')
    .get(otherBusiness).id;
  db.exec(`INSERT INTO users (id,email,role,status,created_at,updated_at) VALUES ('api-auditor','api-auditor@example.invalid','AUDITOR','ACTIVE','2026-01-01','2026-01-01');
    INSERT INTO business_account_members (business_account_id,user_id,role,status,created_at,updated_at,access_expires_at)
    VALUES ('${account}','api-auditor','AUDITOR','ACTIVE','2026-01-01','2026-01-01','2099-01-01T00:00:00.000Z')`);
  for (const [token, id] of [
    ['auditor-token', 'api-auditor'],
    ['owner-token', 'dev-owner'],
    ['accountant-token', 'dev-accountant'],
  ]) {
    db.prepare(
      'INSERT INTO sessions (token_hash,user_id,business_account_id,expires_at,created_at) VALUES (?,?,?,?,?)',
    ).run(
      createHash('sha256').update(token).digest('hex'),
      id,
      account,
      '2099-01-01T00:00:00.000Z',
      '2026-01-01',
    );
  }
  scope();
  env = {
    APP_ENV: 'local',
    APP_ORIGIN: 'http://localhost',
    LOCAL_AUTH_ENABLED: 'true',
    DB: {
      prepare: statement,
      async batch(statements) {
        return Promise.all(statements.map((s) => s.run()));
      },
    },
    DOCUMENTS: {
      get: vi.fn(async () => ({ body: new Uint8Array([1, 2, 3]) })),
    },
    EXPENSIVE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
});
afterEach(() => db.close());

describe('HTTP auditor authorization and SQL visibility', () => {
  it('scopes directory summaries, legacy and business lists, and direct-ID routes', async () => {
    const directory = await request('/api/businesses');
    expect(directory.status).toBe(200);
    const result = await directory.json();
    expect(result.businesses.map((b) => b.id)).toEqual([business]);
    const expected = db
      .prepare('SELECT count(*) AS count FROM expenses WHERE business_id=?')
      .get(business).count;
    const records = await request(`/api/businesses/${business}/expenses`);
    expect(records.status, await records.clone().text()).toBe(200);
    expect((await records.json()).expenses).toHaveLength(expected);
    for (const path of [
      `/api/businesses/${otherBusiness}`,
      `/api/businesses/${otherBusiness}/expenses`,
      `/api/businesses/${business}/expenses/${otherExpense}`,
    ]) {
      expect((await request(path)).status, path).toBe(404);
    }
    for (const path of [
      '/api/transactions',
      '/api/general-expenses',
      '/api/fuel-records',
      '/api/income-records',
      '/api/work-sessions',
      '/api/vehicles',
      '/api/clients',
      '/api/expense-categories',
      '/api/business-activities',
      `/api/businesses/${business}/dashboard`,
    ]) {
      const response = await request(path);
      expect(response.status, `${path}: ${await response.clone().text()}`).toBe(
        200,
      );
    }
    expect(
      (await request(`/api/businesses/${business}/expenses/${expense}`)).status,
    ).toBe(200);
  });

  it('filters counts and totals before pagination, and uses persisted historical entity', async () => {
    scope('BUSINESS', business, '2026-09-01', '2026-09-30');
    const response = await request('/api/reports/summary');
    expect(response.status, await response.clone().text()).toBe(200);
    const report = await response.json();
    const total = db
      .prepare(
        "SELECT count(*) AS count FROM expenses WHERE business_id=? AND substr(purchase_datetime,1,10) BETWEEN '2026-09-01' AND '2026-09-30' AND deleted_at IS NULL AND purged_at IS NULL AND status<>'VOIDED'",
      )
      .get(business).count;
    expect(
      report.rows
        .filter((r) => r.family === 'EXPENSE')
        .reduce((n, r) => n + r.record_count, 0),
    ).toBe(total);
    scope('LEGAL_ENTITY', 'business-entity-primary');
    db.exec(
      `INSERT INTO business_entities (id,business_account_id,entity_type,created_at,updated_at) VALUES ('different','${account}','OTHER','2026-01-01','2026-01-01')`,
    );
    db.prepare(
      "UPDATE expenses SET legal_entity_id='different' WHERE id=?",
    ).run(expense);
    expect(
      (await request(`/api/businesses/${business}/expenses/${expense}`)).status,
    ).toBe(404);
  });

  it('keeps summary month filters aligned with Auckland accounting dates', async () => {
    db.prepare(
      `INSERT INTO expenses (id,business_account_id,business_id,legal_entity_id,business_activity_id,expense_type,expense_category_id,merchant_name,purchase_datetime,total_amount_minor,created_by,created_at,updated_at,retention_until,purge_eligible_at)
      VALUES ('midnight-boundary',?,?,'business-entity-primary',(SELECT legacy_business_activity_id FROM businesses WHERE id=?),'GENERAL','category-general','Month boundary fixture','2026-08-31T12:00:00.000Z',12345,'dev-owner','2026-09-01','2026-09-01','2036-03-31','2036-04-01')`,
    ).run(account, business, business);
    const response = await request(
      '/api/reports/summary?scope=MONTH&month=2026-09',
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const report = await response.json();
    const expected = db
      .prepare(
        `SELECT SUM(total_amount_minor) AS total FROM expenses WHERE business_id=? AND deleted_at IS NULL AND purged_at IS NULL AND status<>'VOIDED'
      AND julianday(purchase_datetime)>=julianday('2026-08-31T12:00:00.000Z') AND julianday(purchase_datetime)<julianday('2026-09-30T11:00:00.000Z')`,
      )
      .get(business).total;
    expect(
      report.rows
        .filter((row) => row.family === 'EXPENSE')
        .reduce((total, row) => total + row.recorded_total_minor, 0),
    ).toBe(expected);
  });

  it('rejects summary totals that would lose integer precision', async () => {
    db.prepare('UPDATE expenses SET total_amount_minor=? WHERE id=?').run(
      Number.MAX_SAFE_INTEGER,
      expense,
    );
    const response = await request('/api/reports/summary');
    expect(response.status, await response.clone().text()).toBe(422);
  });

  const mutations = [
    ['POST', '/api/businesses/:business/expenses'],
    ['PATCH', '/api/businesses/:business/expenses/guessed'],
    ['POST', '/api/businesses/:business/income'],
    ['PATCH', '/api/businesses/:business/income/guessed'],
    ['POST', '/api/businesses/:business/work-sessions'],
    ['PATCH', '/api/businesses/:business/work-sessions/guessed'],
    ['PATCH', '/api/businesses/:business/work-sessions/guessed/fuel-workflow'],
    ['PATCH', '/api/businesses/:business'],
    ['POST', '/api/businesses/:business/legal-entity-periods'],
    ['POST', '/api/general-expenses'],
    ['PATCH', '/api/general-expenses'],
    ['POST', '/api/parking-records'],
    ['PATCH', '/api/parking-records'],
    ['POST', '/api/fuel-records'],
    ['PATCH', '/api/fuel-records'],
    ['POST', '/api/insurance-records'],
    ['PATCH', '/api/insurance-records'],
    ['PATCH', '/api/insurance-allocations'],
    ['POST', '/api/income-records'],
    ['PATCH', '/api/income-records'],
    ['POST', '/api/income-reconciliations'],
    ['POST', '/api/work-sessions'],
    ['PATCH', '/api/work-sessions'],
    ['PATCH', '/api/work-sessions/fuel-workflow'],
    ['POST', '/api/comments'],
    ['PATCH', '/api/record-status'],
    ['POST', '/api/attachments'],
    ['POST', '/api/trash'],
    ['POST', '/api/trash/restore'],
    ['DELETE', '/api/trash'],
    ['POST', '/api/saved-filters'],
    ['PATCH', '/api/saved-filters'],
    ['DELETE', '/api/saved-filters'],
    ['POST', '/api/business-activities'],
    ['PATCH', '/api/business-activities'],
    ['POST', '/api/vehicles'],
    ['PATCH', '/api/vehicles'],
    ['POST', '/api/clients'],
    ['PATCH', '/api/clients'],
    ['POST', '/api/expense-categories'],
    ['PATCH', '/api/expense-categories'],
    ['POST', '/api/invitations'],
    ['POST', '/api/users/disable'],
    ['PATCH', '/api/retention-settings'],
  ];
  it.each(mutations)(
    'denies auditor %s %s before mutation or storage work',
    async (method, path) => {
      const before = db
        .prepare('SELECT count(*) AS count FROM audit_log')
        .get().count;
      expect(
        (
          await request(
            path.replace(':business', business),
            method,
            'auditor-token',
            { role: 'OWNER', scopeType: 'ACCOUNT', businessId: otherBusiness },
          )
        ).status,
      ).toBe(403);
      expect(
        db.prepare('SELECT count(*) AS count FROM audit_log').get().count,
      ).toBe(before);
      expect(env.DOCUMENTS.get).not.toHaveBeenCalled();
    },
  );

  it('separates view/report export/archive permissions and denies administrative reads', async () => {
    for (const path of [
      '/api/users',
      '/api/invitations',
      '/api/retention-settings',
      '/api/exports/status',
      '/api/saved-filters',
      '/api/exports/archive?scope=FULL',
      '/api/reports/export?scope=FULL',
    ]) {
      expect((await request(path)).status, path).toBe(403);
    }
    expect(
      (
        await request(
          '/api/reports/export?scope=FULL',
          'GET',
          'accountant-token',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          '/api/exports/archive?scope=FULL',
          'GET',
          'accountant-token',
        )
      ).status,
    ).toBe(403);
  });

  it('denies future, expired, revoked, and cross-account session access immediately', async () => {
    for (const [update, status] of [
      ["status='DISABLED'", 401],
      ["status='ACTIVE',access_expires_at='2020-01-01T00:00:00.000Z'", 403],
      [
        "access_expires_at='2099-01-01T00:00:00.000Z',access_starts_at='2098-01-01T00:00:00.000Z'",
        403,
      ],
    ]) {
      db.exec(
        `UPDATE business_account_members SET ${update} WHERE user_id='api-auditor'`,
      );
      expect((await request('/api/businesses')).status).toBe(status);
    }
    db.exec(
      "UPDATE sessions SET business_account_id='foreign-account' WHERE user_id='api-auditor'",
    );
    expect((await request('/api/businesses')).status).toBe(401);
  });

  it('permits inline evidence versions but denies downloads and out-of-scope previews', async () => {
    for (const [id, parentId] of [
      ['visible-file', expense],
      ['hidden-file', otherExpense],
    ]) {
      db.prepare(
        `INSERT INTO attachments (id,business_account_id,record_type,record_id,version_group_id,object_key,original_filename,mime_type,file_size,sha256,created_by,created_at,retention_until,purge_eligible_at)
        VALUES (?,?,'EXPENSE',?,?,?,'evidence.png','image/png',3,?,'dev-owner','2026-09-01','2036-03-31','2036-04-01')`,
      ).run(id, account, parentId, id, id, 'a'.repeat(64));
    }
    const metadata = await request(
      `/api/attachments?recordType=EXPENSE&recordId=${expense}`,
    );
    expect(metadata.status, await metadata.clone().text()).toBe(200);
    const attachment = (await metadata.json()).attachments[0];
    expect(attachment.downloadUrl).toBeNull();
    expect(attachment.previewUrl).toBe(
      '/api/attachments/preview?id=visible-file',
    );
    expect(attachment.objectKey).toBeUndefined();
    const preview = await request(attachment.previewUrl);
    expect(preview.status, await preview.clone().text()).toBe(200);
    expect(preview.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(preview.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(
      (await request('/api/attachments/file?id=visible-file')).status,
    ).toBe(403);
    expect(
      (
        await request(
          '/api/attachments/file?id=visible-file',
          'GET',
          'accountant-token',
        )
      ).status,
    ).toBe(200);
    const count = env.DOCUMENTS.get.mock.calls.length;
    expect(
      (await request('/api/attachments/preview?id=hidden-file')).status,
    ).toBe(404);
    expect(env.DOCUMENTS.get).toHaveBeenCalledTimes(count);
  });

  it('shows only permitted record audit and comment history', async () => {
    for (const [id, recordId] of [
      ['permitted', expense],
      ['hidden', otherExpense],
    ]) {
      db.prepare(
        `INSERT INTO comments (id,business_account_id,record_type,record_id,author_id,message,created_at)
        VALUES (?,?,'EXPENSE',?,'dev-accountant',?,'2026-09-01')`,
      ).run(id, account, recordId, id);
      db.prepare(
        `INSERT INTO audit_log (id,business_account_id,user_id,action,entity_type,entity_id,summary,created_at)
        VALUES (?,?,'dev-owner','EXPENSE_UPDATED','EXPENSE',?,?,'2026-09-01')`,
      ).run(id, account, recordId, id);
    }
    const history = await request('/api/audit-log');
    expect(history.status, await history.clone().text()).toBe(200);
    const text = await history.text();
    expect(text).toContain('permitted');
    expect(text).not.toContain('hidden');
    const comments = await request(
      `/api/comments?recordType=EXPENSE&recordId=${expense}`,
    );
    expect(comments.status).toBe(200);
    expect(await comments.text()).toContain('permitted');
    expect(
      (
        await request(
          `/api/comments?recordType=EXPENSE&recordId=${otherExpense}`,
        )
      ).status,
    ).toBe(404);
  });

  it('prevents raw SQL bypasses or writes through a restricted database binding', async () => {
    const context = await loadAuthorizationContext(env.DB, {
      id: 'api-auditor',
      businessAccountId: account,
    });
    const scoped = scopedReadDatabase(env.DB, context);
    expect(
      await scoped
        .prepare('SELECT COUNT(*) AS total FROM expenses WHERE business_id=?')
        .bind(business)
        .bind(otherBusiness)
        .first('total'),
    ).toBe(0);
    for (const sql of [
      'DELETE FROM expenses',
      'SELECT * FROM main.expenses',
      'SELECT * FROM sqlite_master',
      'WITH expenses AS (SELECT 1) SELECT * FROM expenses',
      'SELECT 1; DELETE FROM users',
    ])
      expect(() => scoped.prepare(sql)).toThrow();
    expect(() => scoped.exec('DELETE FROM users')).toThrow();
  });
});
