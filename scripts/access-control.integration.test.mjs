// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canAccessBusiness,
  canAccessLegalEntity,
  canAccessRecord,
  loadAuthorizationContext,
  recordAccessPredicate,
  maximumAccessScopes,
} from '../worker/services/accessControlService';

const now = new Date('2026-11-10T00:00:00.000Z');
const account = 'business-account-primary';
const actor = { id: 'scope-auditor', businessAccountId: account };
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
let db;
let d1;
let business;
let anotherBusiness;

function addScope({
  type = 'BUSINESS',
  businessId = business,
  entityId = null,
  from = null,
  to = null,
} = {}) {
  db.prepare(
    `INSERT INTO membership_access_scopes
    (business_account_id,user_id,scope_type,business_id,legal_entity_id,date_from,date_to,created_at,updated_at)
    VALUES (?,'scope-auditor',?,?,?,?,?,'2026-01-01','2026-01-01')`,
  ).run(account, type, businessId, entityId, from, to);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  const names = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of names) {
    const sql = read(`../migrations/${name}`);
    db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
  }
  db.exec(read('./seed-local.sql'));
  [business, anotherBusiness] = db
    .prepare('SELECT id FROM businesses ORDER BY id LIMIT 2')
    .all()
    .map((row) => row.id);
  db.exec(`INSERT INTO users (id,email,role,status,created_at,updated_at)
    VALUES ('scope-auditor','scope-auditor@example.invalid','AUDITOR','ACTIVE','2026-01-01','2026-01-01');
    INSERT INTO business_account_members (business_account_id,user_id,role,status,created_at,updated_at,access_expires_at)
    VALUES ('${account}','scope-auditor','AUDITOR','ACTIVE','2026-01-01','2026-01-01','2027-01-01T00:00:00.000Z');
    CREATE TABLE access_rows (id TEXT, business_account_id TEXT, business_id TEXT, legal_entity_id TEXT,
      purchase_datetime TEXT, started_at TEXT, transaction_date TEXT);`);
  d1 = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => db.prepare(sql).get(...values) ?? null,
            all: async () => ({ results: db.prepare(sql).all(...values) }),
          };
        },
      };
    },
  };
});
afterEach(() => db.close());

