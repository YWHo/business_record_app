-- Representative private-workspace data as it existed after migration 0005.
-- Keep this fixture deliberately small while exercising each attribution path.
INSERT INTO users (
  id, email, role, status, created_at, updated_at
) VALUES (
  'legacy-owner', 'legacy-owner@example.invalid', 'OWNER', 'ACTIVE',
  '2025-03-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z'
);

INSERT INTO business_activities (
  id, name, activity_type, active, started_at, created_at, updated_at
) VALUES (
  'legacy-consulting', 'Legacy Consulting', 'PROFESSIONAL_SERVICES', 1,
  '2025-04-01', '2025-03-15T00:00:00.000Z', '2025-03-15T00:00:00.000Z'
);

INSERT INTO vehicles (
  id, registration, description, active, acquired_at, created_at, updated_at
) VALUES (
  'legacy-vehicle', 'OLD123', 'Legacy vehicle', 1, '2025-03-20',
  '2025-03-20T00:00:00.000Z', '2025-03-20T00:00:00.000Z'
);

INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_status, description,
  status, created_by, created_at, updated_at, retention_until,
  purge_eligible_at
) VALUES (
  'legacy-expense', 'legacy-consulting', 'GENERAL', 'category-general',
  'Legacy Supplier', '2025-05-10T10:00:00.000Z', 12500, 'NZD', 'UNKNOWN',
  'Representative expense', 'READY_FOR_REVIEW', 'legacy-owner',
  '2025-05-10T10:05:00.000Z', '2025-05-10T10:05:00.000Z',
  '2035-03-31', '2035-04-01'
);

INSERT INTO work_sessions (
  id, business_activity_id, vehicle_id, started_at, ended_at,
  odometer_start_km, odometer_end_km, gross_revenue_minor, currency, status,
  created_by, created_at, updated_at, retention_until, purge_eligible_at
) VALUES (
  'legacy-session', 'legacy-consulting', 'legacy-vehicle',
  '2025-05-11T08:00:00.000Z', '2025-05-11T09:00:00.000Z',
  1000, 1025, 8000, 'NZD', 'READY_FOR_REVIEW', 'legacy-owner',
  '2025-05-11T09:05:00.000Z', '2025-05-11T09:05:00.000Z',
  '2035-03-31', '2035-04-01'
);

INSERT INTO income_records (
  id, business_activity_id, income_type, received_from, transaction_date,
  total_amount_minor, currency, status, notes, created_by, created_at,
  updated_at, retention_until, purge_eligible_at
) VALUES (
  'legacy-income', 'legacy-consulting', 'GENERAL', 'Legacy Customer',
  '2025-05-12', 50000, 'NZD', 'READY_FOR_REVIEW',
  'Representative income', 'legacy-owner', '2025-05-12T12:00:00.000Z',
  '2025-05-12T12:00:00.000Z', '2035-03-31', '2035-04-01'
);

INSERT INTO attachments (
  id, record_type, record_id, version_group_id, object_key,
  original_filename, mime_type, file_size, sha256, created_by, created_at,
  retention_until, purge_eligible_at
) VALUES (
  'legacy-attachment', 'EXPENSE', 'legacy-expense', 'legacy-version-group',
  'legacy/expense-receipt.pdf', 'expense-receipt.pdf', 'application/pdf', 128,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'legacy-owner', '2025-05-10T10:06:00.000Z', '2035-03-31', '2035-04-01'
);

INSERT INTO comments (
  id, record_type, record_id, author_id, message, created_at
) VALUES (
  'legacy-comment', 'EXPENSE', 'legacy-expense', 'legacy-owner',
  'Representative comment', '2025-05-10T10:07:00.000Z'
);

INSERT INTO audit_log (
  id, user_id, action, entity_type, entity_id, business_activity_id, summary,
  changed_fields_json, created_at
) VALUES (
  'legacy-audit', 'legacy-owner', 'CREATE', 'EXPENSE', 'legacy-expense',
  'legacy-consulting', 'Created representative expense', '{}',
  '2025-05-10T10:05:00.000Z'
);
