// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import app from '../worker/index';
import { loginToStaging } from '../worker/routes/stagingAuth';
import { stagingFixtureSql } from './staging-fixture.mjs';
import {
  createStagingCredentialSecret,
  stagingIdentitySyncSql,
} from './staging-identities.mjs';
import { createStagingVerifier } from '../shared/staging-credentials.mjs';

const password = 'fictional-test-password-2026';
let secret;
let syncSql;
let db;
let env;
let limiterKeys;
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
beforeAll(async () => {
  secret = await createStagingCredentialSecret(
    JSON.stringify({
      identities: ['OWNER', 'ACCOUNTANT', 'AUDITOR'].map((role) => ({
        role,
        email: `${role.toLowerCase()}@staging.example.invalid`,
        password,
      })),
    }),
  );
  syncSql = await stagingIdentitySyncSql(secret);
});
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(
      new URL(`../migrations/${name}`, import.meta.url),
      'utf8',
    );
    db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
  }
  db.exec(`BEGIN;${stagingFixtureSql('provision')}COMMIT;`);
  db.exec(`BEGIN;${syncSql}COMMIT;`);
  limiterKeys = [];
  const limiter = {
    limit: ({ key }) => {
      limiterKeys.push(key);
      return Promise.resolve({ success: true });
    },
  };
  env = {
    APP_ENV: 'staging',
    APP_ORIGIN: 'https://staging.example.invalid',
    STAGING_AUTH_CREDENTIALS: secret,
    TURNSTILE_REQUIRED: 'false',
    TURNSTILE_SECRET_KEY: 'synthetic-test-only-key',
    AUTH_RATE_LIMITER: limiter,
    STAGING_PASSWORD_RATE_LIMITER: limiter,
    DB: { prepare: statement },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          success: true,
          action: 'login',
          hostname: 'staging.example.invalid',
        }),
      ),
    ),
  );
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
});
function login(role = 'OWNER', overrides = {}, headers = {}) {
  return app.fetch(
    new Request(`${env.APP_ORIGIN}/api/auth/staging-login`, {
      method: 'POST',
      headers: {
        origin: env.APP_ORIGIN,
        'content-type': 'application/json',
        'cf-connecting-ip': '192.0.2.30',
        ...headers,
      },
      body: JSON.stringify({
        email: `${role.toLowerCase()}@staging.example.invalid`,
        password,
        turnstileToken: 'synthetic-challenge',
        ...overrides,
      }),
    }),
    env,
  );
}
function cookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0];
}
function get(path, token) {
  return app.fetch(
    new Request(`${env.APP_ORIGIN}${path}`, { headers: { cookie: token } }),
    env,
  );
}

