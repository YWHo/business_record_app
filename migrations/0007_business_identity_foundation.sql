PRAGMA foreign_keys = ON;

-- Keep the existing physical account/entity table names while introducing the
-- business-first domain. These composite keys allow child tables to prove that
-- a referenced row belongs to the same account.
CREATE UNIQUE INDEX business_entities_account_id_unique
ON business_entities(business_account_id, id);

CREATE UNIQUE INDEX business_activities_account_id_unique
ON business_activities(business_account_id, id);

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  business_account_id TEXT NOT NULL REFERENCES business_accounts(id),
  name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
  description TEXT,
  business_type TEXT,
  default_currency TEXT NOT NULL DEFAULT 'NZD'
    CHECK (length(default_currency) = 3 AND default_currency = upper(default_currency)),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  legacy_business_activity_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_account_id, name),
  UNIQUE (business_account_id, id),
  UNIQUE (business_account_id, legacy_business_activity_id),
  FOREIGN KEY (business_account_id, legacy_business_activity_id)
    REFERENCES business_activities(business_account_id, id),
  CHECK (description IS NULL OR length(trim(description)) > 0),
  CHECK (business_type IS NULL OR length(trim(business_type)) > 0)
);

CREATE INDEX businesses_account_status_name_idx
ON businesses(business_account_id, status, name);

CREATE TABLE business_entity_periods (
  id TEXT PRIMARY KEY,
  business_account_id TEXT NOT NULL REFERENCES business_accounts(id),
  business_id TEXT NOT NULL,
  legal_entity_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  UNIQUE (business_account_id, id),
  FOREIGN KEY (business_account_id, business_id)
    REFERENCES businesses(business_account_id, id),
  FOREIGN KEY (business_account_id, legal_entity_id)
    REFERENCES business_entities(business_account_id, id),
  CHECK (date(effective_from) = effective_from),
  CHECK (effective_to IS NULL OR date(effective_to) = effective_to),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (notes IS NULL OR length(trim(notes)) > 0)
);

CREATE INDEX business_entity_periods_account_business_date_idx
ON business_entity_periods(
  business_account_id,
  business_id,
  effective_from,
  effective_to
);

CREATE INDEX business_entity_periods_account_entity_date_idx
ON business_entity_periods(
  business_account_id,
  legal_entity_id,
  effective_from,
  effective_to
);

CREATE UNIQUE INDEX business_entity_periods_one_current_idx
ON business_entity_periods(business_id)
WHERE effective_to IS NULL;

CREATE TRIGGER business_entity_periods_no_overlap_insert
BEFORE INSERT ON business_entity_periods
WHEN EXISTS (
  SELECT 1
  FROM business_entity_periods AS existing
  WHERE existing.business_id = NEW.business_id
    AND NEW.effective_from <= COALESCE(existing.effective_to, '9999-12-31')
    AND COALESCE(NEW.effective_to, '9999-12-31') >= existing.effective_from
)
BEGIN
  SELECT RAISE(ABORT, 'Business legal-entity periods must not overlap');
END;

CREATE TRIGGER business_entity_periods_no_overlap_update
BEFORE UPDATE OF business_id, effective_from, effective_to
ON business_entity_periods
WHEN EXISTS (
  SELECT 1
  FROM business_entity_periods AS existing
  WHERE existing.business_id = NEW.business_id
    AND existing.id != OLD.id
    AND NEW.effective_from <= COALESCE(existing.effective_to, '9999-12-31')
    AND COALESCE(NEW.effective_to, '9999-12-31') >= existing.effective_from
)
BEGIN
  SELECT RAISE(ABORT, 'Business legal-entity periods must not overlap');
END;

-- Identity labels are populated during the data-backfill migration. Keeping the
-- column nullable makes this migration safe for existing users.
ALTER TABLE users ADD COLUMN display_name TEXT
CHECK (display_name IS NULL OR length(trim(display_name)) > 0);

-- References are nullable until the next migration backfills and verifies every
-- historical row. Existing account and legacy activity columns stay in place.
ALTER TABLE vehicles ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE expense_categories ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE clients ADD COLUMN business_id TEXT REFERENCES businesses(id);

ALTER TABLE expenses ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE expenses ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE fuel_expense_details ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE fuel_expense_details ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE parking_expense_details ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE parking_expense_details ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE insurance_expense_details ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE insurance_expense_details ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE expense_allocations ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE expense_allocations ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE work_sessions ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE work_sessions ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE income_records ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE income_records ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE platform_income_details ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE platform_income_details ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE contract_income_details ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE contract_income_details ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE subscription_income_details ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE subscription_income_details ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE income_reconciliations ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE income_reconciliations ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE attachments ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE attachments ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE comments ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE comments ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE audit_log ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE audit_log ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

ALTER TABLE export_history ADD COLUMN business_id TEXT REFERENCES businesses(id);
ALTER TABLE export_history ADD COLUMN legal_entity_id TEXT REFERENCES business_entities(id);

CREATE INDEX vehicles_account_business_idx
ON vehicles(business_account_id, business_id, active, registration);
CREATE INDEX expense_categories_account_business_idx
ON expense_categories(business_account_id, business_id, active, name);
CREATE INDEX clients_account_business_idx
ON clients(business_account_id, business_id, active, name);

CREATE INDEX expenses_account_business_date_idx
ON expenses(business_account_id, business_id, purchase_datetime, id);
CREATE INDEX expenses_account_entity_date_idx
ON expenses(business_account_id, legal_entity_id, purchase_datetime, id);
CREATE INDEX work_sessions_account_business_date_idx
ON work_sessions(business_account_id, business_id, started_at, id);
CREATE INDEX work_sessions_account_entity_date_idx
ON work_sessions(business_account_id, legal_entity_id, started_at, id);
CREATE INDEX income_records_account_business_date_idx
ON income_records(business_account_id, business_id, transaction_date, id);
CREATE INDEX income_records_account_entity_date_idx
ON income_records(business_account_id, legal_entity_id, transaction_date, id);

CREATE INDEX attachments_account_business_record_idx
ON attachments(business_account_id, business_id, record_type, record_id, created_at);
CREATE INDEX comments_account_business_record_idx
ON comments(business_account_id, business_id, record_type, record_id, created_at);
CREATE INDEX audit_log_account_business_date_idx
ON audit_log(business_account_id, business_id, created_at, id);
CREATE INDEX export_history_account_business_date_idx
ON export_history(business_account_id, business_id, completed_at, id);

INSERT INTO runtime_metadata (key, value, updated_at)
VALUES (
  'schema_architecture',
  'business-identity-foundation',
  '2026-09-23T00:00:00.000Z'
)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
