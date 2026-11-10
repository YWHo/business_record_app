-- Additive lifecycle metadata; keep identities, invitations and grants intact.
ALTER TABLE invitations ADD COLUMN revoked_at TEXT
  CHECK (revoked_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', revoked_at) IS revoked_at);
ALTER TABLE invitations ADD COLUMN access_revision INTEGER NOT NULL DEFAULT 1
  CHECK (access_revision > 0);
ALTER TABLE business_account_members ADD COLUMN access_revision INTEGER NOT NULL DEFAULT 1
  CHECK (access_revision > 0);

-- A transient row makes a failed optimistic precondition abort the entire D1
-- batch. Successful batches remove their guard; failed batches roll it back.
CREATE TABLE access_control_guards (
  id TEXT PRIMARY KEY,
  business_account_id TEXT NOT NULL REFERENCES business_accounts(id),
  valid INTEGER NOT NULL CONSTRAINT access_control_precondition CHECK (valid = 1)
);
CREATE INDEX invitations_pending_access_idx
  ON invitations(business_account_id,email,role,accepted_at,revoked_at,expires_at);
