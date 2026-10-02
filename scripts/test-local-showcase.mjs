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
), totals AS (
  SELECT business_id, COUNT(*) AS record_count
  FROM all_records
  GROUP BY business_id
)
SELECT
  (SELECT COUNT(*) FROM totals) AS business_count,
  (SELECT MIN(record_count) FROM totals) AS minimum_records_per_business,
  (SELECT COUNT(*) FROM work_sessions
    WHERE business_id = 'business-activity-delivery') AS delivery_sessions,
  (SELECT COUNT(*) FROM work_sessions
    WHERE business_id = 'business-activity-rideshare') AS rideshare_sessions,
  (SELECT COUNT(*) FROM income_records
    WHERE id LIKE 'showcase-delivery-payout-%'
      AND strftime('%w', transaction_date) = '2') AS delivery_tuesday_payouts,
  (SELECT COUNT(*) FROM income_records
    WHERE id LIKE 'showcase-rideshare-payout-%'
      AND strftime('%w', transaction_date) = '4') AS rideshare_thursday_payouts,
  (SELECT COUNT(*) FROM income_records
    WHERE id LIKE 'showcase-contract-week-%'
      AND strftime('%w', transaction_date) = '5') AS contract_friday_payments,
  (SELECT COUNT(*) FROM expenses
    WHERE id LIKE 'showcase-contract-parking-%'
      AND strftime('%w', purchase_datetime) BETWEEN '1' AND '5')
    AS contract_weekday_parking,
  (SELECT COUNT(*) FROM all_records
    WHERE business_id = 'business-activity-saas') AS saas_records,
  (SELECT COUNT(*)
    FROM work_sessions AS delivery
    JOIN work_sessions AS rideshare
      ON delivery.vehicle_id = rideshare.vehicle_id
      AND delivery.business_id = 'business-activity-delivery'
      AND rideshare.business_id = 'business-activity-rideshare'
      AND delivery.started_at < rideshare.ended_at
      AND rideshare.started_at < delivery.ended_at)
    AS overlapping_driving_sessions,
  (SELECT value FROM runtime_metadata WHERE key = 'seed_profile')
    AS seed_profile,
  (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_errors;
`;

const completeSql = [
  migrationSql,
  readSql(path.join(scriptDirectory, 'seed-local.sql')),
  readSql(path.join(scriptDirectory, 'seed-local-showcase.sql')),
  verificationSql,
].join('\n');

const result = spawnSync(
  'sqlite3',
  ['-batch', '-json', ':memory:', completeSql],
  { cwd: projectDirectory, encoding: 'utf8' },
);

if (result.error?.code === 'ENOENT') {
  throw new Error(
    'Local showcase regression requires the sqlite3 command-line tool.',
  );
}
if (result.status !== 0) {
  throw new Error(
    `Local showcase regression failed:\n${result.stderr || result.stdout}`,
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
  saas_records: 20,
  overlapping_driving_sessions: 0,
  seed_profile: 'local-development-showcase',
  foreign_key_errors: 0,
});

console.log(
  'Local showcase contains rich, non-overlapping business histories.',
);
