import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const migrationDirectory = path.join(projectDirectory, 'migrations');
const fixturePath = path.join(
  scriptDirectory,
  'fixtures',
  'pre-business-identity.sql',
);

const migrationNames = [
  '0001_runtime_foundation.sql',
  '0002_business_records_schema.sql',
  '0003_authentication.sql',
  '0004_export_history.sql',
  '0005_mobile_capture.sql',
];
const upgradeNames = [
  '0006_business_account_tenancy.sql',
  '0007_business_identity_foundation.sql',
  '0008_business_identity_backfill.sql',
];

const readSql = (filePath) => readFileSync(filePath, 'utf8');
const migrationSql = migrationNames
  .map((name) => readSql(path.join(migrationDirectory, name)))
  .join('\n');
const upgradeSql = upgradeNames
  .map((name) => readSql(path.join(migrationDirectory, name)))
  .join('\n');

const verificationSql = `
SELECT
  (SELECT COUNT(*) FROM business_accounts) AS account_count,
  (SELECT role FROM business_account_members WHERE user_id = 'legacy-owner') AS owner_role,
  (SELECT display_name FROM business_accounts WHERE id = 'business-account-primary') AS account_name,
  (SELECT name FROM businesses WHERE id = 'business-legacy-consulting') AS business_name,
  (SELECT effective_from FROM business_entity_periods WHERE business_id = 'business-legacy-consulting') AS period_start,
  (SELECT effective_to FROM business_entity_periods WHERE business_id = 'business-legacy-consulting') AS period_end,
  (SELECT legal_name FROM business_entities WHERE id = 'business-entity-primary') AS legal_name,
  (SELECT attribution_review_required FROM business_entities WHERE id = 'business-entity-primary') AS entity_review_required,
  (SELECT business_id FROM expenses WHERE id = 'legacy-expense') AS expense_business_id,
  (SELECT legal_entity_id FROM expenses WHERE id = 'legacy-expense') AS expense_entity_id,
  (SELECT attribution_review_required FROM expenses WHERE id = 'legacy-expense') AS expense_review_required,
  (SELECT business_id FROM work_sessions WHERE id = 'legacy-session') AS session_business_id,
  (SELECT legal_entity_id FROM work_sessions WHERE id = 'legacy-session') AS session_entity_id,
  (SELECT attribution_review_required FROM work_sessions WHERE id = 'legacy-session') AS session_review_required,
  (SELECT business_id FROM income_records WHERE id = 'legacy-income') AS income_business_id,
  (SELECT legal_entity_id FROM income_records WHERE id = 'legacy-income') AS income_entity_id,
  (SELECT attribution_review_required FROM income_records WHERE id = 'legacy-income') AS income_review_required,
  (SELECT business_id FROM attachments WHERE id = 'legacy-attachment') AS attachment_business_id,
  (SELECT legal_entity_id FROM attachments WHERE id = 'legacy-attachment') AS attachment_entity_id,
  (SELECT business_id FROM comments WHERE id = 'legacy-comment') AS comment_business_id,
  (SELECT legal_entity_id FROM comments WHERE id = 'legacy-comment') AS comment_entity_id,
  (SELECT business_id FROM audit_log WHERE id = 'legacy-audit') AS audit_business_id,
  (SELECT legal_entity_id FROM audit_log WHERE id = 'legacy-audit') AS audit_entity_id,
  (SELECT business_id FROM vehicles WHERE id = 'legacy-vehicle') AS vehicle_business_id,
  (SELECT value FROM runtime_metadata WHERE key = 'schema_architecture') AS schema_architecture,
  (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_errors,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'business_entity_periods_no_overlap_%') AS period_trigger_count;
`;

const completeSql = [
  migrationSql,
  readSql(fixturePath),
  upgradeSql,
  verificationSql,
].join('\n');

const result = spawnSync(
  'sqlite3',
  ['-batch', '-json', ':memory:', completeSql],
  {
    cwd: projectDirectory,
    encoding: 'utf8',
  },
);

if (result.error?.code === 'ENOENT') {
  throw new Error(
    'Migration regression requires the sqlite3 command-line tool to be installed.',
  );
}
if (result.status !== 0) {
  throw new Error(
    `Migration regression failed:\n${result.stderr || result.stdout}`,
  );
}

const [actual] = JSON.parse(result.stdout);
const businessId = 'business-legacy-consulting';
const entityId = 'business-entity-primary';

assert.deepEqual(actual, {
  account_count: 1,
  owner_role: 'OWNER',
  account_name: 'Business Records',
  business_name: 'Legacy Consulting',
  period_start: '2025-04-01',
  period_end: null,
  legal_name: null,
  entity_review_required: 1,
  expense_business_id: businessId,
  expense_entity_id: entityId,
  expense_review_required: 1,
  session_business_id: businessId,
  session_entity_id: entityId,
  session_review_required: 1,
  income_business_id: businessId,
  income_entity_id: entityId,
  income_review_required: 1,
  attachment_business_id: businessId,
  attachment_entity_id: entityId,
  comment_business_id: businessId,
  comment_entity_id: entityId,
  audit_business_id: businessId,
  audit_entity_id: entityId,
  vehicle_business_id: businessId,
  schema_architecture: 'business-identity-backfilled',
  foreign_key_errors: 0,
  period_trigger_count: 2,
});

console.log('Populated legacy data upgrades with preserved attribution.');
