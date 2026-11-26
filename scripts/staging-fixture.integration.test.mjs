// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { stagingFixtureSql } from './staging-fixture.mjs';

let db;
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
});
afterEach(() => db.close());
function apply(action) {
  db.exec('BEGIN');
  try {
    db.exec(stagingFixtureSql(action));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
it('provisions three synthetic real memberships with bounded expiring Auditor scope and no sessions', () => {
  apply('provision');
  const members = db
    .prepare(
      'SELECT users.email, members.role,members.access_expires_at FROM business_account_members members JOIN users ON users.id=members.user_id ORDER BY members.role',
    )
    .all();
  expect(members.map((row) => row.role)).toEqual([
    'ACCOUNTANT',
    'AUDITOR',
    'OWNER',
  ]);
  expect(members.every((row) => row.email.endsWith('@example.invalid'))).toBe(
    true,
  );
  expect(Date.parse(members[1].access_expires_at) - Date.now()).toBeGreaterThan(
    29 * 86400000,
  );
  expect(
    db
      .prepare(
        "SELECT scope_type,business_id,date_from,date_to FROM membership_access_scopes WHERE user_id='staging-auditor'",
      )
      .all(),
  ).toEqual([
    {
      scope_type: 'BUSINESS',
      business_id: 'business-demo-activity-contracting',
      date_from: '2026-04-01',
      date_to: '2027-03-31',
    },
  ]);
  expect(
    db.prepare('SELECT COUNT(*) AS count FROM businesses').get().count,
  ).toBe(4);
  expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count).toBe(
    0,
  );
  expect(
    db.prepare('SELECT COUNT(*) AS count FROM attachments').get().count,
  ).toBe(0);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
it('refuses provisioning over existing edits and preserves disabled membership state', () => {
  apply('provision');
  db.exec(
    "UPDATE business_account_members SET status='DISABLED' WHERE user_id='staging-auditor'",
  );
  expect(() => apply('provision')).toThrow();
  expect(
    db
      .prepare(
        "SELECT status FROM business_account_members WHERE user_id='staging-auditor'",
      )
      .get().status,
  ).toBe('DISABLED');
});
it('an intentional reset restores only the recognized disposable fixture', () => {
  expect(() => apply('reset')).toThrow();
  apply('provision');
  db.exec(
    "UPDATE business_account_members SET access_expires_at='2020-01-01T00:00:00.000Z' WHERE user_id='staging-auditor'",
  );
  apply('reset');
  expect(
    Date.parse(
      db
        .prepare(
          "SELECT access_expires_at FROM business_account_members WHERE user_id='staging-auditor'",
        )
        .get().access_expires_at,
    ),
  ).toBeGreaterThan(Date.now());
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
it('refuses resetting attachment metadata, even if it arrives after administrative inspection', () => {
  apply('provision');
  db.exec(`INSERT INTO attachments (id,record_type,record_id,version_group_id,object_key,original_filename,mime_type,file_size,sha256,created_by,created_at,version_number,is_current,retention_until,purge_eligible_at,business_account_id,business_id,legal_entity_id)
    SELECT 'test-attachment','EXPENSE',id,'test-group','test-only-object','test.pdf','application/pdf',1,printf('%064d',0),'staging-owner',created_at,1,1,retention_until,purge_eligible_at,business_account_id,business_id,legal_entity_id FROM expenses WHERE id='demo-fuel-1';`);
  expect(() => apply('reset')).toThrow();
  expect(
    db.prepare('SELECT COUNT(*) AS count FROM attachments').get().count,
  ).toBe(1);
  expect(db.prepare('SELECT COUNT(*) AS count FROM users').get().count).toBe(3);
});
