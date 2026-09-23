PRAGMA foreign_keys = ON;

-- An unnamed existing sole-trader entity is safe to preserve for attribution,
-- but its identity must be verified before it is treated as complete.
ALTER TABLE business_entities
ADD COLUMN attribution_review_required INTEGER NOT NULL DEFAULT 0
CHECK (attribution_review_required IN (0, 1));

UPDATE business_entities
SET attribution_review_required = 1
WHERE legal_name IS NULL;

ALTER TABLE expenses
ADD COLUMN attribution_review_required INTEGER NOT NULL DEFAULT 0
CHECK (attribution_review_required IN (0, 1));

ALTER TABLE income_records
ADD COLUMN attribution_review_required INTEGER NOT NULL DEFAULT 0
CHECK (attribution_review_required IN (0, 1));

ALTER TABLE work_sessions
ADD COLUMN attribution_review_required INTEGER NOT NULL DEFAULT 0
CHECK (attribution_review_required IN (0, 1));

-- The existing public demo is synthetic and can be migrated to explicit known
-- identities. No corresponding name is inferred for a private account.
UPDATE users
SET display_name = CASE id
  WHEN 'demo-owner' THEN 'Brian Ho'
  WHEN 'demo-accountant' THEN 'Demo Accountant'
  ELSE display_name
END
WHERE (SELECT value FROM runtime_metadata WHERE key = 'seed_profile') =
  'public-demo-synthetic-nz';

UPDATE business_entities
SET legal_name = 'Brian Ho',
    attribution_review_required = 0,
    updated_at = '2026-09-23T00:00:00.000Z'
WHERE id = 'business-entity-primary'
  AND business_account_id = 'business-account-primary'
  AND (SELECT value FROM runtime_metadata WHERE key = 'seed_profile') =
    'public-demo-synthetic-nz';

INSERT INTO business_entities (
  id, business_account_id, entity_type, legal_name, trading_name, nzbn,
  company_number, country, active, created_at, updated_at,
  attribution_review_required
)
SELECT
  'demo-entity-taxi-limited', 'business-account-primary', 'LIMITED_COMPANY',
  'Taxi Limited', NULL, NULL, NULL, 'NZ', 1,
  '2026-09-23T00:00:00.000Z', '2026-09-23T00:00:00.000Z', 0
WHERE (SELECT value FROM runtime_metadata WHERE key = 'seed_profile') =
  'public-demo-synthetic-nz'
  AND NOT EXISTS (
    SELECT 1 FROM business_entities WHERE id = 'demo-entity-taxi-limited'
  );

INSERT INTO business_entities (
  id, business_account_id, entity_type, legal_name, trading_name, nzbn,
  company_number, country, active, created_at, updated_at,
  attribution_review_required
)
SELECT
  'demo-entity-saas-limited', 'business-account-primary', 'LIMITED_COMPANY',
  'SaaS Limited', NULL, NULL, NULL, 'NZ', 1,
  '2026-09-23T00:00:00.000Z', '2026-09-23T00:00:00.000Z', 0
WHERE (SELECT value FROM runtime_metadata WHERE key = 'seed_profile') =
  'public-demo-synthetic-nz'
  AND NOT EXISTS (
    SELECT 1 FROM business_entities WHERE id = 'demo-entity-saas-limited'
  );

-- Every current high-level activity becomes one business. The legacy link is
-- retained until all routes and exports have moved to business scope.
INSERT INTO businesses (
  id, business_account_id, name, description, business_type, default_currency,
  status, legacy_business_activity_id, created_at, updated_at
)
SELECT
  'business-' || activity.id,
  activity.business_account_id,
  CASE
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-delivery' THEN 'Uber Eats'
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-rideshare' THEN 'Uber Ride'
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-contracting' THEN 'IT Contracting'
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-saas' THEN 'HomeRekod'
    ELSE activity.name
  END,
  CASE
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-delivery' THEN 'Food delivery'
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-rideshare' THEN 'Ride-hailing'
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-contracting' THEN 'IT services'
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-saas' THEN 'SaaS website'
    ELSE NULL
  END,
  activity.activity_type,
  'NZD',
  CASE activity.active WHEN 1 THEN 'ACTIVE' ELSE 'INACTIVE' END,
  activity.id,
  activity.created_at,
  activity.updated_at
