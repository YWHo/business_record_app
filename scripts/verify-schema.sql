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
  (SELECT COUNT(*) FROM business_accounts) AS business_accounts,
  (SELECT COUNT(*) FROM business_entities) AS business_entities,
  (SELECT COUNT(*) FROM businesses) AS businesses,
  (SELECT COUNT(*) FROM business_entity_periods) AS business_entity_periods,
  (SELECT COUNT(*) FROM business_account_members) AS memberships,
  (SELECT value FROM runtime_metadata WHERE key = 'schema_phase') AS schema_phase,
  (SELECT value FROM runtime_metadata WHERE key = 'schema_architecture') AS schema_architecture;

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

SELECT name, "notnull" AS required
FROM pragma_table_info('expenses')
WHERE name = 'business_account_id';

SELECT name, "notnull" AS required
FROM pragma_table_info('expenses')
WHERE name IN ('business_id', 'legal_entity_id')
ORDER BY name;

SELECT name
FROM sqlite_schema
WHERE type IN ('index', 'trigger')
  AND name IN (
    'business_entity_periods_one_current_idx',
    'business_entity_periods_no_overlap_insert',
    'business_entity_periods_no_overlap_update'
  )
ORDER BY name;