it.each(['OWNER', 'ACCOUNTANT', 'AUDITOR'])(
  'signs in the provisioned %s with a hashed session and fresh real scope',
  async (role) => {
    const response = await login(role);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toMatch(
      /HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800; Secure/,
    );
    const stored = db
      .prepare('SELECT token_hash,staging_credential_version FROM sessions')
      .get();
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.staging_credential_version).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.token_hash).not.toBe(cookie(response).split('=')[1]);
    const me = await get('/api/auth/me', cookie(response));
    expect(me.status).toBe(200);
    const user = (await me.json()).user;
    expect(user.role).toBe(role);
    expect(JSON.stringify(user)).not.toMatch(
      /verifier|credential_fingerprint|stagingCredentialVersion/,
    );
    const businesses = await get('/api/businesses', cookie(response));
    expect((await businesses.json()).businesses).toHaveLength(
      role === 'AUDITOR' ? 1 : 4,
    );
    expect(limiterKeys).toHaveLength(3);
    expect(limiterKeys.every((key) => /^[a-f0-9]{64}$/.test(key))).toBe(true);
  },
);
it('returns the same failure for unknown emails and incorrect passwords without creating sessions', async () => {
  const unknown = await login('OWNER', {
    email: 'unknown@staging.example.invalid',
  });
  const wrong = await login('OWNER', {
    password: 'incorrect-test-password-2026',
  });
  expect(unknown.status).toBe(401);
  expect(wrong.status).toBe(401);
  expect(await unknown.json()).toEqual(await wrong.json());
  expect(cookie(unknown)).toBeUndefined();
  expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count).toBe(
    0,
  );
});
it.each([
  "UPDATE users SET status='DISABLED' WHERE id='staging-auditor'",
  "UPDATE business_account_members SET status='DISABLED' WHERE user_id='staging-auditor'",
  "UPDATE business_account_members SET status='EXPIRED' WHERE user_id='staging-auditor'",
  "UPDATE business_account_members SET access_expires_at='2020-01-01T00:00:00.000Z' WHERE user_id='staging-auditor'",
  "UPDATE business_account_members SET access_starts_at='2090-01-01T00:00:00.000Z',access_expires_at='2091-01-01T00:00:00.000Z' WHERE user_id='staging-auditor'",
  "DELETE FROM membership_access_scopes WHERE user_id='staging-auditor'",
  "UPDATE business_account_members SET role='ACCOUNTANT' WHERE user_id='staging-auditor'",
  "UPDATE business_accounts SET status='SUSPENDED'",
])('does not repair access during login: %s', async (sql) => {
  db.exec(sql);
  const response = await login('AUDITOR');
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    error: 'Unable to sign in with those details.',
  });
  expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count).toBe(
    0,
  );
});
it('rejects revoked, expired and out-of-scope access after a successful Auditor login', async () => {
  const token = cookie(await login('AUDITOR'));
  expect(
    (
      await get(
        '/api/businesses/business-demo-activity-delivery/expenses',
        token,
      )
    ).status,
  ).toBe(404);
  db.exec(
    "UPDATE business_account_members SET access_expires_at='2020-01-01T00:00:00.000Z' WHERE user_id='staging-auditor'",
  );
  expect([401, 403]).toContain((await get('/api/businesses', token)).status);
  db.exec(
    "UPDATE business_account_members SET status='DISABLED' WHERE user_id='staging-auditor'",
  );
  expect((await get('/api/businesses', token)).status).toBe(401);
});
it('credential rotation invalidates old sessions immediately and sync revokes them without renewing Auditor access', async () => {
  const ownerCookie = cookie(await login('OWNER'));
  const accountantCookie = cookie(await login('ACCOUNTANT'));
  const rotated = JSON.parse(secret);
  rotated.identities[0].verifier = await createStagingVerifier(
    'different-strong-test-password',
  );
  env.STAGING_AUTH_CREDENTIALS = JSON.stringify(rotated);
  expect((await get('/api/auth/me', ownerCookie)).status).toBe(401);
  expect((await get('/api/auth/me', accountantCookie)).status).toBe(200);
  expect(
    (await login('OWNER', { password: 'different-strong-test-password' }))
      .status,
  ).toBe(401);
  db.exec(
    "UPDATE business_account_members SET status='EXPIRED',access_expires_at='2020-01-01T00:00:00.000Z' WHERE user_id='staging-auditor'",
  );
  const sql = await stagingIdentitySyncSql(env.STAGING_AUTH_CREDENTIALS);
  db.exec(`BEGIN;${sql}COMMIT;`);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM sessions WHERE user_id='staging-owner'",
      )
      .get().count,
  ).toBe(0);
  expect(
    db
      .prepare(
        "SELECT status FROM business_account_members WHERE user_id='staging-auditor'",
      )
      .get().status,
  ).toBe('EXPIRED');
  expect(
    (await login('OWNER', { password: 'different-strong-test-password' }))
      .status,
  ).toBe(200);
});
it('idempotent sync preserves valid sessions and membership status, scope and expiry', async () => {
  const token = cookie(await login('AUDITOR'));
  const before = db
    .prepare(
      "SELECT * FROM business_account_members WHERE user_id='staging-auditor'",
    )
    .get();
  db.exec(`BEGIN;${syncSql}COMMIT;`);
  expect(
    db
      .prepare(
        "SELECT * FROM business_account_members WHERE user_id='staging-auditor'",
      )
      .get(),
  ).toEqual(before);
  expect((await get('/api/auth/me', token)).status).toBe(200);
});
it('temporary throttling and failed challenges never disable an identity', async () => {
  env.STAGING_PASSWORD_RATE_LIMITER = {
    limit: () => Promise.resolve({ success: false }),
  };
  const limited = await login();
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('60');
  expect(fetch).not.toHaveBeenCalled();
  env.STAGING_PASSWORD_RATE_LIMITER = env.AUTH_RATE_LIMITER;
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: false }));
  expect((await login()).status).toBe(400);
  expect(
    db.prepare("SELECT status FROM users WHERE id='staging-owner'").get()
      .status,
  ).toBe('ACTIVE');
  expect((await login()).status).toBe(200);
});
it('bounds concurrent native password hashing and permits a subsequent attempt', async () => {
  const responses = await Promise.all([login(), login()]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 503,
  ]);
  const busy = responses.find((response) => response.status === 503);
  expect(busy.headers.get('retry-after')).toBe('1');
  expect((await login()).status).toBe(200);
});
it('fails closed before hashing when the password-attempt limiter is missing', async () => {
  delete env.STAGING_PASSWORD_RATE_LIMITER;
  expect((await login()).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
  expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count).toBe(
    0,
  );
});
it('production rejects the real password endpoint even with staging secrets and forged role headers', async () => {
  env.APP_ENV = 'production';
  const response = await login(
    'OWNER',
    { role: 'OWNER' },
    { 'x-demo-role': 'OWNER', 'x-local-role': 'OWNER' },
  );
  expect(response.status).toBe(404);
  expect(response.headers.has('set-cookie')).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count).toBe(
    0,
  );
});
it.each(['production', 'local', 'demo'])(
  'rejects password login in %s before touching input, limits, hashing or D1',
  async (environment) => {
    const protectedEnv = new Proxy(
      { APP_ENV: environment },
      {
        get(target, key) {
          if (key === 'APP_ENV') {
            return target.APP_ENV;
          }
          throw new Error('No other binding may be touched');
        },
      },
    );
    await expect(
      loginToStaging(
        new Request('https://localhost/api/auth/staging-login', {
          method: 'POST',
          headers: { 'x-demo-role': 'OWNER' },
          body: 'not-json',
        }),
        protectedEnv,
      ),
    ).rejects.toMatchObject({ status: 404 });
  },
);
it.each([undefined, '{}', '{"version":1,"identities":[]}'])(
  'fails closed for missing or malformed backend secret %s',
  async (value) => {
    env.STAGING_AUTH_CREDENTIALS = value;
    expect((await login()).status).toBe(503);
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
    ).toBe(0);
  },
);
it('rejects oversized actual bodies, role claims and missing origin without establishing sessions', async () => {
  const oversized = await app.fetch(
    new Request(`${env.APP_ORIGIN}/api/auth/staging-login`, {
      method: 'POST',
      headers: { origin: env.APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'x'.repeat(5000) }),
    }),
    env,
  );
  expect(oversized.status).toBe(413);
  expect((await login('OWNER', { role: 'OWNER' })).status).toBe(400);
  expect(
    (await login('OWNER', {}, { origin: 'https://attacker.invalid' })).status,
  ).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
  expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count).toBe(
    0,
  );
});
it('logging out revokes the password session and production never accepts a staging session', async () => {
  const token = cookie(await login());
  const production = { ...env, APP_ENV: 'production' };
  expect(
    (
      await app.fetch(
        new Request(`${env.APP_ORIGIN}/api/auth/me`, {
          headers: { cookie: token },
        }),
        production,
      )
    ).status,
  ).toBe(401);
  const response = await app.fetch(
    new Request(`${env.APP_ORIGIN}/api/auth/logout`, {
      method: 'POST',
      headers: { origin: env.APP_ORIGIN, cookie: token },
    }),
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  expect((await get('/api/auth/me', token)).status).toBe(401);
});
