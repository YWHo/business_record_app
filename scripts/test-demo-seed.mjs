import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const migrationDirectory = path.join(projectDirectory, 'migrations');

const readSql = (filePath) => readFileSync(filePath, 'utf8');
const migrationSql = readdirSync(migrationDirectory)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort()
  .map((name) => readSql(path.join(migrationDirectory, name)))
  .join('\n');

const verificationSql = `
WITH all_records AS (
  SELECT business_id FROM expenses
  UNION ALL SELECT business_id FROM income_records
  UNION ALL SELECT business_id FROM work_sessions
), business_totals AS (
  SELECT business_id, COUNT(*) AS record_count
  FROM all_records
  GROUP BY business_id
)
SELECT
  (SELECT COUNT(*) FROM business_totals) AS business_count,
  (SELECT MIN(record_count) FROM business_totals) AS minimum_records_per_business,
  (SELECT COUNT(*) FROM work_sessions
    WHERE business_id = 'business-demo-activity-delivery'
      AND date(started_at) BETWEEN '2026-09-21' AND '2026-09-30') AS delivery_sessions,
  (SELECT COUNT(*) FROM work_sessions
    WHERE business_id = 'business-demo-activity-rideshare'
      AND date(started_at) BETWEEN '2026-09-21' AND '2026-09-30') AS rideshare_sessions,
  (SELECT COUNT(*) FROM income_records
    WHERE id LIKE 'demo-delivery-payout-%'
      AND strftime('%w', transaction_date) = '2') AS delivery_tuesday_payouts,
  (SELECT COUNT(*) FROM income_records
    WHERE id LIKE 'demo-rideshare-payout-%'
      AND strftime('%w', transaction_date) = '4') AS rideshare_thursday_payouts,
  (SELECT COUNT(*) FROM income_records
    WHERE id LIKE 'demo-contract-week-%'
      AND strftime('%w', transaction_date) = '5') AS contract_friday_payments,
  (SELECT COUNT(*) FROM expenses
    WHERE id LIKE 'demo-contract-parking-%'
      AND strftime('%w', purchase_datetime) BETWEEN '1' AND '5') AS contract_weekday_parking,
  (SELECT COUNT(*) FROM insurance_expense_details
    WHERE expense_id = 'demo-insurance-vehicle'
      OR expense_id LIKE 'demo-delivery-insurance-%') AS delivery_insurance_months,
  (SELECT COUNT(*) FROM insurance_expense_details
    WHERE expense_id LIKE 'demo-rideshare-insurance-%') AS rideshare_insurance_months,
  (SELECT COUNT(*) FROM insurance_expense_details
    WHERE expense_id = 'demo-insurance-liability'
      OR expense_id LIKE 'demo-contract-insurance-%') AS contract_insurance_months,
  (SELECT COUNT(*) FROM subscription_income_details) AS subscription_months,
  (SELECT COUNT(*) FROM expenses
    WHERE business_id = 'business-demo-activity-saas'
      AND expense_category_id = 'category-cloud-hosting') AS hosting_months,
  (SELECT name FROM businesses
    WHERE id = 'business-demo-activity-saas') AS saas_business_name,
  (SELECT display_name FROM users
    WHERE id = 'demo-owner') AS owner_display_name,
  (SELECT legal_name FROM business_entities
    WHERE id = 'business-entity-primary') AS sole_trader_legal_name,
  (SELECT COUNT(*)
    FROM work_sessions AS delivery
    JOIN work_sessions AS rideshare
      ON delivery.vehicle_id = rideshare.vehicle_id
      AND delivery.business_id = 'business-demo-activity-delivery'
      AND rideshare.business_id = 'business-demo-activity-rideshare'
      AND delivery.started_at < rideshare.ended_at
      AND rideshare.started_at < delivery.ended_at) AS overlapping_driving_sessions,
  (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_errors;
`;

const seedSql = readSql(path.join(scriptDirectory, 'seed-demo.sql'));
const firstInsert = seedSql.indexOf('INSERT INTO users');
assert.notEqual(
  firstInsert,
  -1,
  'Unable to locate the demo seed insert phase.',
);
const teardownSql = seedSql.slice(0, firstInsert);
const completeSql = [
  migrationSql,
  seedSql,
  // Exercise the destructive preamble against already-seeded attribution.
  // A savepoint preserves the first seed for the content assertions below.
  'SAVEPOINT reseed_teardown;',
  teardownSql,
  'ROLLBACK TO reseed_teardown;',
  'RELEASE reseed_teardown;',
  verificationSql,
].join('\n');

const result = spawnSync(
  'sqlite3',
  ['-batch', '-json', ':memory:', completeSql],
  { cwd: projectDirectory, encoding: 'utf8' },
);

if (result.error?.code === 'ENOENT') {
  throw new Error(
    'Demo seed regression requires the sqlite3 command-line tool to be installed.',
  );
}
if (result.status !== 0) {
  throw new Error(
    `Demo seed regression failed:\n${result.stderr || result.stdout}`,
  );
}

const [actual] = JSON.parse(result.stdout);

assert.deepEqual(actual, {
  business_count: 4,
  minimum_records_per_business: 20,
  delivery_sessions: 20,
  rideshare_sessions: 20,
  delivery_tuesday_payouts: 10,
  rideshare_thursday_payouts: 10,
  contract_friday_payments: 26,
  contract_weekday_parking: 131,
  delivery_insurance_months: 6,
  rideshare_insurance_months: 6,
  contract_insurance_months: 6,
  subscription_months: 6,
  hosting_months: 6,
  saas_business_name: 'Music Streaming',
  owner_display_name: 'John Doe',
  sole_trader_legal_name: 'John Doe',
  overlapping_driving_sessions: 0,
  foreign_key_errors: 0,
});

console.log(
  'Demo seed contains realistic, non-overlapping business histories.',
);
