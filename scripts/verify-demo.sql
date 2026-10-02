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

SELECT business.name,
  COUNT(DISTINCT expense.id) AS expenses,
  COUNT(DISTINCT income.id) AS income_records,
  COUNT(DISTINCT session.id) AS work_sessions,
  COUNT(DISTINCT expense.id) + COUNT(DISTINCT income.id) +
    COUNT(DISTINCT session.id) AS total_records
FROM businesses AS business
LEFT JOIN expenses AS expense ON expense.business_id = business.id
LEFT JOIN income_records AS income ON income.business_id = business.id
LEFT JOIN work_sessions AS session ON session.business_id = business.id
GROUP BY business.id, business.name
ORDER BY business.name;

SELECT
  (SELECT COUNT(*) FROM work_sessions
    WHERE business_id = 'business-demo-activity-delivery'
      AND date(started_at) BETWEEN '2026-09-21' AND '2026-09-30') AS delivery_sessions,
  (SELECT COUNT(*) FROM work_sessions
    WHERE business_id = 'business-demo-activity-rideshare'
      AND date(started_at) BETWEEN '2026-09-21' AND '2026-09-30') AS rideshare_sessions,
  (SELECT COUNT(*) FROM income_records
    WHERE id LIKE 'demo-contract-week-%'
      AND strftime('%w', transaction_date) = '5') AS friday_contract_payments,
  (SELECT COUNT(*)
    FROM work_sessions AS delivery
    JOIN work_sessions AS rideshare
      ON delivery.vehicle_id = rideshare.vehicle_id
      AND delivery.business_id = 'business-demo-activity-delivery'
      AND rideshare.business_id = 'business-demo-activity-rideshare'
      AND delivery.started_at < rideshare.ended_at
      AND rideshare.started_at < delivery.ended_at) AS overlapping_driving_sessions;

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