FROM business_activities AS activity
LEFT JOIN runtime_metadata AS metadata
  ON metadata.key = 'seed_profile'
WHERE NOT EXISTS (
  SELECT 1
  FROM businesses AS existing
  WHERE existing.business_account_id = activity.business_account_id
    AND existing.legacy_business_activity_id = activity.id
);

-- Create an initial period for each migrated business. The demo shows two
-- company-operated businesses; private history stays with the existing
-- sole-trader entity and is explicitly review-required if unnamed.
INSERT INTO business_entity_periods (
  id, business_account_id, business_id, legal_entity_id, effective_from,
  effective_to, created_at, created_by, notes
)
SELECT
  'period-' || business.id || '-initial',
  business.business_account_id,
  business.id,
  CASE
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-saas' THEN 'demo-entity-saas-limited'
    ELSE (
      SELECT entity.id
      FROM business_entities AS entity
      WHERE entity.business_account_id = business.business_account_id
      ORDER BY
        CASE WHEN entity.entity_type = 'SOLE_TRADER' THEN 0 ELSE 1 END,
        entity.created_at,
        entity.id
      LIMIT 1
    )
  END,
  COALESCE(
    NULLIF(
      min(
        COALESCE(activity.started_at, '9999-12-31'),
        COALESCE(
          (SELECT MIN(substr(expense.purchase_datetime, 1, 10))
           FROM expenses AS expense
           WHERE expense.business_account_id = activity.business_account_id
             AND expense.business_activity_id = activity.id),
          '9999-12-31'
        ),
        COALESCE(
          (SELECT MIN(substr(session.started_at, 1, 10))
           FROM work_sessions AS session
           WHERE session.business_account_id = activity.business_account_id
             AND session.business_activity_id = activity.id),
          '9999-12-31'
        ),
        COALESCE(
          (SELECT MIN(CASE income.income_type
             WHEN 'PLATFORM' THEN COALESCE(
               (SELECT detail.payment_date
                FROM platform_income_details AS detail
                WHERE detail.income_id = income.id),
               income.transaction_date
             )
             WHEN 'CONTRACT' THEN COALESCE(
               (SELECT detail.invoice_date
                FROM contract_income_details AS detail
                WHERE detail.income_id = income.id),
               income.transaction_date
             )
             ELSE income.transaction_date
           END)
           FROM income_records AS income
           WHERE income.business_account_id = activity.business_account_id
             AND income.business_activity_id = activity.id),
          '9999-12-31'
        )
      ),
      '9999-12-31'
    ),
    substr(activity.created_at, 1, 10),
    substr(business.created_at, 1, 10)
  ),
  CASE
    WHEN metadata.value = 'public-demo-synthetic-nz'
      AND activity.id = 'demo-activity-rideshare' THEN '2026-06-30'
    ELSE NULL
  END,
  '2026-09-23T00:00:00.000Z',
  (
    SELECT membership.user_id
    FROM business_account_members AS membership
    WHERE membership.business_account_id = business.business_account_id
      AND membership.status = 'ACTIVE'
    ORDER BY CASE membership.role WHEN 'OWNER' THEN 0 ELSE 1 END,
      membership.created_at,
      membership.user_id
    LIMIT 1
  ),
  'Created during the business identity backfill.'
FROM businesses AS business
JOIN business_activities AS activity
  ON activity.business_account_id = business.business_account_id
  AND activity.id = business.legacy_business_activity_id
LEFT JOIN runtime_metadata AS metadata
  ON metadata.key = 'seed_profile'
WHERE NOT EXISTS (
  SELECT 1
  FROM business_entity_periods AS existing
  WHERE existing.business_account_id = business.business_account_id
    AND existing.business_id = business.id
)
  AND EXISTS (
    SELECT 1
    FROM business_entities AS entity
    WHERE entity.business_account_id = business.business_account_id
  )
  AND EXISTS (
    SELECT 1
    FROM business_account_members AS membership
    WHERE membership.business_account_id = business.business_account_id
      AND membership.status = 'ACTIVE'
  );

