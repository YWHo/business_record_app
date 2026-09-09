PRAGMA quick_check;
PRAGMA foreign_key_check;

SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM business_activities) AS business_activities,
  (SELECT COUNT(*) FROM vehicles) AS vehicles,
  (SELECT COUNT(*) FROM expense_categories) AS expense_categories,
  (SELECT COUNT(*) FROM clients) AS clients,
  (SELECT COUNT(*) FROM retention_settings) AS retention_settings,
  (SELECT COUNT(*) FROM export_history) AS export_history,
  (SELECT value FROM runtime_metadata WHERE key = 'schema_phase') AS schema_phase;

SELECT
  COUNT(*) AS application_table_count
FROM sqlite_schema
WHERE type = 'table'
  AND name NOT LIKE '_cf_%'
  AND name NOT LIKE 'sqlite_%'
  AND name != 'd1_migrations';

SELECT
  name,
  type,
  "notnull" AS required,
  dflt_value AS default_value
FROM pragma_table_info('attachments')
WHERE name = 'display_rotation_degrees';
