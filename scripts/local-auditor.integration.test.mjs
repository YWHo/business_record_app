// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../worker/index';

let db;
let env;
function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}
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
async function login(origin = 'http://localhost') {
  return app.fetch(
    new Request(`${origin}/api/dev/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.APP_ENV === 'production' ? { origin: env.APP_ORIGIN } : {}),
      },
      body: JSON.stringify({ email: 'auditor@local.test' }),
    }),
    env,
  );
}
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = read('../migrations/' + name);
    db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
  }
  db.exec(read('./seed-local.sql'));
  db.exec(read('./seed-local-showcase.sql'));
  db.exec(read('./seed-local-auditor.sql'));
  env = {
    APP_ENV: 'local',
    LOCAL_AUTH_ENABLED: 'true',
    APP_ORIGIN: 'http://localhost',
    DB: { prepare: statement },
  };
});
afterEach(() => db.close());

describe('seeded local auditor', () => {
  it('logs in with a real scoped session and denies other businesses and writes', async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect((await response.json()).user.role).toBe('AUDITOR');
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const get = (path) =>
      app.fetch(
        new Request(`http://localhost${path}`, { headers: { cookie } }),
        env,
      );
    const me = await (await get('/api/auth/me')).json();
    expect(me.user.access.scopes).toEqual([
      {
        scopeType: 'BUSINESS',
        label: 'IT Contracting',
        dateFrom: null,
        dateTo: null,
      },
    ]);
    const remaining = Date.parse(me.user.access.accessExpiresAt) - Date.now();
    expect(remaining).toBeGreaterThan(29 * 86400000);
    expect(remaining).toBeLessThanOrEqual(30 * 86400000);
    const directory = await (await get('/api/businesses')).json();
    expect(directory.businesses.map((business) => business.id)).toEqual([
      'business-activity-contracting',
    ]);
    expect(
      (await get('/api/businesses/business-activity-delivery/expenses')).status,
    ).toBe(404);
    expect((await get('/api/reports/export?scope=FULL')).status).toBe(403);
    expect(
      (
        await app.fetch(
          new Request('http://localhost/api/comments', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: '{}',
          }),
          env,
        )
      ).status,
    ).toBe(403);
  });

  it('does not reset expiry, deleted scopes, disabled membership or source records when reseeded', () => {
    const expiry = db
      .prepare(
        "SELECT access_expires_at FROM business_account_members WHERE user_id='dev-auditor'",
      )
      .get().access_expires_at;
    const before = db
      .prepare('SELECT COUNT(*) AS count FROM expenses')
      .get().count;
    db.exec(read('./seed-local-auditor.sql'));
    expect(
      db
        .prepare(
          "SELECT access_expires_at FROM business_account_members WHERE user_id='dev-auditor'",
        )
        .get().access_expires_at,
    ).toBe(expiry);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM membership_access_scopes WHERE user_id='dev-auditor'",
        )
        .get().count,
    ).toBe(1);
    db.exec(
      "DELETE FROM membership_access_scopes WHERE user_id='dev-auditor'; UPDATE business_account_members SET status='DISABLED' WHERE user_id='dev-auditor';",
    );
    db.exec(read('./seed-local-auditor.sql'));
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM membership_access_scopes WHERE user_id='dev-auditor'",
        )
        .get().count,
    ).toBe(0);
    expect(
      db
        .prepare(
          "SELECT status FROM business_account_members WHERE user_id='dev-auditor'",
        )
        .get().status,
    ).toBe('DISABLED');
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM expenses').get().count,
    ).toBe(before);
  });

  it.each(['expired', 'disabled', 'missing scope'])(
    'cannot log in after access becomes %s',
    async (state) => {
      if (state === 'expired') {
        db.exec(
          "UPDATE business_account_members SET access_expires_at='2020-01-01T00:00:00.000Z' WHERE user_id='dev-auditor'",
        );
      } else if (state === 'disabled') {
        db.exec(
          "UPDATE business_account_members SET status='DISABLED' WHERE user_id='dev-auditor'",
        );
      } else {
        db.exec(
          "DELETE FROM membership_access_scopes WHERE user_id='dev-auditor'",
        );
      }
      expect((await login()).status).toBe(401);
      expect(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM sessions WHERE user_id='dev-auditor'",
          )
          .get().count,
      ).toBe(0);
    },
  );

  it.each(['https://remote.example', 'https://localhost'])(
    'keeps the local helper guard for %s',
    async (origin) => {
      if (origin === 'https://localhost') {
        env.APP_ENV = 'production';
        env.APP_ORIGIN = origin;
      }
      expect((await login(origin)).status).toBe(404);
    },
  );
});
