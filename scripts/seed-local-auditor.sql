-- Add a synthetic local-development identity without resetting existing records.
-- Requires the normal local seed and migrations through 0010.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users (id, email, role, status, display_name, created_at, updated_at)
VALUES ('dev-auditor', 'auditor@local.test', 'AUDITOR', 'ACTIVE', 'Local Auditor',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO business_account_members (
  business_account_id, user_id, role, status, access_expires_at, created_at, updated_at
)
SELECT 'business-account-primary', id, 'AUDITOR', 'ACTIVE',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users WHERE id = 'dev-auditor' AND email = 'auditor@local.test' AND role = 'AUDITOR';

-- changes() refers to the preceding membership INSERT. Re-running this file must
-- not extend expiry, restore disabled access, or recreate an owner-removed scope.
INSERT INTO membership_access_scopes (
  business_account_id, user_id, scope_type, business_id, created_at, updated_at
)
SELECT 'business-account-primary', 'dev-auditor', 'BUSINESS', 'business-activity-contracting',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE changes() = 1;
