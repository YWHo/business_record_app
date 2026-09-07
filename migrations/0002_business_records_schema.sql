PRAGMA foreign_keys = ON;

CREATE TABLE business_activities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  activity_type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX business_activities_active_idx ON business_activities(active, name);

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  registration TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  acquired_at TEXT,
  retired_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (retired_at IS NULL OR acquired_at IS NULL OR retired_at >= acquired_at)
);

CREATE INDEX vehicles_active_idx ON vehicles(active, registration);

CREATE TABLE expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  system_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX expense_categories_active_idx ON expense_categories(active, name);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX clients_active_idx ON clients(active, name);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  business_activity_id TEXT REFERENCES business_activities(id),
  expense_type TEXT NOT NULL CHECK (expense_type IN ('FUEL', 'PARKING', 'INSURANCE', 'GENERAL')),
  expense_category_id TEXT REFERENCES expense_categories(id),
  merchant_name TEXT NOT NULL,
  purchase_datetime TEXT NOT NULL,
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'NZD' CHECK (length(currency) = 3 AND currency = upper(currency)),
  gst_amount_minor INTEGER CHECK (gst_amount_minor >= 0 AND gst_amount_minor <= total_amount_minor),
  gst_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (gst_status IN ('UNKNOWN', 'GST_INCLUDED', 'NO_GST', 'REVIEW_REQUIRED')),
  description TEXT,
  recurrence_type TEXT NOT NULL DEFAULT 'ONE_OFF' CHECK (recurrence_type IN ('ONE_OFF', 'RECURRING')),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'MISSING_INFORMATION', 'READY_FOR_REVIEW', 'REVIEWED', 'PROCESSED', 'VOIDED', 'TRASHED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  retention_until TEXT NOT NULL,
  purge_eligible_at TEXT NOT NULL,
  purged_at TEXT,
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CHECK (purge_eligible_at >= retention_until)
);

CREATE INDEX expenses_purchase_datetime_idx ON expenses(purchase_datetime);
CREATE INDEX expenses_activity_idx ON expenses(business_activity_id, purchase_datetime);
CREATE INDEX expenses_category_idx ON expenses(expense_category_id, purchase_datetime);
CREATE INDEX expenses_status_idx ON expenses(status, purchase_datetime);
CREATE INDEX expenses_merchant_idx ON expenses(merchant_name COLLATE NOCASE);
CREATE INDEX expenses_retention_idx ON expenses(purge_eligible_at, status);

CREATE TABLE fuel_expense_details (
  expense_id TEXT PRIMARY KEY REFERENCES expenses(id),
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  fuel_station TEXT,
  fuel_price_micros_per_litre INTEGER CHECK (fuel_price_micros_per_litre > 0),
  fuel_litres REAL CHECK (fuel_litres > 0),
  odometer_km REAL CHECK (odometer_km >= 0),
  fill_type TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (fill_type IN ('FULL', 'PARTIAL', 'UNKNOWN')),
  notes TEXT
);

CREATE INDEX fuel_details_vehicle_odometer_idx ON fuel_expense_details(vehicle_id, odometer_km);

CREATE TABLE parking_expense_details (
  expense_id TEXT PRIMARY KEY REFERENCES expenses(id),
  vehicle_id TEXT REFERENCES vehicles(id),
  parking_provider TEXT,
  parking_location TEXT NOT NULL,
  parking_start_datetime TEXT,
  parking_end_datetime TEXT,
  parking_reference TEXT,
  CHECK (
    parking_end_datetime IS NULL OR
    parking_start_datetime IS NULL OR
    parking_end_datetime >= parking_start_datetime
  )
);

CREATE INDEX parking_details_vehicle_idx ON parking_expense_details(vehicle_id);

