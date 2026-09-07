PRAGMA foreign_keys = ON;

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
DELETE FROM business_activities;
UPDATE retention_settings SET updated_by = NULL;
DELETE FROM development_outbox;
DELETE FROM sessions;
DELETE FROM invitations;
DELETE FROM users;
DELETE FROM runtime_metadata;

INSERT INTO users (id, email, role, status, created_at, updated_at)
VALUES
  ('dev-owner', 'owner@local.test', 'OWNER', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('dev-accountant', 'accountant@local.test', 'ACCOUNTANT', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('dev-disabled-accountant', 'disabled@local.test', 'ACCOUNTANT', 'DISABLED', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO business_activities (id, name, activity_type, active, started_at, ended_at, created_at, updated_at)
VALUES
  ('activity-delivery', 'Delivery Platform', 'PLATFORM_SERVICES', 1, '2025-04-01', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('activity-rideshare', 'Ride-Hailing Platform', 'PLATFORM_SERVICES', 1, '2025-04-01', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('activity-contracting', 'IT Contracting', 'PROFESSIONAL_SERVICES', 1, '2025-04-01', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('activity-saas', 'SaaS Business', 'SOFTWARE_SERVICE', 1, '2025-04-01', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO vehicles (id, registration, description, active, acquired_at, retired_at, notes, created_at, updated_at)
VALUES
  ('vehicle-current', 'DEV123', 'Synthetic current vehicle', 1, '2025-01-15', NULL, 'Local development data only', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('vehicle-retired', 'OLD456', 'Synthetic retired vehicle', 0, '2020-05-01', '2024-12-20', 'Local development data only', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO clients (id, name, active, notes, created_at, updated_at)
VALUES
  ('client-harbour-digital', 'Harbour Digital Limited', 1, 'Synthetic local client', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

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
  ('schema_phase', '4', '2026-09-07T00:00:00.000Z');
