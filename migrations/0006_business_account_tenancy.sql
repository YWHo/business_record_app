PRAGMA foreign_keys = OFF;

CREATE TABLE business_accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  plan TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (plan IN ('PRIVATE', 'FREE', 'BASIC', 'STANDARD', 'PRO')),
  subscription_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (subscription_status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE business_entities (
  id TEXT PRIMARY KEY,
  business_account_id TEXT NOT NULL DEFAULT 'business-account-primary' REFERENCES business_accounts(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('SOLE_TRADER', 'LIMITED_COMPANY', 'PARTNERSHIP', 'TRUST', 'OTHER')),
  legal_name TEXT,
  trading_name TEXT,
  nzbn TEXT,
  company_number TEXT,
  country TEXT NOT NULL DEFAULT 'NZ',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (legal_name IS NULL OR length(trim(legal_name)) > 0),
  CHECK (trading_name IS NULL OR length(trim(trading_name)) > 0)
);

CREATE INDEX business_entities_account_idx
ON business_entities(business_account_id, active);

CREATE TABLE business_account_members (
  business_account_id TEXT NOT NULL DEFAULT 'business-account-primary' REFERENCES business_accounts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ACCOUNTANT', 'ADMIN', 'BOOKKEEPER', 'MEMBER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (business_account_id, user_id)
);

CREATE INDEX business_account_members_user_idx
ON business_account_members(user_id, status, business_account_id);

CREATE UNIQUE INDEX business_account_single_owner_idx
ON business_account_members(business_account_id)
WHERE role = 'OWNER' AND status = 'ACTIVE';

DROP INDEX users_single_owner_idx;

INSERT INTO business_accounts (
  id, display_name, status, plan, subscription_status, created_at, updated_at
) VALUES (
  'business-account-primary', 'Business Records', 'ACTIVE', 'PRIVATE', 'ACTIVE',
  '2026-09-13T00:00:00.000Z', '2026-09-13T00:00:00.000Z'
);

INSERT INTO business_entities (
  id, business_account_id, entity_type, legal_name, trading_name, country,
  active, created_at, updated_at
) VALUES (
  'business-entity-primary', 'business-account-primary', 'SOLE_TRADER', NULL,
  NULL, 'NZ', 1, '2026-09-13T00:00:00.000Z', '2026-09-13T00:00:00.000Z'
);

INSERT INTO business_account_members (
  business_account_id, user_id, role, status, created_at, updated_at
)
SELECT
  'business-account-primary', id, role, status, created_at, updated_at
FROM users;

ALTER TABLE invitations
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE sessions
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE business_activities
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE vehicles
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE expense_categories
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE clients
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE expenses
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE expense_allocations
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE fuel_expense_details
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE parking_expense_details
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE insurance_expense_details
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE work_sessions
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE income_records
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE income_reconciliations
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE platform_income_details
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE contract_income_details
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE subscription_income_details
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE attachments
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE comments
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE audit_log
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE saved_filters
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

ALTER TABLE export_history
ADD COLUMN business_account_id TEXT NOT NULL DEFAULT 'business-account-primary';

-- Rebuild reference tables so human identifiers are unique inside a workspace,
-- not globally across every future tenant.
CREATE TABLE business_activities_tenant (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  activity_type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  business_account_id TEXT NOT NULL DEFAULT 'business-account-primary' REFERENCES business_accounts(id),
  UNIQUE (business_account_id, name),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
INSERT INTO business_activities_tenant SELECT * FROM business_activities;
DROP TABLE business_activities;
ALTER TABLE business_activities_tenant RENAME TO business_activities;

CREATE TABLE vehicles_tenant (
  id TEXT PRIMARY KEY,
  registration TEXT NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  acquired_at TEXT,
  retired_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  business_account_id TEXT NOT NULL DEFAULT 'business-account-primary' REFERENCES business_accounts(id),
  UNIQUE (business_account_id, registration),
  CHECK (retired_at IS NULL OR acquired_at IS NULL OR retired_at >= acquired_at)
);
INSERT INTO vehicles_tenant SELECT * FROM vehicles;
DROP TABLE vehicles;
ALTER TABLE vehicles_tenant RENAME TO vehicles;

CREATE TABLE expense_categories_tenant (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  system_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  business_account_id TEXT NOT NULL DEFAULT 'business-account-primary' REFERENCES business_accounts(id),
  UNIQUE (business_account_id, name),
  UNIQUE (business_account_id, system_key)
);
INSERT INTO expense_categories_tenant SELECT * FROM expense_categories;
DROP TABLE expense_categories;
ALTER TABLE expense_categories_tenant RENAME TO expense_categories;

CREATE TABLE clients_tenant (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  business_account_id TEXT NOT NULL DEFAULT 'business-account-primary' REFERENCES business_accounts(id),
  UNIQUE (business_account_id, name)
);
INSERT INTO clients_tenant SELECT * FROM clients;
DROP TABLE clients;
ALTER TABLE clients_tenant RENAME TO clients;

CREATE TABLE saved_filters_tenant (
  id TEXT PRIMARY KEY,
  business_account_id TEXT NOT NULL DEFAULT 'business-account-primary' REFERENCES business_accounts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  filter_type TEXT NOT NULL CHECK (filter_type IN ('TRANSACTIONS', 'RECEIPTS', 'AUDIT')),
  criteria_json TEXT NOT NULL CHECK (json_valid(criteria_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_account_id, user_id, filter_type, name)
);
INSERT INTO saved_filters_tenant (
  id, business_account_id, user_id, name, filter_type, criteria_json,
  created_at, updated_at
)
SELECT
  id, business_account_id, user_id, name, filter_type, criteria_json,
  created_at, updated_at
FROM saved_filters;
DROP TABLE saved_filters;
ALTER TABLE saved_filters_tenant RENAME TO saved_filters;

CREATE INDEX invitations_account_idx
ON invitations(business_account_id, created_at);
CREATE INDEX sessions_account_idx
ON sessions(business_account_id, user_id, expires_at);
CREATE INDEX business_activities_account_idx
ON business_activities(business_account_id, active, name);
CREATE INDEX vehicles_account_idx
ON vehicles(business_account_id, active, registration);
CREATE INDEX expense_categories_account_idx
ON expense_categories(business_account_id, active, name);
CREATE INDEX clients_account_idx
ON clients(business_account_id, active, name);
CREATE INDEX expenses_account_date_idx
ON expenses(business_account_id, purchase_datetime, id);
CREATE INDEX expenses_account_status_idx
ON expenses(business_account_id, status, purchase_datetime);
CREATE INDEX expense_allocations_account_idx
ON expense_allocations(business_account_id, expense_id);
CREATE INDEX fuel_details_account_idx
ON fuel_expense_details(business_account_id, expense_id);
CREATE INDEX parking_details_account_idx
ON parking_expense_details(business_account_id, expense_id);
CREATE INDEX insurance_details_account_idx
ON insurance_expense_details(business_account_id, expense_id);
CREATE INDEX work_sessions_account_date_idx
ON work_sessions(business_account_id, started_at, id);
CREATE INDEX work_sessions_account_status_idx
ON work_sessions(business_account_id, status, started_at);
CREATE INDEX income_records_account_date_idx
ON income_records(business_account_id, transaction_date, id);
CREATE INDEX income_records_account_status_idx
ON income_records(business_account_id, status, transaction_date);
CREATE INDEX income_reconciliations_account_idx
ON income_reconciliations(business_account_id, income_id, created_at);
CREATE INDEX platform_income_details_account_idx
ON platform_income_details(business_account_id, income_id);
CREATE INDEX contract_income_details_account_idx
ON contract_income_details(business_account_id, income_id);
CREATE INDEX subscription_income_details_account_idx
ON subscription_income_details(business_account_id, income_id);
CREATE INDEX attachments_account_record_idx
ON attachments(business_account_id, record_type, record_id, created_at);
CREATE INDEX comments_account_record_idx
ON comments(business_account_id, record_type, record_id, created_at);
CREATE INDEX audit_log_account_date_idx
ON audit_log(business_account_id, created_at, id);
CREATE INDEX saved_filters_account_user_idx
ON saved_filters(business_account_id, user_id, filter_type, name);
CREATE INDEX export_history_account_date_idx
ON export_history(business_account_id, completed_at, id);

ALTER TABLE retention_settings RENAME TO retention_settings_single_workspace;

CREATE TABLE retention_settings (
  business_account_id TEXT PRIMARY KEY REFERENCES business_accounts(id),
  singleton_id INTEGER NOT NULL DEFAULT 1 CHECK (singleton_id = 1),
  retention_tax_years INTEGER NOT NULL DEFAULT 10 CHECK (retention_tax_years >= 7),
  tax_year_end_month INTEGER NOT NULL DEFAULT 3 CHECK (tax_year_end_month BETWEEN 1 AND 12),
  tax_year_end_day INTEGER NOT NULL DEFAULT 31 CHECK (tax_year_end_day BETWEEN 1 AND 31),
  backup_reminder_days INTEGER NOT NULL DEFAULT 30 CHECK (backup_reminder_days > 0),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

INSERT INTO retention_settings (
  business_account_id, singleton_id, retention_tax_years, tax_year_end_month,
  tax_year_end_day, backup_reminder_days, updated_by, updated_at
)
SELECT
  'business-account-primary', singleton_id, retention_tax_years,
  tax_year_end_month, tax_year_end_day, backup_reminder_days, updated_by,
  updated_at
FROM retention_settings_single_workspace;

DROP TABLE retention_settings_single_workspace;

INSERT INTO runtime_metadata (key, value, updated_at)
VALUES ('schema_architecture', 'v2c-business-account-tenancy', '2026-09-13T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

PRAGMA foreign_keys = ON;
