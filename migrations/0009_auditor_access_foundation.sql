-- D1 applies migrations transactionally. Keep historical references while
-- rebuilding CHECK constraints; never disable foreign-key enforcement.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE users_auditor_upgrade (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ACCOUNTANT', 'AUDITOR')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  display_name TEXT CHECK (display_name IS NULL OR length(trim(display_name)) > 0)
);
INSERT INTO users_auditor_upgrade SELECT id,email,role,status,created_at,updated_at,display_name FROM users;
DROP TABLE users;
ALTER TABLE users_auditor_upgrade RENAME TO users;

CREATE TABLE business_account_members_auditor_upgrade (
  business_account_id TEXT NOT NULL DEFAULT 'business-account-primary' REFERENCES business_accounts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ACCOUNTANT', 'AUDITOR', 'ADMIN', 'BOOKKEEPER', 'MEMBER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED', 'ACTIVE', 'DISABLED', 'EXPIRED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  access_starts_at TEXT,
  access_expires_at TEXT,
  PRIMARY KEY (business_account_id, user_id),
  CHECK (access_starts_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', access_starts_at) IS access_starts_at),
  CHECK (access_expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', access_expires_at) IS access_expires_at),
  CHECK (access_starts_at IS NULL OR access_expires_at IS NULL OR access_starts_at < access_expires_at),
  CHECK (role <> 'AUDITOR' OR access_expires_at IS NOT NULL)
);
INSERT INTO business_account_members_auditor_upgrade
  (business_account_id,user_id,role,status,created_at,updated_at)
SELECT business_account_id,user_id,role,status,created_at,updated_at FROM business_account_members;
DROP TABLE business_account_members;
ALTER TABLE business_account_members_auditor_upgrade RENAME TO business_account_members;
CREATE INDEX business_account_members_user_idx ON business_account_members(user_id,status,business_account_id);
CREATE UNIQUE INDEX business_account_single_owner_idx ON business_account_members(business_account_id)
  WHERE role = 'OWNER' AND status = 'ACTIVE';
CREATE INDEX business_account_members_expiry_idx ON business_account_members(access_expires_at,status)
  WHERE access_expires_at IS NOT NULL;

CREATE TABLE invitations_auditor_upgrade (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'ACCOUNTANT' CHECK (role IN ('ACCOUNTANT', 'AUDITOR')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL,
  business_account_id TEXT NOT NULL DEFAULT 'business-account-primary' REFERENCES business_accounts(id),
  access_starts_at TEXT,
  access_expires_at TEXT,
  note TEXT CHECK (note IS NULL OR length(trim(note)) > 0),
  UNIQUE (business_account_id,id),
  CHECK (access_starts_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', access_starts_at) IS access_starts_at),
  CHECK (access_expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', access_expires_at) IS access_expires_at),
  CHECK (access_starts_at IS NULL OR access_expires_at IS NULL OR access_starts_at < access_expires_at),
  CHECK (role <> 'AUDITOR' OR access_expires_at IS NOT NULL)
);
INSERT INTO invitations_auditor_upgrade
  (id,email,role,token_hash,invited_by,expires_at,accepted_at,created_at,business_account_id)
SELECT id,email,role,token_hash,invited_by,expires_at,accepted_at,created_at,business_account_id FROM invitations;
DROP TABLE invitations;
ALTER TABLE invitations_auditor_upgrade RENAME TO invitations;
CREATE INDEX invitations_email_idx ON invitations(email);
CREATE INDEX invitations_expires_at_idx ON invitations(expires_at);
CREATE INDEX invitations_account_idx ON invitations(business_account_id,created_at);

CREATE TABLE membership_access_scopes (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  business_account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('ACCOUNT','BUSINESS','LEGAL_ENTITY')),
  business_id TEXT,
  legal_entity_id TEXT,
  date_from TEXT,
  date_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (business_account_id,user_id) REFERENCES business_account_members(business_account_id,user_id),
  FOREIGN KEY (business_account_id,business_id) REFERENCES businesses(business_account_id,id),
  FOREIGN KEY (business_account_id,legal_entity_id) REFERENCES business_entities(business_account_id,id),
  CHECK ((scope_type = 'ACCOUNT' AND business_id IS NULL AND legal_entity_id IS NULL)
      OR (scope_type = 'BUSINESS' AND business_id IS NOT NULL AND legal_entity_id IS NULL)
      OR (scope_type = 'LEGAL_ENTITY' AND business_id IS NULL AND legal_entity_id IS NOT NULL)),
  CHECK (date_from IS NULL OR (length(date_from) = 10 AND date(date_from,'+0 days') IS date_from)),
  CHECK (date_to IS NULL OR (length(date_to) = 10 AND date(date_to,'+0 days') IS date_to)),
  CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to)
);
CREATE INDEX membership_access_scopes_member_idx ON membership_access_scopes(business_account_id,user_id);
CREATE INDEX membership_access_scopes_business_idx ON membership_access_scopes(business_account_id,business_id,date_from,date_to);
CREATE INDEX membership_access_scopes_entity_idx ON membership_access_scopes(business_account_id,legal_entity_id,date_from,date_to);

CREATE TABLE invitation_access_scopes (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  business_account_id TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('ACCOUNT','BUSINESS','LEGAL_ENTITY')),
  business_id TEXT,
  legal_entity_id TEXT,
  date_from TEXT,
  date_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (business_account_id,invitation_id) REFERENCES invitations(business_account_id,id),
  FOREIGN KEY (business_account_id,business_id) REFERENCES businesses(business_account_id,id),
  FOREIGN KEY (business_account_id,legal_entity_id) REFERENCES business_entities(business_account_id,id),
  CHECK ((scope_type = 'ACCOUNT' AND business_id IS NULL AND legal_entity_id IS NULL)
      OR (scope_type = 'BUSINESS' AND business_id IS NOT NULL AND legal_entity_id IS NULL)
      OR (scope_type = 'LEGAL_ENTITY' AND business_id IS NULL AND legal_entity_id IS NOT NULL)),
  CHECK (date_from IS NULL OR (length(date_from) = 10 AND date(date_from,'+0 days') IS date_from)),
  CHECK (date_to IS NULL OR (length(date_to) = 10 AND date(date_to,'+0 days') IS date_to)),
  CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to)
);
CREATE INDEX invitation_access_scopes_invitation_idx ON invitation_access_scopes(business_account_id,invitation_id);

INSERT INTO membership_access_scopes (business_account_id,user_id,scope_type,created_at,updated_at)
SELECT business_account_id,user_id,'ACCOUNT',created_at,updated_at
FROM business_account_members WHERE role IN ('OWNER','ACCOUNTANT');
INSERT INTO invitation_access_scopes (business_account_id,invitation_id,scope_type,created_at,updated_at)
SELECT business_account_id,id,'ACCOUNT',created_at,created_at FROM invitations WHERE role = 'ACCOUNTANT';

-- Preserve unchanged bootstrap, accountant invitation, and synthetic seed paths.
-- No implicit grant is ever created for an auditor or a reserved future role.
CREATE TRIGGER membership_legacy_account_scope AFTER INSERT ON business_account_members
WHEN NEW.role IN ('OWNER','ACCOUNTANT')
BEGIN
  INSERT INTO membership_access_scopes (business_account_id,user_id,scope_type,created_at,updated_at)
  VALUES (NEW.business_account_id,NEW.user_id,'ACCOUNT',NEW.created_at,NEW.updated_at);
END;
CREATE TRIGGER invitation_legacy_account_scope AFTER INSERT ON invitations
WHEN NEW.role = 'ACCOUNTANT'
BEGIN
  INSERT INTO invitation_access_scopes (business_account_id,invitation_id,scope_type,created_at,updated_at)
  VALUES (NEW.business_account_id,NEW.id,'ACCOUNT',NEW.created_at,NEW.created_at);
END;

-- Check the rebuilt graph before ending deferral (including old actor/outbox
-- references). A CHECK failure aborts the migration instead of losing history.
CREATE TABLE auditor_upgrade_integrity_guard (violations INTEGER CHECK (violations = 0));
INSERT INTO auditor_upgrade_integrity_guard SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE auditor_upgrade_integrity_guard;
PRAGMA defer_foreign_keys = OFF;
