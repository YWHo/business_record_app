PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX users_single_owner_idx
ON users(role)
WHERE role = 'OWNER';

CREATE TABLE authentication_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL COLLATE NOCASE,
  purpose TEXT NOT NULL CHECK (purpose = 'LOGIN'),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX authentication_challenges_user_idx
ON authentication_challenges(user_id, created_at);

CREATE INDEX authentication_challenges_expiry_idx
ON authentication_challenges(expires_at, consumed_at);

CREATE TABLE development_auth_outbox (
  id TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL COLLATE NOCASE,
  subject TEXT NOT NULL,
  action_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX development_auth_outbox_created_idx
ON development_auth_outbox(created_at);

INSERT INTO runtime_metadata (key, value, updated_at)
VALUES ('schema_phase', '4', '2026-09-07T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
