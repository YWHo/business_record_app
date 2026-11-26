import { readFileSync } from 'node:fs';

export const stagingFixtureVersion = 'staging-synthetic-v1';
export function stagingFixtureSql(action) {
  if (!['provision', 'reset'].includes(action)) {
    throw new Error('Invalid staging fixture action.');
  }
  const seed = readFileSync(new URL('./seed-demo.sql', import.meta.url), 'utf8')
    .replaceAll('demo-owner', 'staging-owner')
    .replaceAll('demo-accountant', 'staging-accountant');
  // The precondition is part of the same query batch as the seed, protecting
  // against data arriving between the administrative inspection and execution.
  const precondition =
    action === 'provision'
      ? '(SELECT COUNT(*) FROM users) = 0 AND (SELECT COUNT(*) FROM businesses) = 0 AND (SELECT COUNT(*) FROM expenses) = 0 AND (SELECT COUNT(*) FROM income_records) = 0 AND (SELECT COUNT(*) FROM work_sessions) = 0'
      : `(SELECT value FROM runtime_metadata WHERE key='staging_fixture_version') = '${stagingFixtureVersion}'`;
  return `CREATE TABLE staging_fixture_guard (valid INTEGER NOT NULL CHECK (valid=1));
INSERT INTO staging_fixture_guard VALUES (CASE WHEN (${precondition}) AND (SELECT COUNT(*) FROM attachments)=0 THEN 1 ELSE 0 END);
${seed}
UPDATE users SET display_name='Staging Owner' WHERE id='staging-owner';
UPDATE users SET display_name='Staging Accountant' WHERE id='staging-accountant';
INSERT INTO users (id,email,role,status,display_name,created_at,updated_at)
VALUES ('staging-auditor','staging-auditor@example.invalid','AUDITOR','ACTIVE','Staging Auditor',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO business_account_members (business_account_id,user_id,role,status,access_expires_at,created_at,updated_at)
VALUES ('business-account-primary','staging-auditor','AUDITOR','ACTIVE',strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO membership_access_scopes (business_account_id,user_id,scope_type,business_id,date_from,date_to,created_at,updated_at)
VALUES ('business-account-primary','staging-auditor','BUSINESS','business-demo-activity-contracting','2026-04-01','2027-03-31',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
UPDATE runtime_metadata SET value='staging-synthetic-nz' WHERE key='seed_profile';
INSERT INTO runtime_metadata (key,value,updated_at) VALUES ('staging_fixture_version','${stagingFixtureVersion}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
DROP TABLE staging_fixture_guard;`;
}
