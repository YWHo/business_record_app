PRAGMA quick_check;
PRAGMA foreign_key_check;

SELECT
  (SELECT COUNT(*) FROM users WHERE role = 'OWNER' AND status = 'ACTIVE') AS active_owners,
  (SELECT COUNT(*) FROM users WHERE role = 'ACCOUNTANT' AND status = 'ACTIVE') AS active_accountants,
  (SELECT COUNT(*) FROM business_activities) AS activities,
  (SELECT COUNT(*) FROM vehicles) AS vehicles,
  (SELECT COUNT(*) FROM work_sessions) AS work_sessions,
  (SELECT COUNT(*) FROM expenses) AS expenses,
  (SELECT COUNT(*) FROM income_records) AS income_records,
  (SELECT COUNT(*) FROM comments) AS comments,
  (SELECT COUNT(*) FROM audit_log) AS audit_events,
  (SELECT COUNT(*) FROM attachments) AS seeded_attachments,
  (SELECT value FROM runtime_metadata WHERE key = 'seed_profile') AS seed_profile,
  (SELECT value FROM runtime_metadata WHERE key = 'schema_phase') AS schema_phase;

SELECT income_type, COUNT(*) AS records
FROM income_records
GROUP BY income_type
ORDER BY income_type;

SELECT expense_type, COUNT(*) AS records
FROM expenses
GROUP BY expense_type
ORDER BY expense_type;
