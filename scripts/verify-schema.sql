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

SELECT
  (SELECT COUNT(*) FROM businesses) AS businesses,
  (SELECT COUNT(*) FROM business_entity_periods) AS business_entity_periods,
  (SELECT COUNT(*) FROM business_entities WHERE attribution_review_required = 1)
    AS legal_entities_requiring_review,
  (SELECT COUNT(*) FROM expenses
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS expenses_missing_attribution,
  (SELECT COUNT(*) FROM income_records
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS income_missing_attribution,
  (SELECT COUNT(*) FROM work_sessions
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS sessions_missing_attribution;

SELECT COUNT(*) AS overlapping_business_period_pairs
FROM business_entity_periods AS left_period
JOIN business_entity_periods AS right_period
  ON right_period.business_id = left_period.business_id
  AND right_period.id > left_period.id
  AND left_period.effective_from <= COALESCE(right_period.effective_to, '9999-12-31')
  AND COALESCE(left_period.effective_to, '9999-12-31') >= right_period.effective_from;

SELECT
  (SELECT COUNT(*) FROM fuel_expense_details
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS fuel_details_missing_attribution,
  (SELECT COUNT(*) FROM parking_expense_details
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS parking_details_missing_attribution,
  (SELECT COUNT(*) FROM insurance_expense_details
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS insurance_details_missing_attribution,
  (SELECT COUNT(*) FROM expense_allocations
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS allocations_missing_attribution,
  (SELECT COUNT(*) FROM platform_income_details
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS platform_details_missing_attribution,
  (SELECT COUNT(*) FROM contract_income_details
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS contract_details_missing_attribution,
  (SELECT COUNT(*) FROM subscription_income_details
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS subscription_details_missing_attribution,
  (SELECT COUNT(*) FROM income_reconciliations
   WHERE business_id IS NULL OR legal_entity_id IS NULL)
    AS reconciliations_missing_attribution;