CREATE TABLE insurance_expense_details (
  expense_id TEXT PRIMARY KEY REFERENCES expenses(id),
  insurance_type TEXT NOT NULL CHECK (insurance_type IN ('PROFESSIONAL_LIABILITY', 'VEHICLE', 'OTHER')),
  provider TEXT NOT NULL,
  policy_number TEXT,
  policy_period_start TEXT NOT NULL,
  policy_period_end TEXT NOT NULL,
  vehicle_id TEXT REFERENCES vehicles(id),
  CHECK (policy_period_end >= policy_period_start),
  CHECK (insurance_type != 'VEHICLE' OR vehicle_id IS NOT NULL)
);

CREATE TABLE expense_allocations (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  business_activity_id TEXT REFERENCES business_activities(id),
  allocation_method TEXT NOT NULL CHECK (allocation_method IN ('100_PERCENT_BUSINESS', 'MANUAL_PERCENTAGE', 'BUSINESS_KM_OVER_TOTAL_KM', 'ACCOUNTANT_ADJUSTMENT', 'UNDETERMINED')),
  percentage_basis_points INTEGER CHECK (percentage_basis_points BETWEEN 0 AND 10000),
  allocated_amount_minor INTEGER CHECK (allocated_amount_minor >= 0),
  calculation_period_start TEXT,
  calculation_period_end TEXT,
  notes TEXT,
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    calculation_period_end IS NULL OR
    calculation_period_start IS NULL OR
    calculation_period_end >= calculation_period_start
  )
);

CREATE INDEX expense_allocations_expense_idx ON expense_allocations(expense_id);
CREATE INDEX expense_allocations_activity_idx ON expense_allocations(business_activity_id);

CREATE TABLE work_sessions (
  id TEXT PRIMARY KEY,
  business_activity_id TEXT NOT NULL REFERENCES business_activities(id),
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  odometer_start_km REAL NOT NULL CHECK (odometer_start_km >= 0),
  odometer_end_km REAL NOT NULL CHECK (odometer_end_km >= odometer_start_km),
  distance_km REAL GENERATED ALWAYS AS (odometer_end_km - odometer_start_km) STORED,
  gross_revenue_minor INTEGER CHECK (gross_revenue_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'NZD' CHECK (length(currency) = 3 AND currency = upper(currency)),
  notes TEXT,
  tank_full_at_start INTEGER CHECK (tank_full_at_start IN (0, 1)),
  no_personal_driving INTEGER CHECK (no_personal_driving IN (0, 1)),
  tank_full_at_end INTEGER CHECK (tank_full_at_end IN (0, 1)),
  starting_fuel_expense_id TEXT REFERENCES expenses(id),
  ending_fuel_expense_id TEXT REFERENCES expenses(id),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'MISSING_INFORMATION', 'READY_FOR_REVIEW', 'REVIEWED', 'PROCESSED', 'VOIDED', 'TRASHED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  retention_until TEXT NOT NULL,
  purge_eligible_at TEXT NOT NULL,
  purged_at TEXT,
  CHECK (ended_at >= started_at),
  CHECK (starting_fuel_expense_id IS NULL OR starting_fuel_expense_id != ending_fuel_expense_id),
  CHECK (purge_eligible_at >= retention_until)
);

CREATE INDEX work_sessions_activity_date_idx ON work_sessions(business_activity_id, started_at);
CREATE INDEX work_sessions_vehicle_date_idx ON work_sessions(vehicle_id, started_at);
CREATE INDEX work_sessions_status_idx ON work_sessions(status, started_at);

CREATE TABLE income_records (
  id TEXT PRIMARY KEY,
  business_activity_id TEXT NOT NULL REFERENCES business_activities(id),
  income_type TEXT NOT NULL CHECK (income_type IN ('PLATFORM', 'CONTRACT', 'SUBSCRIPTION', 'GENERAL')),
  received_from TEXT,
  transaction_date TEXT NOT NULL,
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'NZD' CHECK (length(currency) = 3 AND currency = upper(currency)),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'MISSING_INFORMATION', 'READY_FOR_REVIEW', 'REVIEWED', 'PROCESSED', 'VOIDED', 'TRASHED')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  retention_until TEXT NOT NULL,
  purge_eligible_at TEXT NOT NULL,
  purged_at TEXT,
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CHECK (purge_eligible_at >= retention_until)
);

