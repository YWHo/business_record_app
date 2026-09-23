PRAGMA foreign_keys = ON;

DELETE FROM export_history;
DELETE FROM development_auth_outbox;
DELETE FROM authentication_challenges;
DELETE FROM audit_log;
DELETE FROM comments;
DELETE FROM attachments;
DELETE FROM income_reconciliations;
DELETE FROM subscription_income_details;
DELETE FROM contract_income_details;
DELETE FROM platform_income_details;
DELETE FROM income_records;
DELETE FROM work_sessions;
DELETE FROM expense_allocations;
DELETE FROM insurance_expense_details;
DELETE FROM parking_expense_details;
DELETE FROM fuel_expense_details;
DELETE FROM expenses;
DELETE FROM saved_filters;
DELETE FROM clients;
DELETE FROM vehicles;
DELETE FROM business_entity_periods;
DELETE FROM businesses;
DELETE FROM business_activities;
DELETE FROM business_entities WHERE id <> 'business-entity-primary';
UPDATE retention_settings SET updated_by = NULL;
DELETE FROM development_outbox;
DELETE FROM sessions;
DELETE FROM invitations;
DELETE FROM business_account_members;
DELETE FROM users;
DELETE FROM runtime_metadata;

INSERT INTO users (id, email, role, status, created_at, updated_at)
VALUES
  ('dev-owner', 'owner@local.test', 'OWNER', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('dev-accountant', 'accountant@local.test', 'ACCOUNTANT', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('dev-disabled-accountant', 'disabled@local.test', 'ACCOUNTANT', 'DISABLED', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

UPDATE users
SET display_name = CASE id
  WHEN 'dev-owner' THEN 'Local Owner'
  WHEN 'dev-accountant' THEN 'Local Accountant'
  WHEN 'dev-disabled-accountant' THEN 'Disabled Local Accountant'
END;

UPDATE business_entities
SET entity_type = 'SOLE_TRADER',
    legal_name = 'Local Sole Trader',
    trading_name = NULL,
    active = 1,
    attribution_review_required = 0,
    updated_at = '2026-01-01T00:00:00.000Z'
WHERE id = 'business-entity-primary';

UPDATE business_accounts
SET display_name = 'Local Business Records', updated_at = '2026-01-01T00:00:00.000Z'
WHERE id = 'business-account-primary';

INSERT INTO business_account_members (
  business_account_id, user_id, role, status, created_at, updated_at
)
VALUES
  ('business-account-primary', 'dev-owner', 'OWNER', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('business-account-primary', 'dev-accountant', 'ACCOUNTANT', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('business-account-primary', 'dev-disabled-accountant', 'ACCOUNTANT', 'DISABLED', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO business_activities (id, name, activity_type, active, started_at, ended_at, created_at, updated_at)
VALUES
  ('activity-delivery', 'Delivery Platform', 'PLATFORM_SERVICES', 1, '2025-04-01', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('activity-rideshare', 'Ride-Hailing Platform', 'PLATFORM_SERVICES', 1, '2025-04-01', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('activity-contracting', 'IT Contracting', 'PROFESSIONAL_SERVICES', 1, '2025-04-01', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('activity-saas', 'SaaS Business', 'SOFTWARE_SERVICE', 1, '2025-04-01', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO businesses (
  id, business_account_id, name, description, business_type, default_currency,
  status, legacy_business_activity_id, created_at, updated_at
)
SELECT
  'business-' || id,
  business_account_id,
  name,
  NULL,
  activity_type,
  'NZD',
  CASE active WHEN 1 THEN 'ACTIVE' ELSE 'INACTIVE' END,
  id,
  created_at,
  updated_at
FROM business_activities;

INSERT INTO business_entity_periods (
  id, business_account_id, business_id, legal_entity_id, effective_from,
  effective_to, created_at, created_by, notes
)
SELECT
  'period-' || business.id || '-initial',
  business.business_account_id,
  business.id,
  'business-entity-primary',
  COALESCE(activity.started_at, substr(activity.created_at, 1, 10)),
  NULL,
  '2026-01-01T00:00:00.000Z',
  'dev-owner',
  'Synthetic local-development operating period.'
FROM businesses AS business
JOIN business_activities AS activity
  ON activity.id = business.legacy_business_activity_id;

INSERT INTO vehicles (id, registration, description, active, acquired_at, retired_at, notes, created_at, updated_at)
VALUES
  ('vehicle-current', 'DEV123', 'Synthetic current vehicle', 1, '2025-01-15', NULL, 'Local development data only', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vehicle-retired', 'OLD456', 'Synthetic retired vehicle', 0, '2020-05-01', '2024-12-20', 'Local development data only', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO clients (id, name, active, notes, created_at, updated_at)
VALUES
  ('client-harbour-digital', 'Harbour Digital Limited', 1, 'Synthetic local client', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

UPDATE clients
SET business_id = 'business-activity-contracting'
WHERE id = 'client-harbour-digital';

INSERT INTO invitations (id, email, role, token_hash, invited_by, expires_at, accepted_at, created_at)
VALUES (
  'dev-expired-invitation',
  'expired-invitee@local.test',
  'ACCOUNTANT',
  'd9476b7d1914d07bcf3d057f0352739e7da39206ea232639254b6771fa819b61',
  'dev-owner',
  '2020-01-01T00:00:00.000Z',
  NULL,
  '2019-12-29T00:00:00.000Z'
);

INSERT INTO development_outbox (id, invitation_id, recipient_email, invitation_url, created_at)
VALUES (
  'dev-expired-outbox',
  'dev-expired-invitation',
  'expired-invitee@local.test',
  '/accept-invitation?token=expired-local-invite',
  '2019-12-29T00:00:00.000Z'
);

INSERT INTO runtime_metadata (key, value, updated_at)
VALUES
  ('seed_profile', 'local-development', '2026-01-01T00:00:00.000Z'),
  ('schema_phase', '16', '2026-09-10T00:00:00.000Z'),
  ('schema_architecture', 'business-identity-backfilled', '2026-09-23T00:00:00.000Z');