INSERT INTO business_entity_periods (
  id, business_account_id, business_id, legal_entity_id, effective_from,
  effective_to, created_at, created_by, notes
)
SELECT
  'period-business-demo-activity-rideshare-company',
  'business-account-primary',
  'business-demo-activity-rideshare',
  'demo-entity-taxi-limited',
  '2026-07-01',
  NULL,
  '2026-09-23T00:00:00.000Z',
  'demo-owner',
  'Synthetic example of a business changing legal entity.'
WHERE (SELECT value FROM runtime_metadata WHERE key = 'seed_profile') =
  'public-demo-synthetic-nz'
  AND EXISTS (SELECT 1 FROM users WHERE id = 'demo-owner')
  AND NOT EXISTS (
    SELECT 1
    FROM business_entity_periods
    WHERE id = 'period-business-demo-activity-rideshare-company'
  );

-- Root accounting records receive authoritative business attribution first.
UPDATE expenses
SET business_id = (
      SELECT business.id
      FROM businesses AS business
      WHERE business.business_account_id = expenses.business_account_id
        AND business.legacy_business_activity_id = expenses.business_activity_id
    )
WHERE business_id IS NULL;

UPDATE expenses
SET legal_entity_id = (
      SELECT period.legal_entity_id
      FROM business_entity_periods AS period
      WHERE period.business_account_id = expenses.business_account_id
        AND period.business_id = expenses.business_id
        AND period.effective_from <= substr(expenses.purchase_datetime, 1, 10)
        AND (
          period.effective_to IS NULL
          OR period.effective_to >= substr(expenses.purchase_datetime, 1, 10)
        )
      LIMIT 1
    )
WHERE legal_entity_id IS NULL AND business_id IS NOT NULL;

UPDATE expenses
SET attribution_review_required = CASE
  WHEN business_id IS NULL OR legal_entity_id IS NULL THEN 1
  WHEN EXISTS (
    SELECT 1 FROM business_entities AS entity
    WHERE entity.id = expenses.legal_entity_id
      AND entity.attribution_review_required = 1
  ) THEN 1
  ELSE 0
END;

UPDATE work_sessions
SET business_id = (
      SELECT business.id
      FROM businesses AS business
      WHERE business.business_account_id = work_sessions.business_account_id
        AND business.legacy_business_activity_id = work_sessions.business_activity_id
    )
WHERE business_id IS NULL;

UPDATE work_sessions
SET legal_entity_id = (
      SELECT period.legal_entity_id
      FROM business_entity_periods AS period
      WHERE period.business_account_id = work_sessions.business_account_id
        AND period.business_id = work_sessions.business_id
        AND period.effective_from <= substr(work_sessions.started_at, 1, 10)
        AND (
          period.effective_to IS NULL
          OR period.effective_to >= substr(work_sessions.started_at, 1, 10)
        )
      LIMIT 1
    )
WHERE legal_entity_id IS NULL AND business_id IS NOT NULL;

UPDATE work_sessions
SET attribution_review_required = CASE
  WHEN business_id IS NULL OR legal_entity_id IS NULL THEN 1
  WHEN EXISTS (
    SELECT 1 FROM business_entities AS entity
    WHERE entity.id = work_sessions.legal_entity_id
      AND entity.attribution_review_required = 1
  ) THEN 1
  ELSE 0
END;

UPDATE income_records
SET business_id = (
      SELECT business.id
      FROM businesses AS business
      WHERE business.business_account_id = income_records.business_account_id
        AND business.legacy_business_activity_id = income_records.business_activity_id
    )
WHERE business_id IS NULL;

