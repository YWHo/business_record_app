// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createSession,
  requestLoginLink,
} from '../worker/services/authService';
import { requireUser } from '../worker/auth/authorization';
import { acceptAccountantInvitation } from '../worker/services/invitationService';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const migrations = readdirSync(
  new URL('../migrations/', import.meta.url),
).sort();
const upgrade = read('../migrations/0009_auditor_access_foundation.sql');
let db;

function applyUpgrade() {
  db.exec('BEGIN');
  try {
    db.exec(upgrade);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function insertAuditor() {
  db.exec(`INSERT INTO users (id,email,role,status,created_at,updated_at)
    VALUES ('auditor','auditor@example.invalid','AUDITOR','ACTIVE','2026-01-01','2026-01-01')`);
}

function insertMembership(overrides = {}) {
  const values = {
    role: 'AUDITOR',
    status: 'ACTIVE',
    access_starts_at: '2026-04-01T00:00:00.000Z',
    access_expires_at: '2027-04-01T00:00:00.000Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO business_account_members
    (business_account_id,user_id,role,status,created_at,updated_at,access_starts_at,access_expires_at)
    VALUES ('business-account-primary','auditor',?,?,'2026-01-01','2026-01-01',?,?)`,
  ).run(
    values.role,
    values.status,
    values.access_starts_at,
    values.access_expires_at,
  );
}

function scope(overrides = {}, invitation = false) {
  const values = {
    scope_type: 'ACCOUNT',
    business_id: null,
    legal_entity_id: null,
    date_from: null,
    date_to: null,
    business_account_id: 'business-account-primary',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO ${invitation ? 'invitation' : 'membership'}_access_scopes
    (business_account_id,${invitation ? 'invitation_id' : 'user_id'},scope_type,business_id,legal_entity_id,date_from,date_to,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'2026-01-01','2026-01-01')`,
  ).run(
    values.business_account_id,
    invitation ? 'audit-invite' : 'auditor',
    values.scope_type,
    values.business_id,
    values.legal_entity_id,
    values.date_from,
    values.date_to,
  );
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  for (const name of migrations.filter((name) => name < '0009')) {
    db.exec(read(`../migrations/${name}`));
  }
  // Seed the populated pre-upgrade schema; its scope tables do not exist yet.
  db.exec(
    read('./seed-local.sql').replace(
      /^DELETE FROM (invitation|membership)_access_scopes;\r?\n/gm,
      '',
    ),
  );
  db.exec('PRAGMA foreign_keys = ON');
});
afterEach(() => db.close());

describe('auditor schema populated upgrade', () => {
  it('rolls back the upgrade if pre-existing historical references are broken', () => {
    db.exec(`PRAGMA foreign_keys = OFF;
      INSERT INTO sessions VALUES ('orphan-session','missing-user','2099-01-01','2026-01-01','business-account-primary');
      PRAGMA foreign_keys = ON;`);
    expect(() => applyUpgrade()).toThrow();
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='membership_access_scopes'",
        )
        .all(),
    ).toEqual([]);
    expect(db.prepare('SELECT count(*) AS count FROM users').get().count).toBe(
      3,
    );
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM sessions WHERE token_hash='orphan-session'",
        )
        .get().count,
    ).toBe(1);
  });
  it('preserves every existing row and restrictive actor/outbox/session references', () => {
    db.close();
    db = new DatabaseSync(':memory:');
    for (const name of migrations.filter((name) => name < '0006')) {
      db.exec(read(`../migrations/${name}`));
    }
    db.exec(read('./fixtures/pre-business-identity.sql'));
    for (const name of migrations.filter(
      (name) => name >= '0006' && name < '0009',
    )) {
      db.exec(read(`../migrations/${name}`));
    }
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(
      `INSERT INTO sessions VALUES ('preserved-session','legacy-owner','2099-01-01','2026-01-01','business-account-primary');
       INSERT INTO invitations (id,email,role,token_hash,invited_by,expires_at,created_at)
       VALUES ('preserved-invite','legacy-invite@example.invalid','ACCOUNTANT','preserved-invite-hash','legacy-owner','2099-01-01','2026-01-01');
       INSERT INTO development_outbox VALUES ('preserved-outbox','preserved-invite','legacy-invite@example.invalid','/synthetic','2026-01-01');`,
    );
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all();
    const before = Object.fromEntries(
      tables.map(({ name }) => [
        name,
        db.prepare(`SELECT * FROM ${name}`).all(),
      ]),
    );
    applyUpgrade();
    for (const [name, rows] of Object.entries(before)) {
      const columns = db
        .prepare(`PRAGMA table_xinfo(${name})`)
        .all()
        .map(({ name }) => name);
      expect(
        db
          .prepare(
            `SELECT ${
              Object.keys(rows[0] ?? {})
                .filter((key) => columns.includes(key))
                .join(',') || '*'
            } FROM ${name}`,
          )
          .all(),
      ).toEqual(rows);
    }
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('PRAGMA integrity_check').get().integrity_check).toBe(
      'ok',
    );
    expect(() =>
      db.exec("DELETE FROM users WHERE id='legacy-owner'"),
    ).toThrow();
  });

  it('backfills active and disabled existing members without imposing expiry', () => {
    applyUpgrade();
    const members = db.prepare('SELECT * FROM business_account_members').all();
    expect(members).toHaveLength(3);
    for (const member of members) {
      expect(member.access_starts_at).toBeNull();
      expect(member.access_expires_at).toBeNull();
      expect(
        db
          .prepare(
            'SELECT scope_type FROM membership_access_scopes WHERE user_id=?',
          )
          .all(member.user_id),
      ).toEqual([{ scope_type: 'ACCOUNT' }]);
    }
    expect(
      db.prepare('SELECT count(*) AS count FROM invitation_access_scopes').get()
        .count,
    ).toBe(1);
  });

  it('retains active owner uniqueness and case-insensitive email uniqueness', () => {
    applyUpgrade();
    insertAuditor();
    expect(() => insertMembership({ role: 'OWNER' })).toThrow();
    expect(() =>
      db.exec("UPDATE users SET email='OWNER@LOCAL.TEST' WHERE id='auditor'"),
    ).toThrow();
  });

  it('retains lookup indexes and rejects auditor invitations without valid expiry', () => {
    applyUpgrade();
    for (const name of [
      'business_account_members_user_idx',
      'business_account_single_owner_idx',
      'business_account_members_expiry_idx',
      'invitations_email_idx',
      'invitations_expires_at_idx',
      'invitations_account_idx',
      'membership_access_scopes_member_idx',
      'membership_access_scopes_business_idx',
      'membership_access_scopes_entity_idx',
      'invitation_access_scopes_invitation_idx',
    ])
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
          )
          .get(name),
      ).toBeDefined();
    for (const expiry of [null, 'invalid', '2026-02-30T00:00:00.000Z']) {
      expect(() =>
        db
          .prepare(
            `INSERT INTO invitations (id,email,role,token_hash,invited_by,expires_at,created_at,access_expires_at)
        VALUES ('invalid','invalid@example.invalid','AUDITOR','invalid','dev-owner','2099-01-01','2026-01-01',?)`,
          )
          .run(expiry),
      ).toThrow();
    }
  });

  it.each(['INVITED', 'ACTIVE', 'DISABLED', 'EXPIRED'])(
    'stores %s auditor membership without an implicit grant',
    (status) => {
      applyUpgrade();
      insertAuditor();
      insertMembership({ status });
      expect(
        db
          .prepare(
            "SELECT * FROM membership_access_scopes WHERE user_id='auditor'",
          )
          .all(),
      ).toEqual([]);
    },
  );

  it.each([
    { access_expires_at: null },
    { access_expires_at: 'invalid' },
    { access_starts_at: '2026-04-01' },
    { access_expires_at: '2026-02-30T00:00:00.000Z' },
    { access_expires_at: '2026-04-01T00:00:00.000Z' },
    { access_expires_at: '2025-04-01T00:00:00.000Z' },
    { role: 'UNKNOWN' },
    { status: 'UNKNOWN' },
  ])('rejects invalid auditor membership %j', (values) => {
    applyUpgrade();
    insertAuditor();
    expect(() => insertMembership(values)).toThrow();
  });

  it('enforces account-bound membership and invitation scopes and date shapes', () => {
    applyUpgrade();
    insertAuditor();
    insertMembership();
    db.exec(`INSERT INTO invitations
      (id,email,role,token_hash,invited_by,expires_at,created_at,access_expires_at)
      VALUES ('audit-invite','audit@example.invalid','AUDITOR','audit-hash','dev-owner','2026-12-01','2026-01-01','2027-04-01T00:00:00.000Z')`);
    db.exec(`INSERT INTO business_accounts SELECT 'other',display_name,status,plan,subscription_status,created_at,updated_at FROM business_accounts LIMIT 1;
      INSERT INTO businesses (id,business_account_id,name,created_at,updated_at) VALUES ('foreign-business','other','Other','2026-01-01','2026-01-01');
      INSERT INTO business_entities (id,business_account_id,entity_type,created_at,updated_at) VALUES ('foreign-entity','other','OTHER','2026-01-01','2026-01-01');`);
    const business = db
      .prepare('SELECT id FROM businesses WHERE business_account_id=? LIMIT 1')
      .get('business-account-primary').id;
    for (const invitation of [false, true]) {
      scope({}, invitation);
      scope(
        {
          scope_type: 'BUSINESS',
          business_id: business,
          date_from: '2026-04-01',
          date_to: '2027-03-31',
        },
        invitation,
      );
      scope(
        {
          scope_type: 'LEGAL_ENTITY',
          legal_entity_id: 'business-entity-primary',
        },
        invitation,
      );
      for (const invalid of [
        { business_account_id: 'other' },
        { scope_type: 'BUSINESS' },
        { business_id: business },
        { scope_type: 'LEGAL_ENTITY' },
        { scope_type: 'BUSINESS', business_id: 'foreign-business' },
        { scope_type: 'LEGAL_ENTITY', legal_entity_id: 'foreign-entity' },
        {
          scope_type: 'BUSINESS',
          business_id: business,
          legal_entity_id: 'business-entity-primary',
        },
        { date_from: 'garbage' },
        { date_to: '2026-02-30' },
        { date_from: '2027-01-01', date_to: '2026-01-01' },
      ])
        expect(() => scope(invalid, invitation)).toThrow();
    }
    expect(() =>
      db.exec("DELETE FROM business_account_members WHERE user_id='auditor'"),
    ).toThrow();
  });

  it('allows repeated local/demo seeding without stale scopes or broken references', () => {
    applyUpgrade();
    for (const name of [
      './seed-local.sql',
      './seed-demo.sql',
      './seed-demo.sql',
      './seed-local.sql',
    ]) {
      db.exec(read(name));
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(
        db
          .prepare('SELECT count(*) AS count FROM membership_access_scopes')
          .get().count,
      ).toBe(
        db
          .prepare('SELECT count(*) AS count FROM business_account_members')
          .get().count,
      );
    }
  });

  it('keeps persisted auditors out of sessions, login links, and accountant acceptance', async () => {
    applyUpgrade();
    insertAuditor();
    insertMembership();
    const hash = (value) => createHash('sha256').update(value).digest('hex');
    db.prepare(
      `INSERT INTO sessions VALUES (?,'auditor','2099-01-01','2026-01-01','business-account-primary')`,
    ).run(hash('staged-session'));
    db.prepare(
      `INSERT INTO invitations (id,email,role,token_hash,invited_by,expires_at,created_at,access_expires_at)
      VALUES ('audit-invite','auditor@example.invalid','AUDITOR',?,'dev-owner','2099-01-01','2026-01-01','2099-01-01T00:00:00.000Z')`,
    ).run(hash('staged-invitation'));
    const env = {
      APP_ENV: 'local',
      DB: {
        prepare(sql) {
          const statement = db.prepare(sql);
          return {
            bind(...bindings) {
              return {
                first: () =>
                  Promise.resolve(statement.get(...bindings) ?? null),
              };
            },
          };
        },
      },
    };
    await expect(createSession(env, 'auditor')).rejects.toMatchObject({
      status: 401,
    });
    await requestLoginLink(env, 'auditor@example.invalid');
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM authentication_challenges WHERE user_id='auditor'",
        )
        .get().count,
    ).toBe(0);
    await expect(
      requireUser(
        new Request('http://localhost/api/auth/me', {
          headers: { cookie: 'br_session=staged-session' },
        }),
        env,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      acceptAccountantInvitation(
        env,
        'auditor@example.invalid',
        'staged-invitation',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      db
        .prepare("SELECT accepted_at FROM invitations WHERE id='audit-invite'")
        .get().accepted_at,
    ).toBeNull();
    expect(
      db
        .prepare(
          "SELECT role FROM business_account_members WHERE user_id='auditor'",
        )
        .get().role,
    ).toBe('AUDITOR');
  });
});
