PRAGMA foreign_keys = ON;

ALTER TABLE attachments
ADD COLUMN display_rotation_degrees INTEGER NOT NULL DEFAULT 0
CHECK (display_rotation_degrees IN (0, 90, 180, 270));

INSERT INTO runtime_metadata (key, value, updated_at)
VALUES ('schema_phase', '16', '2026-09-10T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
