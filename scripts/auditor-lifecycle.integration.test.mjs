// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import app from '../worker/index';
import { createSession } from '../worker/services/authService';

let db, env, business, otherBusiness, batchQueue;
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
function batch(statements) {
  const result = batchQueue.then(async () => {
    db.exec('BEGIN');
    try {
      const results = [];
      for (const item of statements) results.push(await item.run());
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  batchQueue = result.catch(() => undefined);
  return result;
}
function grant(overrides = {}) {
  return {
    email: 'reviewer@example.invalid',
    accessStartsAt: null,
    accessExpiresAt: '2099-01-01T00:00:00.000Z',
    scopes: [
      {
        scopeType: 'BUSINESS',
        businessId: business,
        legalEntityId: null,
        dateFrom: '2026-04-01',
        dateTo: '2027-03-31',
      },
    ],
    note: 'Independent review',
    ...overrides,
  };
}
async function request(path, method = 'GET', data = {}, token = 'owner-token') {
  return app.fetch(
    new Request(`${env.APP_ORIGIN}${path}`, {
      method,
      headers: {
        cookie: `br_session=${token}`,
        'content-type': 'application/json',
        origin: env.APP_ORIGIN,
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(data) }),
    }),
    env,
  );
}
async function invite(values = grant()) {
  const response = await request('/api/auditor-invitations', 'POST', values);
  expect(response.status, await response.clone().text()).toBe(201);
  const invitation = (await response.json()).invitation;
  return {
    ...invitation,
    token: new URL(invitation.invitationUrl).searchParams.get('token'),
  };
}
async function activate(values = grant()) {
  const invitation = await invite(values);
  const response = await request('/api/invitations/accept', 'POST', {
    email: invitation.email,
    token: invitation.token,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(response.headers.get('set-cookie')).toBeNull();
  const id = db
    .prepare('SELECT id FROM users WHERE email=?')
    .get(invitation.email).id;
  return { id, invitation };
}
async function details(id) {
  const response = await request(`/api/auditor-access/${id}`);
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()).member;
}
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  batchQueue = Promise.resolve();
  for (const name of readdirSync(new URL('../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = read('../migrations/' + name);
    db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
  }
  db.exec(read('./seed-local.sql'));
  [business, otherBusiness] = db
    .prepare('SELECT id FROM businesses ORDER BY id LIMIT 2')
    .all()
    .map((row) => row.id);
  for (const [token, id] of [
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
  const limiter = { limit: async () => ({ success: true }) };
  env = {
    APP_ENV: 'local',
    APP_ORIGIN: 'http://localhost',
    LOCAL_AUTH_ENABLED: 'true',
    DB: { prepare: statement, batch },
    INVITE_RATE_LIMITER: limiter,
    AUTH_RATE_LIMITER: limiter,
    EXPENSIVE_RATE_LIMITER: limiter,
  };
});
afterEach(async () => {
  await batchQueue;
  db.close();
  vi.unstubAllGlobals();
});

describe('auditor invitation and membership lifecycle', () => {
  it('rolls back identity, scopes and token consumption if activation audit fails', async () => {
    const invitation = await invite();
    db.exec(`CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_log
      WHEN NEW.action='AUDITOR_ACTIVATED' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`);
    const response = await request('/api/invitations/accept', 'POST', {
      email: invitation.email,
      token: invitation.token,
    });
    expect(response.status).toBe(500);
    expect(
      db.prepare('SELECT id FROM users WHERE email=?').get(invitation.email),
    ).toBeUndefined();
    expect(
      db
        .prepare('SELECT accepted_at FROM invitations WHERE id=?')
        .get(invitation.id).accepted_at,
    ).toBeNull();
    expect(db.prepare('SELECT * FROM access_control_guards').all()).toEqual([]);
    db.exec('DROP TRIGGER synthetic_audit_failure');
    expect(
      (
        await request('/api/invitations/accept', 'POST', {
          email: invitation.email,
          token: invitation.token,
        })
      ).status,
    ).toBe(200);
  });

  it('allows a single winner when the same invitation is accepted concurrently', async () => {
    const invitation = await invite();
    const results = await Promise.all(
      [1, 2].map(() =>
        request('/api/invitations/accept', 'POST', {
          email: invitation.email,
          token: invitation.token,
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    expect(
      db
        .prepare('SELECT COUNT(*) AS count FROM users WHERE email=?')
        .get(invitation.email).count,
    ).toBe(1);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_log WHERE action='AUDITOR_ACTIVATED'",
        )
        .get().count,
    ).toBe(1);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('copies only invited grants on acceptance, hashes tokens, audits activation, and rejects replay', async () => {
    const invitation = await invite();
    const stored = db
      .prepare('SELECT * FROM invitations WHERE id=?')
      .get(invitation.id);
    expect(stored.token_hash).toBe(
      createHash('sha256').update(invitation.token).digest('hex'),
    );
    expect(stored.role).toBe('AUDITOR');
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE email='reviewer@example.invalid'",
        )
        .get().count,
    ).toBe(0);
    expect(
      (
        await request('/api/invitations/accept', 'POST', {
          email: 'wrong@example.invalid',
          token: invitation.token,
        })
      ).status,
    ).toBe(400);
    const response = await request('/api/invitations/accept', 'POST', {
      email: invitation.email,
      token: invitation.token,
      role: 'OWNER',
      scopes: [{ scopeType: 'ACCOUNT' }],
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    const user = db
      .prepare('SELECT id FROM users WHERE email=?')
      .get(invitation.email);
    const member = await details(user.id);
    expect(member.scopes).toEqual(grant().scopes);
    expect(member.accessExpiresAt).toBe(grant().accessExpiresAt);
    expect(
      db
        .prepare('SELECT role FROM business_account_members WHERE user_id=?')
        .get(user.id).role,
    ).toBe('AUDITOR');
    expect(
      (
        await request('/api/invitations/accept', 'POST', {
          email: invitation.email,
          token: invitation.token,
        })
      ).status,
    ).toBe(400);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_log WHERE action='AUDITOR_ACTIVATED'",
        )
        .get().count,
    ).toBe(1);
    expect(db.prepare('SELECT * FROM access_control_guards').all()).toEqual([]);
  });

  it('supports normal email sign-in after acceptance and keeps scope on the session', async () => {
    const { id } = await activate();
    const login = await request(
      '/api/auth/login',
      'POST',
      { email: 'reviewer@example.invalid' },
      '',
    );
    expect(login.status).toBe(200);
    const outbox = db
      .prepare(
        'SELECT action_url FROM development_auth_outbox WHERE recipient_email=?',
      )
      .get('reviewer@example.invalid');
    const token = new URL(outbox.action_url).searchParams.get('token');
    const verified = await request('/api/auth/verify', 'POST', { token }, '');
    expect(verified.status, await verified.clone().text()).toBe(200);
    const cookie = verified.headers.get('set-cookie');
    expect(cookie).toContain('HttpOnly');
    const sessionToken = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
    const directory = await request('/api/businesses', 'GET', {}, sessionToken);
    expect((await directory.json()).businesses.map((row) => row.id)).toEqual([
      business,
    ]);
    expect(
      db
        .prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id=?')
        .get(id).count,
    ).toBe(1);
  });

  it('allows scheduled acceptance but blocks login until the access start', async () => {
    const { id } = await activate(
      grant({ accessStartsAt: '2098-01-01T00:00:00.000Z' }),
    );
    expect((await details(id)).accessState).toBe('SCHEDULED');
    await expect(createSession(env, id)).rejects.toMatchObject({ status: 401 });
    expect(
      (
        await request('/api/auth/login', 'POST', {
          email: 'reviewer@example.invalid',
        })
      ).status,
    ).toBe(200);
    expect(
      db
        .prepare(
          'SELECT COUNT(*) AS count FROM authentication_challenges WHERE user_id=?',
        )
        .get(id).count,
    ).toBe(0);
  });

  it('atomically changes scope/window, revokes sessions, and rejects stale edits without partial writes', async () => {
    const { id } = await activate();
    const session = await createSession(env, id);
    const before = await details(id);
    const changed = grant({
      scopes: [{ ...grant().scopes[0], businessId: otherBusiness }],
      accessExpiresAt: '2099-02-01T00:00:00.000Z',
      revision: before.revision,
    });
    const response = await request(
      `/api/auditor-access/${id}`,
      'PATCH',
      changed,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await request('/api/businesses', 'GET', {}, session)).status).toBe(
      401,
    );
    const after = await details(id);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.scopes[0].businessId).toBe(otherBusiness);
    const audits = db
      .prepare('SELECT COUNT(*) AS count FROM audit_log')
      .get().count;
    expect(
      (
        await request(`/api/auditor-access/${id}`, 'PATCH', {
          ...grant(),
          revision: before.revision,
        })
      ).status,
    ).toBe(409);
    expect(await details(id)).toEqual(after);
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count,
    ).toBe(audits);
    expect(db.prepare('SELECT * FROM access_control_guards').all()).toEqual([]);
    const events = db
      .prepare(
        'SELECT action,changed_fields_json FROM audit_log WHERE entity_id=?',
      )
      .all(id);
    expect(events.map((row) => row.action)).toContain('AUDITOR_SCOPE_CHANGED');
    expect(events.map((row) => row.action)).toContain('AUDITOR_EXPIRY_CHANGED');
    expect(
      events.some(
        (row) =>
          JSON.parse(row.changed_fields_json)?.before?.scopes?.[0]
            ?.businessId === business,
      ),
    ).toBe(true);
  });

  it('expires scheduled access without invalidating the retained configured window', async () => {
    const { id } = await activate(
      grant({ accessStartsAt: '2098-01-01T00:00:00.000Z' }),
    );
    const member = await details(id);
    const response = await request(`/api/auditor-access/${id}/expire`, 'POST', {
      revision: member.revision,
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await details(id)).status).toBe('EXPIRED');
    expect((await details(id)).accessStartsAt).toBe(member.accessStartsAt);
  });

  it('revokes access immediately and requires explicit owner intent to restore it', async () => {
    const { id } = await activate();
    const token = await createSession(env, id);
    const before = await details(id);
    expect(
      (
        await request(`/api/auditor-access/${id}/revoke`, 'POST', {
          revision: before.revision,
        })
      ).status,
    ).toBe(200);
    expect((await request('/api/businesses', 'GET', {}, token)).status).toBe(
      401,
    );
    let member = await details(id);
    expect(member.status).toBe('DISABLED');
    expect(
      (
        await request(`/api/auditor-access/${id}`, 'PATCH', {
          ...grant(),
          revision: member.revision,
        })
      ).status,
    ).toBe(200);
    member = await details(id);
    expect(member.status).toBe('DISABLED');
    await expect(createSession(env, id)).rejects.toMatchObject({ status: 401 });
    expect(
      (
        await request(`/api/auditor-access/${id}`, 'PATCH', {
          ...grant(),
          revision: member.revision,
          restoreAccess: true,
        })
      ).status,
    ).toBe(200);
    expect((await details(id)).status).toBe('ACTIVE');
    expect(await createSession(env, id)).toBeTruthy();
  });

  it('revokes a pending invitation and retains its history instead of deleting references', async () => {
    const invitation = await invite();
    expect(
      (
        await request(
          `/api/auditor-invitations/${invitation.id}/revoke`,
          'POST',
          { revision: 1 },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request('/api/invitations/accept', 'POST', {
          email: invitation.email,
          token: invitation.token,
        })
      ).status,
    ).toBe(400);
    const directory = await (await request('/api/auditor-access')).json();
    expect(directory.invitations[0].status).toBe('REVOKED');
    expect(directory.members).toEqual([]);
    expect(
      db
        .prepare(
          'SELECT COUNT(*) AS count FROM invitation_access_scopes WHERE invitation_id=?',
        )
        .get(invitation.id).count,
    ).toBe(1);
  });

  it('never converts an existing owner/membership or reactivates a disabled identity through a token', async () => {
    const invitation = await invite();
    db.prepare(
      "INSERT INTO users (id,email,role,status,created_at,updated_at) VALUES ('disabled-target',?,'ACCOUNTANT','DISABLED','2026-01-01','2026-01-01')",
    ).run(invitation.email);
    expect(
      (
        await request('/api/invitations/accept', 'POST', {
          email: invitation.email,
          token: invitation.token,
        })
      ).status,
    ).toBe(400);
    expect(
      db
        .prepare('SELECT accepted_at FROM invitations WHERE id=?')
        .get(invitation.id).accepted_at,
    ).toBeNull();
    expect(
      (
        await request(
          '/api/auditor-invitations',
          'POST',
          grant({ email: 'owner@local.test' }),
        )
      ).status,
    ).toBe(409);
    db.prepare(
      `INSERT INTO invitations (id,business_account_id,email,role,token_hash,invited_by,expires_at,created_at)
      VALUES ('stale-owner',?,'owner@local.test','ACCOUNTANT',?,'dev-owner','2099-01-01','2026-01-01')`,
    ).run(
      account,
      createHash('sha256').update('stale-owner-token').digest('hex'),
    );
    expect(
      (
        await request('/api/invitations/accept', 'POST', {
          email: 'owner@local.test',
          token: 'stale-owner-token',
        })
      ).status,
    ).toBe(400);
    expect(
      db
        .prepare(
          "SELECT role FROM business_account_members WHERE user_id='dev-owner'",
        )
        .get().role,
    ).toBe('OWNER');
  });

  it('preserves accountant invitations and their account-wide grant without changing global identity', async () => {
    const response = await request('/api/invitations', 'POST', {
      email: 'new-accountant@example.invalid',
    });
    expect(response.status, await response.clone().text()).toBe(201);
    const invitation = (await response.json()).invitation;
    const token = new URL(invitation.invitationUrl).searchParams.get('token');
    const accepted = await request('/api/invitations/accept', 'POST', {
      email: invitation.email,
      token,
    });
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    const id = db
      .prepare('SELECT id FROM users WHERE email=?')
      .get(invitation.email).id;
    expect(
      db
        .prepare(
          'SELECT scope_type FROM membership_access_scopes WHERE user_id=?',
        )
        .all(id),
    ).toEqual([{ scope_type: 'ACCOUNT' }]);
    expect(
      (
        await request('/api/invitations/accept', 'POST', {
          email: invitation.email,
          token,
        })
      ).status,
    ).toBe(400);
  });

  it.each([
    { role: 'OWNER' },
    { accessExpiresAt: null },
    { accessStartsAt: '2099-01-01' },
    { accessExpiresAt: '2000-01-01T00:00:00.000Z' },
    { accessStartsAt: '2099-02-01T00:00:00.000Z' },
    { scopes: [] },
    { scopes: Array.from({ length: 17 }, () => ({ scopeType: 'ACCOUNT' })) },
    { scopes: [{ scopeType: 'BUSINESS', businessId: 'foreign' }] },
    { scopes: [{ scopeType: 'ACCOUNT', dateFrom: '2026-02-30' }] },
    {
      scopes: [
        { scopeType: 'ACCOUNT', dateFrom: '2027-01-01', dateTo: '2026-01-01' },
      ],
    },
    { scopes: [{ scopeType: 'ACCOUNT' }, { scopeType: 'ACCOUNT' }] },
  ])(
    'rejects malformed grants %j before writing an invitation',
    async (overrides) => {
      const count = db
        .prepare('SELECT COUNT(*) AS count FROM invitations')
        .get().count;
      expect(
        (await request('/api/auditor-invitations', 'POST', grant(overrides)))
          .status,
      ).toBe(400);
      expect(
        db.prepare('SELECT COUNT(*) AS count FROM invitations').get().count,
      ).toBe(count);
    },
  );

  it('rejects self-administration and owner/foreign target tampering', async () => {
    const { id } = await activate();
    const token = await createSession(env, id);
    for (const actor of ['accountant-token', token])
      for (const [path, method, body] of [
        ['/api/auditor-access', 'GET', {}],
        ['/api/auditor-invitations', 'POST', grant()],
        [`/api/auditor-access/${id}`, 'PATCH', { ...grant(), revision: 1 }],
        [`/api/auditor-access/${id}/revoke`, 'POST', { revision: 1 }],
      ])
        expect((await request(path, method, body, actor)).status).toBe(403);
    expect(
      (
        await request('/api/auditor-access/dev-owner/revoke', 'POST', {
          revision: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request('/api/auditor-access/missing', 'PATCH', {
          ...grant(),
          revision: 1,
        })
      ).status,
    ).toBe(404);
  });

  it('revokes unaccepted delivery failures without breaking restrictive scope references', async () => {
    env = {
      ...env,
      APP_ENV: 'production',
      APP_ORIGIN: 'https://records.example.invalid',
      EMAIL_DELIVERY_URL: 'https://relay.example.invalid',
      EMAIL_DELIVERY_BEARER_TOKEN: 'synthetic-secret',
      EMAIL_FROM: 'records@example.invalid',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 })),
    );
    const response = await request('/api/auditor-invitations', 'POST', grant());
    expect(response.status).toBe(503);
    expect(
      db
        .prepare(
          "SELECT revoked_at FROM invitations WHERE email='reviewer@example.invalid'",
        )
        .get().revoked_at,
    ).not.toBeNull();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM access_control_guards').all()).toEqual([]);
  });
});
