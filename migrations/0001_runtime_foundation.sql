PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ACCOUNTANT')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'ACCOUNTANT' CHECK (role = 'ACCOUNTANT'),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX invitations_email_idx ON invitations(email);
CREATE INDEX invitations_expires_at_idx ON invitations(expires_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

-- Written only by loopback-only development routes. This replaces real email
-- delivery while exercising the same invitation token lifecycle.
CREATE TABLE development_outbox (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL UNIQUE REFERENCES invitations(id),
  recipient_email TEXT NOT NULL COLLATE NOCASE,
  invitation_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE runtime_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
