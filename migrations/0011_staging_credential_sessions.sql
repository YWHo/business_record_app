-- Verifiers remain backend secrets. Only their binding fingerprints live in D1.
ALTER TABLE sessions ADD COLUMN staging_credential_version TEXT
  CHECK (staging_credential_version IS NULL OR length(staging_credential_version)=64);
CREATE TABLE staging_auth_identities (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  credential_fingerprint TEXT NOT NULL CHECK (length(credential_fingerprint)=64),
  synced_at TEXT NOT NULL
);
