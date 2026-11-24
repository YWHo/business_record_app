import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

// Generate exclusively from repository-owned fictional SQL in an in-memory DB.
// Never accept a database path, remote binding, credentials or user data.
const root = new URL('../', import.meta.url);
function read(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

const db = new DatabaseSync(':memory:');

try {
  for (const name of readdirSync(new URL('migrations/', root))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()) {
    const sql = read(`migrations/${name}`);
    db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
  }
  db.exec(read('scripts/seed-demo.sql'));
  const tables = {};
  // Deliberate allowlist: no sessions, token hashes, invitations, outboxes,
  // authentication challenges, runtime configuration or storage object keys.
  for (const table of [
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
  ]) {
    tables[table] = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  }
  const metadata = JSON.parse(
    read('src/features/demo/staticDemoMetadata.json'),
  );
  const dataset = { version: metadata.version, tables };
  const target = new URL('src/features/demo/staticDemoDataset.json', root);
  writeFileSync(target, JSON.stringify(dataset, null, 2) + '\n');
  console.log(`Generated static fictional demo ${dataset.version}.`);
} finally {
  db.close();
}
