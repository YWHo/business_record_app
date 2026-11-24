// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

it('bundles exactly the fictional SQL baseline and no authentication or storage secrets', () => {
  const fixture = JSON.parse(
    read('../src/features/demo/staticDemoDataset.json'),
  );
  expect(fixture.version).toBe(
    JSON.parse(read('../src/features/demo/staticDemoMetadata.json')).version,
  );
  const allowed = new Set([
    'businesses',
    'business_entities',
    'business_entity_periods',
    'business_activities',
    'vehicles',
    'clients',
    'expense_categories',
    'expenses',
    'fuel_expense_details',
    'parking_expense_details',
    'insurance_expense_details',
    'expense_allocations',
    'income_records',
    'platform_income_details',
    'contract_income_details',
    'subscription_income_details',
    'income_reconciliations',
    'work_sessions',
    'comments',
  ]);
  expect(new Set(Object.keys(fixture.tables))).toEqual(allowed);
  const db = new DatabaseSync(':memory:');
  try {
    for (const name of readdirSync(new URL('../migrations/', import.meta.url))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort()) {
      const sql = read(`../migrations/${name}`);
      db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
    }
    db.exec(read('./seed-demo.sql'));
    for (const table of allowed) {
      expect(
        fixture.tables[table],
        `Run pnpm demo:generate after changing ${table}`,
      ).toEqual(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      for (const row of fixture.tables[table]) {
        for (const [key, value] of Object.entries(row)) {
          expect(['token_hash', 'password_hash', 'object_key']).not.toContain(
            key,
          );
          if (key.endsWith('_minor') && value !== null) {
            expect(Number.isSafeInteger(value)).toBe(true);
          }
        }
      }
    }
  } finally {
    db.close();
  }
});