CREATE INDEX income_records_date_idx ON income_records(transaction_date);
CREATE INDEX income_records_activity_idx ON income_records(business_activity_id, transaction_date);
CREATE INDEX income_records_type_idx ON income_records(income_type, transaction_date);
CREATE INDEX income_records_status_idx ON income_records(status, transaction_date);
CREATE INDEX income_records_retention_idx ON income_records(purge_eligible_at, status);

CREATE TABLE platform_income_details (
  income_id TEXT PRIMARY KEY REFERENCES income_records(id),
  provider_name TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  gross_earnings_minor INTEGER NOT NULL CHECK (gross_earnings_minor >= 0),
  tips_minor INTEGER NOT NULL DEFAULT 0 CHECK (tips_minor >= 0),
  bonuses_promotions_minor INTEGER NOT NULL DEFAULT 0 CHECK (bonuses_promotions_minor >= 0),
  flat_rate_credit_minor INTEGER NOT NULL DEFAULT 0 CHECK (flat_rate_credit_minor >= 0),
  platform_fees_minor INTEGER NOT NULL DEFAULT 0 CHECK (platform_fees_minor >= 0),
  other_adjustments_minor INTEGER NOT NULL DEFAULT 0,
  net_payment_received_minor INTEGER NOT NULL CHECK (net_payment_received_minor >= 0),
  CHECK (period_end >= period_start)
);

CREATE INDEX platform_income_period_idx ON platform_income_details(period_start, period_end);
CREATE INDEX platform_income_provider_idx ON platform_income_details(provider_name COLLATE NOCASE);

CREATE TABLE contract_income_details (
  income_id TEXT PRIMARY KEY REFERENCES income_records(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  service_period_start TEXT,
  service_period_end TEXT,
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  gst_amount_minor INTEGER CHECK (gst_amount_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  due_date TEXT,
  payment_received_date TEXT,
  amount_received_minor INTEGER CHECK (amount_received_minor >= 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID')),
  CHECK (
    service_period_end IS NULL OR
    service_period_start IS NULL OR
    service_period_end >= service_period_start
  ),
  UNIQUE (client_id, invoice_number)
);

CREATE INDEX contract_income_invoice_date_idx ON contract_income_details(invoice_date);
CREATE INDEX contract_income_payment_status_idx ON contract_income_details(payment_status, due_date);

CREATE TABLE subscription_income_details (
  income_id TEXT PRIMARY KEY REFERENCES income_records(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  gross_subscription_revenue_minor INTEGER NOT NULL CHECK (gross_subscription_revenue_minor >= 0),
  refunds_minor INTEGER NOT NULL DEFAULT 0 CHECK (refunds_minor >= 0),
  platform_fees_minor INTEGER NOT NULL DEFAULT 0 CHECK (platform_fees_minor >= 0),
  payment_processing_fees_minor INTEGER NOT NULL DEFAULT 0 CHECK (payment_processing_fees_minor >= 0),
  net_payment_received_minor INTEGER NOT NULL CHECK (net_payment_received_minor >= 0),
  subscriber_count INTEGER CHECK (subscriber_count >= 0),
  new_subscribers INTEGER CHECK (new_subscribers >= 0),
  cancelled_subscribers INTEGER CHECK (cancelled_subscribers >= 0),
  CHECK (period_end >= period_start)
);

CREATE INDEX subscription_income_period_idx ON subscription_income_details(period_start, period_end);

CREATE TABLE income_reconciliations (
  id TEXT PRIMARY KEY,
  income_id TEXT NOT NULL REFERENCES income_records(id),
  expected_amount_minor INTEGER NOT NULL CHECK (expected_amount_minor >= 0),
  actual_amount_minor INTEGER NOT NULL CHECK (actual_amount_minor >= 0),
  difference_amount_minor INTEGER GENERATED ALWAYS AS (actual_amount_minor - expected_amount_minor) STORED,
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0, 1)),
  notes TEXT,
  reconciled_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX income_reconciliations_income_idx ON income_reconciliations(income_id);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('EXPENSE', 'INCOME', 'WORK_SESSION')),
  record_id TEXT NOT NULL,
  version_group_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 26214400),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  retention_until TEXT NOT NULL,
  purge_eligible_at TEXT NOT NULL,
  purged_at TEXT,
  UNIQUE (version_group_id, version_number),
  CHECK (purge_eligible_at >= retention_until)
);

