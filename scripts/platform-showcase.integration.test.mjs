// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe.each([
  { profile: 'public demo', prefix: 'demo-', seed: ['seed-demo.sql'] },
  {
    profile: 'local showcase',
    prefix: '',
    seed: ['seed-local.sql', 'seed-local-showcase.sql'],
  },
])('$profile driving businesses', ({ prefix, seed }) => {
  let db;
  const uberId = `business-${prefix}activity-rideshare`;
  const doorDashId = `business-${prefix}activity-delivery`;

  beforeAll(() => {
    db = new DatabaseSync(':memory:');
    for (const name of readdirSync(new URL('../migrations/', import.meta.url))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const sql = read(`../migrations/${name}`);
      db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
    }
    for (const path of seed) {
      db.exec(read(`./${path}`));
    }
  });
  afterAll(() => db?.close());

  it('keeps Uber and DoorDash as distinct businesses with valid historical attribution', () => {
    expect(
      db.prepare('SELECT name FROM businesses WHERE id = ?').get(uberId).name,
    ).toBe('Uber');
    expect(
      db.prepare('SELECT name FROM businesses WHERE id = ?').get(doorDashId)
        .name,
    ).toBe('DoorDash');
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM businesses').get().count,
    ).toBe(4);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM income_records AS income
      WHERE income.business_id = ? AND NOT EXISTS (
        SELECT 1 FROM business_entity_periods AS period
        WHERE period.business_id = income.business_id
          AND period.legal_entity_id = income.legal_entity_id
          AND income.transaction_date >= period.effective_from
          AND (period.effective_to IS NULL OR income.transaction_date <= period.effective_to)
      )`,
        )
        .get(uberId).count,
    ).toBe(0);
  });

  it('shows combined Uber statements without adding duplicate Eats payouts', () => {
    const statements = db
      .prepare(
        `SELECT income.notes, detail.provider_name
      FROM income_records AS income JOIN platform_income_details AS detail ON detail.income_id = income.id
      WHERE income.business_id = ?`,
      )
      .all(uberId);
    expect(statements).toHaveLength(prefix ? 12 : 10);
    for (const statement of statements) {
      expect(statement.provider_name).toBe('Uber');
      expect(statement.notes).toContain('Uber rides and Uber Eats');
    }
    const providers = db
      .prepare(
        `SELECT DISTINCT detail.provider_name
      FROM platform_income_details AS detail JOIN income_records AS income ON income.id = detail.income_id
      WHERE income.business_id = ?`,
      )
      .all(doorDashId);
    expect(providers).toEqual([{ provider_name: 'DoorDash' }]);
  });

  it('records mixed Uber shifts once with a single derived odometer distance', () => {
    const sessions = db
      .prepare(
        `SELECT notes, odometer_end_km - odometer_start_km AS distance
      FROM work_sessions WHERE business_id = ? AND date(started_at) BETWEEN '2026-09-21' AND '2026-09-30'`,
      )
      .all(uberId);
    expect(sessions).toHaveLength(20);
    expect(
      sessions.filter((session) => session.notes.includes('Uber Eats')),
    ).toHaveLength(10);
    expect(sessions.reduce((sum, session) => sum + session.distance, 0)).toBe(
      900,
    );
    expect(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM work_sessions AS first
      JOIN work_sessions AS second ON first.id < second.id AND first.vehicle_id = second.vehicle_id
        AND first.started_at < second.ended_at AND second.started_at < first.ended_at`,
        )
        .get().count,
    ).toBe(0);
  });

  it('shows shared fuel and insurance for both Uber services within the same business', () => {
    for (const expenseType of ['FUEL', 'INSURANCE']) {
      expect(
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM expenses WHERE business_id = ?
        AND expense_type = ? AND description LIKE '%Uber rides and Uber Eats%'`,
          )
          .get(uberId, expenseType).count,
      ).toBeGreaterThanOrEqual(6);
    }
  });
});
