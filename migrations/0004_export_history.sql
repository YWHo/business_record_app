PRAGMA foreign_keys = ON;

CREATE TABLE export_history (
  id TEXT PRIMARY KEY,
  requested_by TEXT NOT NULL REFERENCES users(id),
  export_scope TEXT NOT NULL CHECK (export_scope IN ('MONTH', 'TAX_YEAR', 'FULL')),
  period_key TEXT,
  expected_record_count INTEGER NOT NULL CHECK (expected_record_count >= 0),
  expected_attachment_count INTEGER NOT NULL CHECK (expected_attachment_count >= 0),
  exported_attachment_count INTEGER NOT NULL CHECK (exported_attachment_count >= 0),
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256) = 64),
  completed_at TEXT NOT NULL,
  CHECK (exported_attachment_count = expected_attachment_count)
);

CREATE INDEX export_history_completed_idx
ON export_history(completed_at DESC);

CREATE INDEX export_history_user_idx
ON export_history(requested_by, completed_at DESC);

INSERT INTO runtime_metadata (key, value, updated_at)
VALUES ('schema_phase', '14', '2026-09-09T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