CREATE INDEX attachments_record_idx ON attachments(record_type, record_id, created_at);
CREATE INDEX attachments_sha256_idx ON attachments(sha256);
CREATE UNIQUE INDEX attachments_current_version_idx ON attachments(version_group_id) WHERE is_current = 1;

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('EXPENSE', 'INCOME', 'WORK_SESSION')),
  record_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL CHECK (length(trim(message)) > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX comments_record_idx ON comments(record_type, record_id, created_at);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  business_activity_id TEXT REFERENCES business_activities(id),
  summary TEXT NOT NULL,
  changed_fields_json TEXT CHECK (changed_fields_json IS NULL OR json_valid(changed_fields_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX audit_log_entity_idx ON audit_log(entity_type, entity_id, created_at);
CREATE INDEX audit_log_user_idx ON audit_log(user_id, created_at);
CREATE INDEX audit_log_action_idx ON audit_log(action, created_at);
CREATE INDEX audit_log_activity_idx ON audit_log(business_activity_id, created_at);

CREATE TABLE saved_filters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  filter_type TEXT NOT NULL CHECK (filter_type IN ('TRANSACTIONS', 'RECEIPTS', 'AUDIT')),
  criteria_json TEXT NOT NULL CHECK (json_valid(criteria_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, filter_type, name)
);

CREATE TABLE retention_settings (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  retention_tax_years INTEGER NOT NULL DEFAULT 10 CHECK (retention_tax_years >= 7),
  tax_year_end_month INTEGER NOT NULL DEFAULT 3 CHECK (tax_year_end_month BETWEEN 1 AND 12),
  tax_year_end_day INTEGER NOT NULL DEFAULT 31 CHECK (tax_year_end_day BETWEEN 1 AND 31),
  backup_reminder_days INTEGER NOT NULL DEFAULT 30 CHECK (backup_reminder_days > 0),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

INSERT INTO expense_categories (id, name, active, system_key, created_at, updated_at)
VALUES
  ('category-fuel', 'Fuel', 1, 'FUEL', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-parking', 'Parking', 1, 'PARKING', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-vehicle-insurance', 'Vehicle Insurance', 1, 'VEHICLE_INSURANCE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-liability-insurance', 'Professional Liability Insurance', 1, 'PROFESSIONAL_LIABILITY_INSURANCE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-vehicle-maintenance', 'Vehicle Maintenance', 1, 'VEHICLE_MAINTENANCE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-software', 'Software', 1, 'SOFTWARE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-computer-equipment', 'Computer Equipment', 1, 'COMPUTER_EQUIPMENT', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-cloud-hosting', 'Cloud Hosting', 1, 'CLOUD_HOSTING', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-domain-registration', 'Domain Registration', 1, 'DOMAIN_REGISTRATION', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-internet', 'Internet', 1, 'INTERNET', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-mobile', 'Mobile', 1, 'MOBILE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-training', 'Training', 1, 'TRAINING', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-professional-services', 'Professional Services', 1, 'PROFESSIONAL_SERVICES', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-travel', 'Travel', 1, 'TRAVEL', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-payment-processing', 'Payment Processing Fees', 1, 'PAYMENT_PROCESSING_FEES', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('category-general', 'General', 1, 'GENERAL', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO retention_settings (
  singleton_id,
  retention_tax_years,
  tax_year_end_month,
  tax_year_end_day,
  backup_reminder_days,
  updated_by,
  updated_at
)
VALUES (1, 10, 3, 31, 30, NULL, '2026-01-01T00:00:00.000Z');

INSERT INTO runtime_metadata (key, value, updated_at)
VALUES ('schema_phase', '3', '2026-09-07T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
