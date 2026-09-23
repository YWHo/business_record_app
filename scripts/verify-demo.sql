PRAGMA quick_check;
PRAGMA foreign_key_check;

SELECT
  (SELECT COUNT(*) FROM users WHERE role = 'OWNER' AND status = 'ACTIVE') AS active_owners,
  (SELECT COUNT(*) FROM users WHERE role = 'ACCOUNTANT' AND status = 'ACTIVE') AS active_accountants,
  (SELECT COUNT(*) FROM business_activities) AS activities,
  (SELECT COUNT(*) FROM businesses) AS businesses,
  (SELECT COUNT(*) FROM business_entities) AS legal_entities,
  (SELECT COUNT(*) FROM business_entity_periods) AS business_entity_periods,
  (SELECT COUNT(*) FROM vehicles) AS vehicles,
  (SELECT COUNT(*) FROM work_sessions) AS work_sessions,
  (SELECT COUNT(*) FROM expenses) AS expenses,
  (SELECT COUNT(*) FROM income_records) AS income_records,
  (SELECT COUNT(*) FROM comments) AS comments,
  (SELECT COUNT(*) FROM audit_log) AS audit_events,
  (SELECT COUNT(*) FROM attachments) AS seeded_attachments,
  (SELECT value FROM runtime_metadata WHERE key = 'seed_profile') AS seed_profile,
  (SELECT value FROM runtime_metadata WHERE key = 'schema_phase') AS schema_phase,
  (SELECT value FROM runtime_metadata WHERE key = 'schema_architecture') AS schema_architecture;

SELECT income_type, COUNT(*) AS records
FROM income_records
GROUP BY income_type
ORDER BY income_type;

SELECT expense_type, COUNT(*) AS records
FROM expenses
GROUP BY expense_type
ORDER BY expense_type;

SELECT
  (SELECT COUNT(*) FROM expenses
   WHERE business_id IS NULL OR legal_entity_id IS NULL) AS expenses_missing,
  (SELECT COUNT(*) FROM income_records
   WHERE business_id IS NULL OR legal_entity_id IS NULL) AS income_missing,
  (SELECT COUNT(*) FROM work_sessions
   WHERE business_id IS NULL OR legal_entity_id IS NULL) AS sessions_missing,
  (SELECT COUNT(*) FROM comments
   WHERE business_id IS NULL OR legal_entity_id IS NULL) AS comments_missing,
  (SELECT COUNT(*) FROM audit_log
   WHERE business_activity_id IS NOT NULL
     AND (business_id IS NULL OR legal_entity_id IS NULL)) AS audit_missing;

SELECT
  business.name,
  business.description,
  entity.legal_name,
  entity.entity_type,
  period.effective_from,
  period.effective_to
FROM businesses AS business
JOIN business_entity_periods AS period ON period.business_id = business.id
JOIN business_entities AS entity ON entity.id = period.legal_entity_id
ORDER BY business.name, period.effective_from;