UPDATE income_records
SET legal_entity_id = (
      SELECT period.legal_entity_id
      FROM business_entity_periods AS period
      WHERE period.business_account_id = income_records.business_account_id
        AND period.business_id = income_records.business_id
        AND period.effective_from <= CASE income_records.income_type
          WHEN 'PLATFORM' THEN COALESCE(
            (SELECT detail.payment_date
             FROM platform_income_details AS detail
             WHERE detail.income_id = income_records.id),
            income_records.transaction_date
          )
          WHEN 'CONTRACT' THEN COALESCE(
            (SELECT detail.invoice_date
             FROM contract_income_details AS detail
             WHERE detail.income_id = income_records.id),
            income_records.transaction_date
          )
          ELSE income_records.transaction_date
        END
        AND (
          period.effective_to IS NULL
          OR period.effective_to >= CASE income_records.income_type
            WHEN 'PLATFORM' THEN COALESCE(
              (SELECT detail.payment_date
               FROM platform_income_details AS detail
               WHERE detail.income_id = income_records.id),
              income_records.transaction_date
            )
            WHEN 'CONTRACT' THEN COALESCE(
              (SELECT detail.invoice_date
               FROM contract_income_details AS detail
               WHERE detail.income_id = income_records.id),
              income_records.transaction_date
            )
            ELSE income_records.transaction_date
          END
        )
      LIMIT 1
    )
WHERE legal_entity_id IS NULL AND business_id IS NOT NULL;

UPDATE income_records
SET attribution_review_required = CASE
  WHEN business_id IS NULL OR legal_entity_id IS NULL THEN 1
  WHEN EXISTS (
    SELECT 1 FROM business_entities AS entity
    WHERE entity.id = income_records.legal_entity_id
      AND entity.attribution_review_required = 1
  ) THEN 1
  ELSE 0
END;

-- Typed accounting rows inherit the root's immutable attribution.
UPDATE fuel_expense_details
SET business_id = (SELECT business_id FROM expenses WHERE id = fuel_expense_details.expense_id),
    legal_entity_id = (SELECT legal_entity_id FROM expenses WHERE id = fuel_expense_details.expense_id);

UPDATE parking_expense_details
SET business_id = (SELECT business_id FROM expenses WHERE id = parking_expense_details.expense_id),
    legal_entity_id = (SELECT legal_entity_id FROM expenses WHERE id = parking_expense_details.expense_id);

UPDATE insurance_expense_details
SET business_id = (SELECT business_id FROM expenses WHERE id = insurance_expense_details.expense_id),
    legal_entity_id = (SELECT legal_entity_id FROM expenses WHERE id = insurance_expense_details.expense_id);

UPDATE expense_allocations
SET business_id = (SELECT business_id FROM expenses WHERE id = expense_allocations.expense_id),
    legal_entity_id = (SELECT legal_entity_id FROM expenses WHERE id = expense_allocations.expense_id);

UPDATE platform_income_details
SET business_id = (SELECT business_id FROM income_records WHERE id = platform_income_details.income_id),
    legal_entity_id = (SELECT legal_entity_id FROM income_records WHERE id = platform_income_details.income_id);

UPDATE contract_income_details
SET business_id = (SELECT business_id FROM income_records WHERE id = contract_income_details.income_id),
    legal_entity_id = (SELECT legal_entity_id FROM income_records WHERE id = contract_income_details.income_id);

UPDATE subscription_income_details
SET business_id = (SELECT business_id FROM income_records WHERE id = subscription_income_details.income_id),
    legal_entity_id = (SELECT legal_entity_id FROM income_records WHERE id = subscription_income_details.income_id);

UPDATE income_reconciliations
SET business_id = (SELECT business_id FROM income_records WHERE id = income_reconciliations.income_id),
    legal_entity_id = (SELECT legal_entity_id FROM income_records WHERE id = income_reconciliations.income_id);

-- Polymorphic metadata inherits the source record rather than resolving a
-- second legal entity independently.
UPDATE attachments
SET business_id = CASE record_type
      WHEN 'EXPENSE' THEN (SELECT business_id FROM expenses WHERE id = attachments.record_id)
      WHEN 'INCOME' THEN (SELECT business_id FROM income_records WHERE id = attachments.record_id)
      WHEN 'WORK_SESSION' THEN (SELECT business_id FROM work_sessions WHERE id = attachments.record_id)
    END,
    legal_entity_id = CASE record_type
      WHEN 'EXPENSE' THEN (SELECT legal_entity_id FROM expenses WHERE id = attachments.record_id)
      WHEN 'INCOME' THEN (SELECT legal_entity_id FROM income_records WHERE id = attachments.record_id)
      WHEN 'WORK_SESSION' THEN (SELECT legal_entity_id FROM work_sessions WHERE id = attachments.record_id)
    END;

