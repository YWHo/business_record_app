PRAGMA foreign_keys = ON;

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
  ('schema_phase', '2', '2026-01-01T00:00:00.000Z');