describe('SQL-backed central authorization', () => {
  it.each(['EXPENSE', 'INCOME', 'WORK_SESSION'])(
    'rejects missing or impossible source dates for %s',
    async (family) => {
      addScope();
      const ctx = await loadAuthorizationContext(d1, actor, now);
      for (const [index, value] of [
        null,
        'invalid',
        '2026-02-30T00:00:00.000Z',
      ].entries()) {
        db.prepare('INSERT INTO access_rows VALUES (?,?,?,?,?,?,?)').run(
          String(index),
          account,
          business,
          'business-entity-primary',
          value,
          value,
          value,
        );
      }
      const filter = recordAccessPredicate(ctx, family, 'r', now);
      expect(
        db
          .prepare(`SELECT id FROM access_rows r WHERE ${filter.sql}`)
          .all(...filter.bindings),
      ).toEqual([]);
    },
  );
  it('fails closed for missing grants, excess grants, and wrong account identity', async () => {
    await expect(
      loadAuthorizationContext(d1, actor, now),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      loadAuthorizationContext(
        d1,
        { ...actor, businessAccountId: 'other' },
        now,
      ),
    ).rejects.toMatchObject({ status: 403 });
    for (let i = 0; i < maximumAccessScopes + 1; i++) addScope();
    await expect(
      loadAuthorizationContext(d1, actor, now),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('observes membership revocation, expiry, and scope changes on fresh requests', async () => {
    addScope();
    expect(
      (await loadAuthorizationContext(d1, { ...actor, role: 'OWNER' }, now))
        .role,
    ).toBe('AUDITOR');
    expect(
      await canAccessBusiness(
        d1,
        await loadAuthorizationContext(d1, actor, now),
        business,
        now,
      ),
    ).toBe(true);
    db.prepare(
      "UPDATE membership_access_scopes SET business_id=? WHERE user_id='scope-auditor'",
    ).run(anotherBusiness);
    const revised = await loadAuthorizationContext(d1, actor, now);
    expect(await canAccessBusiness(d1, revised, business, now)).toBe(false);
    expect(await canAccessBusiness(d1, revised, anotherBusiness, now)).toBe(
      true,
    );
    db.exec(
      "UPDATE business_account_members SET status='DISABLED' WHERE user_id='scope-auditor'",
    );
    await expect(
      loadAuthorizationContext(d1, actor, now),
    ).rejects.toMatchObject({ status: 403 });
    db.prepare(
      "UPDATE business_account_members SET status='ACTIVE',access_expires_at=? WHERE user_id='scope-auditor'",
    ).run(now.toISOString());
    await expect(
      loadAuthorizationContext(d1, actor, now),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("combines SQL grants as a union without mixing each grant's dates or leaking accounts", async () => {
    addScope({ from: '2026-04-01', to: '2026-04-30' });
    addScope({
      type: 'LEGAL_ENTITY',
      businessId: null,
      entityId: 'business-entity-primary',
      from: '2026-11-01',
      to: '2026-11-30',
    });
    const ctx = await loadAuthorizationContext(d1, actor, now);
    const candidates = [
      ['april', account, business, 'old-entity', '2026-04-15'],
      [
        'november',
        account,
        anotherBusiness,
        'business-entity-primary',
        '2026-11-15',
      ],
      ['mixed', account, business, 'old-entity', '2026-11-15'],
      ['foreign', 'other', business, 'business-entity-primary', '2026-11-15'],
    ];
    for (const [id, accountId, businessId, entityId, date] of candidates) {
      db.prepare('INSERT INTO access_rows VALUES (?,?,?,?,?,?,?)').run(
        id,
        accountId,
        businessId,
        entityId,
        `${date}T00:00:00.000Z`,
        `${date}T00:00:00.000Z`,
        date,
      );
    }
    const filter = recordAccessPredicate(ctx, 'INCOME', 'r', now);
    expect(
      db
        .prepare(`SELECT id FROM access_rows r WHERE ${filter.sql} ORDER BY id`)
        .all(...filter.bindings),
    ).toEqual([{ id: 'april' }, { id: 'november' }]);
  });

  it('rejects guessed business/entity directory IDs from another account even for account-wide grants', async () => {
    addScope({ type: 'ACCOUNT', businessId: null });
    db.exec(`INSERT INTO business_accounts SELECT 'foreign',display_name,status,plan,subscription_status,created_at,updated_at FROM business_accounts LIMIT 1;
      INSERT INTO businesses (id,business_account_id,name,created_at,updated_at) VALUES ('foreign-business','foreign','Foreign','2026-01-01','2026-01-01');
      INSERT INTO business_entities (id,business_account_id,entity_type,created_at,updated_at) VALUES ('foreign-entity','foreign','OTHER','2026-01-01','2026-01-01');`);
    const ctx = await loadAuthorizationContext(d1, actor, now);
    expect(await canAccessBusiness(d1, ctx, 'foreign-business', now)).toBe(
      false,
    );
    expect(await canAccessLegalEntity(d1, ctx, 'foreign-entity', now)).toBe(
      false,
    );
  });

  it('preserves existing owner/accountant account-wide membership access', async () => {
    for (const id of ['dev-owner', 'dev-accountant']) {
      const ctx = await loadAuthorizationContext(
        d1,
        { id, businessAccountId: account },
        now,
      );
      expect(await canAccessBusiness(d1, ctx, business, now)).toBe(true);
      expect(await canAccessBusiness(d1, ctx, anotherBusiness, now)).toBe(true);
    }
  });

  it('uses historical operating periods for minimal directory identity', async () => {
    db.exec(`INSERT INTO business_entities (id,business_account_id,entity_type,created_at,updated_at)
      VALUES ('successor','${account}','OTHER','2026-01-01','2026-01-01')`);
    db.prepare(
      'UPDATE business_entity_periods SET effective_to=? WHERE business_id=?',
    ).run('2026-06-30', business);
    db.prepare(
      `INSERT INTO business_entity_periods (id,business_account_id,business_id,legal_entity_id,effective_from,created_at,created_by)
      VALUES ('successor-period',?,?,'successor','2026-07-01','2026-01-01','dev-owner')`,
    ).run(account, business);
    addScope({
      type: 'LEGAL_ENTITY',
      businessId: null,
      entityId: 'business-entity-primary',
      from: '2026-07-01',
      to: '2026-12-31',
    });
    let ctx = await loadAuthorizationContext(d1, actor, now);
    expect(await canAccessBusiness(d1, ctx, business, now)).toBe(false);
    expect(await canAccessBusiness(d1, ctx, anotherBusiness, now)).toBe(true);
    db.exec(
      "UPDATE membership_access_scopes SET date_from='2026-04-01',date_to='2026-06-30' WHERE user_id='scope-auditor'",
    );
    ctx = await loadAuthorizationContext(d1, actor, now);
    expect(await canAccessBusiness(d1, ctx, business, now)).toBe(true);
    expect(await canAccessBusiness(d1, ctx, 'missing', now)).toBe(false);
    db.prepare(
      "UPDATE membership_access_scopes SET scope_type='BUSINESS',business_id=?,legal_entity_id=NULL WHERE user_id='scope-auditor'",
    ).run(business);
    ctx = await loadAuthorizationContext(d1, actor, now);
    expect(
      await canAccessLegalEntity(d1, ctx, 'business-entity-primary', now),
    ).toBe(true);
    expect(await canAccessLegalEntity(d1, ctx, 'successor', now)).toBe(false);
  });

  it.each(['EXPENSE', 'INCOME', 'WORK_SESSION'])(
    'filters %s records before aggregation and pagination',
    async (family) => {
      addScope({ from: '2026-11-01', to: '2026-11-30' });
      const ctx = await loadAuthorizationContext(d1, actor, now);
      const rows = [
        [
          'visible',
          account,
          business,
          'business-entity-primary',
          '2026-11-09T12:00:00.000Z',
          '2026-11-10',
        ],
        [
          'wrong-business',
          account,
          anotherBusiness,
          'business-entity-primary',
          '2026-11-09T12:00:00.000Z',
          '2026-11-10',
        ],
        [
          'wrong-account',
          'foreign',
          business,
          'business-entity-primary',
          '2026-11-09T12:00:00.000Z',
          '2026-11-10',
        ],
        [
          'too-late',
          account,
          business,
          'business-entity-primary',
          '2026-12-01T12:00:00.000Z',
          '2026-12-02',
        ],
      ];
      for (const [id, accountId, businessId, entityId, instant, date] of rows)
        db.prepare('INSERT INTO access_rows VALUES (?,?,?,?,?,?,?)').run(
          id,
          accountId,
          businessId,
          entityId,
          instant,
          instant,
          date,
        );
      const filter = recordAccessPredicate(ctx, family, 'r', now);
      expect(
        db
          .prepare(
            `SELECT id FROM access_rows r WHERE ${filter.sql} ORDER BY id LIMIT 1`,
          )
          .all(...filter.bindings),
      ).toEqual([{ id: 'visible' }]);
      expect(
        db
          .prepare(
            `SELECT count(*) AS total FROM access_rows r WHERE ${filter.sql}`,
          )
          .get(...filter.bindings).total,
      ).toBe(1);
      for (const [id, accountId, businessId, entityId, instant, date] of rows) {
        const permitted = canAccessRecord(
          ctx,
          {
            businessAccountId: accountId,
            businessId,
            legalEntityId: entityId,
            effectiveDate: family === 'INCOME' ? date : instant,
          },
          now,
        );
        expect(
          db
            .prepare(
              `SELECT id FROM access_rows r WHERE id=? AND ${filter.sql}`,
            )
            .all(id, ...filter.bindings).length > 0,
        ).toBe(permitted);
      }
    },
  );

  it.each([
    ['2026-09-27', '2026-09-26T12:00:00.000Z', '2026-09-27T11:00:00.000Z'],
    ['2026-04-05', '2026-04-04T11:00:00.000Z', '2026-04-05T12:00:00.000Z'],
  ])(
    'matches Auckland DST boundaries on %s in SQL and record checks',
    async (day, start, end) => {
      addScope({ from: day, to: day });
      const ctx = await loadAuthorizationContext(d1, actor, now);
      const filter = recordAccessPredicate(ctx, 'EXPENSE', 'r', now);
      const instants = [
        new Date(Date.parse(start) - 1).toISOString(),
        start,
        new Date(Date.parse(end) - 1).toISOString(),
        end,
      ];
      for (const instant of instants) {
        db.prepare('INSERT INTO access_rows VALUES (?,?,?,?,?,?,?)').run(
          instant,
          account,
          business,
          'business-entity-primary',
          instant,
          instant,
          day,
        );
        const expected = canAccessRecord(
          ctx,
          {
            businessAccountId: account,
            businessId: business,
            legalEntityId: 'business-entity-primary',
            effectiveDate: instant,
          },
          now,
        );
        expect(
          db
            .prepare(
              `SELECT id FROM access_rows r WHERE id=? AND ${filter.sql}`,
            )
            .all(instant, ...filter.bindings).length > 0,
        ).toBe(expected);
      }
      expect(
        db
          .prepare(
            `SELECT count(*) AS total FROM access_rows r WHERE ${filter.sql}`,
          )
          .get(...filter.bindings).total,
      ).toBe(2);
    },
  );
});