UPDATE comments
SET business_id = CASE record_type
      WHEN 'EXPENSE' THEN (SELECT business_id FROM expenses WHERE id = comments.record_id)
      WHEN 'INCOME' THEN (SELECT business_id FROM income_records WHERE id = comments.record_id)
      WHEN 'WORK_SESSION' THEN (SELECT business_id FROM work_sessions WHERE id = comments.record_id)
    END,
    legal_entity_id = CASE record_type
      WHEN 'EXPENSE' THEN (SELECT legal_entity_id FROM expenses WHERE id = comments.record_id)
      WHEN 'INCOME' THEN (SELECT legal_entity_id FROM income_records WHERE id = comments.record_id)
      WHEN 'WORK_SESSION' THEN (SELECT legal_entity_id FROM work_sessions WHERE id = comments.record_id)
    END;

UPDATE audit_log
SET business_id = (
      SELECT business.id
      FROM businesses AS business
      WHERE business.business_account_id = audit_log.business_account_id
        AND business.legacy_business_activity_id = audit_log.business_activity_id
    )
WHERE business_id IS NULL AND business_activity_id IS NOT NULL;

UPDATE audit_log
SET legal_entity_id = (
      SELECT period.legal_entity_id
      FROM business_entity_periods AS period
      WHERE period.business_account_id = audit_log.business_account_id
        AND period.business_id = audit_log.business_id
        AND period.effective_from <= substr(audit_log.created_at, 1, 10)
        AND (
          period.effective_to IS NULL
          OR period.effective_to >= substr(audit_log.created_at, 1, 10)
        )
      LIMIT 1
    )
WHERE legal_entity_id IS NULL AND business_id IS NOT NULL;

-- Reference rows gain a business only when their historical use proves one
-- unambiguous business. Shared categories and vehicles remain account-scoped.
UPDATE clients
SET business_id = (
  SELECT CASE WHEN COUNT(DISTINCT income.business_id) = 1
    THEN MIN(income.business_id) ELSE NULL END
  FROM contract_income_details AS detail
  JOIN income_records AS income ON income.id = detail.income_id
  WHERE detail.client_id = clients.id
    AND income.business_account_id = clients.business_account_id
);

UPDATE vehicles
SET business_id = (
  SELECT CASE WHEN COUNT(DISTINCT uses.business_id) = 1
    THEN MIN(uses.business_id) ELSE NULL END
  FROM (
    SELECT session.business_id
    FROM work_sessions AS session
    WHERE session.vehicle_id = vehicles.id
      AND session.business_account_id = vehicles.business_account_id
    UNION
    SELECT expense.business_id
    FROM fuel_expense_details AS detail
    JOIN expenses AS expense ON expense.id = detail.expense_id
    WHERE detail.vehicle_id = vehicles.id
      AND expense.business_account_id = vehicles.business_account_id
    UNION
    SELECT expense.business_id
    FROM parking_expense_details AS detail
    JOIN expenses AS expense ON expense.id = detail.expense_id
    WHERE detail.vehicle_id = vehicles.id
      AND expense.business_account_id = vehicles.business_account_id
    UNION
    SELECT expense.business_id
    FROM insurance_expense_details AS detail
    JOIN expenses AS expense ON expense.id = detail.expense_id
    WHERE detail.vehicle_id = vehicles.id
      AND expense.business_account_id = vehicles.business_account_id
  ) AS uses
);

UPDATE expense_categories
SET business_id = (
  SELECT CASE WHEN COUNT(DISTINCT expense.business_id) = 1
    THEN MIN(expense.business_id) ELSE NULL END
  FROM expenses AS expense
  WHERE expense.expense_category_id = expense_categories.id
    AND expense.business_account_id = expense_categories.business_account_id
);

INSERT INTO runtime_metadata (key, value, updated_at)
VALUES (
  'schema_architecture',
  'business-identity-backfilled',
  '2026-09-23T00:00:00.000Z'
)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
