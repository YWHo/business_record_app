PRAGMA foreign_keys = ON;

DELETE FROM export_history;
DELETE FROM development_auth_outbox;
DELETE FROM authentication_challenges;
DELETE FROM audit_log;
DELETE FROM comments;
DELETE FROM attachments;
DELETE FROM income_reconciliations;
DELETE FROM subscription_income_details;
DELETE FROM contract_income_details;
DELETE FROM platform_income_details;
DELETE FROM income_records;
DELETE FROM work_sessions;
DELETE FROM expense_allocations;
DELETE FROM insurance_expense_details;
DELETE FROM parking_expense_details;
DELETE FROM fuel_expense_details;
DELETE FROM expenses;
DELETE FROM saved_filters;
DELETE FROM clients;
DELETE FROM vehicles;
DELETE FROM business_entity_periods;
-- Categories are migration-owned reference rows and are retained between
-- resets. A previous seed scopes some of them to a single demo business, so
-- clear those references before replacing the businesses.
UPDATE expense_categories SET business_id = NULL;
DELETE FROM businesses;
DELETE FROM business_activities;
DELETE FROM business_entities WHERE id <> 'business-entity-primary';
UPDATE retention_settings SET updated_by = NULL;
DELETE FROM development_outbox;
DELETE FROM sessions;
DELETE FROM invitations;
DELETE FROM business_account_members;
DELETE FROM users;
DELETE FROM runtime_metadata;

INSERT INTO users (id, email, role, status, created_at, updated_at)
VALUES
  ('demo-owner', 'demo-owner@example.invalid', 'OWNER', 'ACTIVE', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-accountant', 'demo-accountant@example.invalid', 'ACCOUNTANT', 'ACTIVE', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

UPDATE users
SET display_name = CASE id
  WHEN 'demo-owner' THEN 'John Doe'
  WHEN 'demo-accountant' THEN 'Demo Accountant'
END;

UPDATE business_entities
SET entity_type = 'SOLE_TRADER',
    legal_name = 'John Doe',
    trading_name = NULL,
    active = 1,
    attribution_review_required = 0,
    updated_at = '2026-04-01T00:00:00.000Z'
WHERE id = 'business-entity-primary';

INSERT INTO business_entities (
  id, business_account_id, entity_type, legal_name, trading_name, nzbn,
  company_number, country, active, created_at, updated_at,
  attribution_review_required
)
VALUES
  ('demo-entity-taxi-limited', 'business-account-primary', 'LIMITED_COMPANY', 'Taxi Limited', NULL, NULL, NULL, 'NZ', 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', 0),
  ('demo-entity-saas-limited', 'business-account-primary', 'LIMITED_COMPANY', 'SaaS Limited', NULL, NULL, NULL, 'NZ', 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', 0);

UPDATE business_accounts
SET display_name = 'Synthetic Demo Business', updated_at = '2026-04-01T00:00:00.000Z'
WHERE id = 'business-account-primary';

INSERT INTO business_account_members (
  business_account_id, user_id, role, status, created_at, updated_at
)
VALUES
  ('business-account-primary', 'demo-owner', 'OWNER', 'ACTIVE', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('business-account-primary', 'demo-accountant', 'ACCOUNTANT', 'ACTIVE', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

INSERT INTO business_activities (id, name, activity_type, active, started_at, ended_at, created_at, updated_at)
VALUES
  ('demo-activity-delivery', 'Delivery Platform', 'PLATFORM_SERVICES', 1, '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-activity-rideshare', 'Ride-Hailing Platform', 'PLATFORM_SERVICES', 1, '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-activity-contracting', 'IT Contracting', 'PROFESSIONAL_SERVICES', 1, '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-activity-saas', 'SaaS Business', 'SOFTWARE_SERVICE', 1, '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

INSERT INTO businesses (
  id, business_account_id, name, description, business_type, default_currency,
  status, legacy_business_activity_id, created_at, updated_at
)
VALUES
  ('business-demo-activity-delivery', 'business-account-primary', 'Uber Eats', 'Food delivery', 'PLATFORM_SERVICES', 'NZD', 'ACTIVE', 'demo-activity-delivery', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('business-demo-activity-rideshare', 'business-account-primary', 'Uber Ride', 'Ride-hailing', 'PLATFORM_SERVICES', 'NZD', 'ACTIVE', 'demo-activity-rideshare', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('business-demo-activity-contracting', 'business-account-primary', 'IT Contracting', 'IT services', 'PROFESSIONAL_SERVICES', 'NZD', 'ACTIVE', 'demo-activity-contracting', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('business-demo-activity-saas', 'business-account-primary', 'Music Streaming', 'SaaS website', 'SOFTWARE_SERVICE', 'NZD', 'ACTIVE', 'demo-activity-saas', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

INSERT INTO business_entity_periods (
  id, business_account_id, business_id, legal_entity_id, effective_from,
  effective_to, created_at, created_by, notes
)
VALUES
  ('period-business-demo-activity-delivery-initial', 'business-account-primary', 'business-demo-activity-delivery', 'business-entity-primary', '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', 'demo-owner', 'Synthetic sole-trader operating period.'),
  ('period-business-demo-activity-rideshare-initial', 'business-account-primary', 'business-demo-activity-rideshare', 'business-entity-primary', '2026-04-01', '2026-06-30', '2026-04-01T00:00:00.000Z', 'demo-owner', 'Synthetic historical sole-trader period.'),
  ('period-business-demo-activity-rideshare-company', 'business-account-primary', 'business-demo-activity-rideshare', 'demo-entity-taxi-limited', '2026-07-01', NULL, '2026-07-01T00:00:00.000Z', 'demo-owner', 'Synthetic company operating period.'),
  ('period-business-demo-activity-contracting-initial', 'business-account-primary', 'business-demo-activity-contracting', 'business-entity-primary', '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', 'demo-owner', 'Synthetic sole-trader operating period.'),
  ('period-business-demo-activity-saas-initial', 'business-account-primary', 'business-demo-activity-saas', 'demo-entity-saas-limited', '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', 'demo-owner', 'Synthetic company operating period.');

INSERT INTO vehicles (id, registration, description, active, acquired_at, retired_at, notes, created_at, updated_at)
VALUES
  ('demo-vehicle-koru', 'KORU24', '2024 hybrid hatchback', 1, '2025-11-18', NULL, 'Synthetic demonstration vehicle', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-vehicle-tui', 'TUI818', '2018 compact hatchback', 0, '2021-02-10', '2026-06-30', 'Synthetic retired demonstration vehicle', '2026-04-01T00:00:00.000Z', '2026-06-30T00:00:00.000Z');

INSERT INTO clients (id, name, active, notes, created_at, updated_at)
VALUES
  ('demo-client-harbour', 'Harbour Lantern Limited', 1, 'Fictional Wellington software consultancy client', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-client-kowhai', 'Kowhai Field Services Limited', 1, 'Fictional Christchurch operations client', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

UPDATE clients
SET business_id = 'business-demo-activity-contracting';

INSERT INTO work_sessions (
  id, business_activity_id, vehicle_id, started_at, ended_at,
  odometer_start_km, odometer_end_km, gross_revenue_minor, currency, notes,
  status, created_by, created_at, updated_at, retention_until, purge_eligible_at
)
VALUES
  ('demo-session-1', 'demo-activity-delivery', 'demo-vehicle-koru', '2026-08-03T05:30:00.000Z', '2026-08-03T09:15:00.000Z', 18420, 18508, 21450, 'NZD', 'Monday evening delivery block', 'REVIEWED', 'demo-owner', '2026-08-03T09:20:00.000Z', '2026-08-04T02:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-session-2', 'demo-activity-delivery', 'demo-vehicle-koru', '2026-08-05T05:00:00.000Z', '2026-08-05T08:30:00.000Z', 18508, 18589, 19820, 'NZD', 'Wednesday delivery block', 'READY_FOR_REVIEW', 'demo-owner', '2026-08-05T08:35:00.000Z', '2026-08-05T08:35:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-session-3', 'demo-activity-rideshare', 'demo-vehicle-koru', '2026-08-07T07:00:00.000Z', '2026-08-07T12:45:00.000Z', 18589, 18724, 35640, 'NZD', 'Friday rideshare shift', 'NEW', 'demo-owner', '2026-08-07T12:50:00.000Z', '2026-08-07T12:50:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-session-4', 'demo-activity-delivery', 'demo-vehicle-koru', '2026-08-10T05:15:00.000Z', '2026-08-10T09:00:00.000Z', 18724, 18816, 22500, 'NZD', 'Monday delivery block', 'PROCESSED', 'demo-owner', '2026-08-10T09:05:00.000Z', '2026-08-12T01:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-session-5', 'demo-activity-rideshare', 'demo-vehicle-koru', '2026-08-14T06:30:00.000Z', '2026-08-14T11:30:00.000Z', 18816, 18937, NULL, 'NZD', 'Revenue statement still to be added', 'MISSING_INFORMATION', 'demo-owner', '2026-08-14T11:35:00.000Z', '2026-08-14T11:35:00.000Z', '2037-03-31', '2037-04-01');

INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, reviewed_by, reviewed_at,
  created_at, updated_at, retention_until, purge_eligible_at
)
VALUES
  ('demo-fuel-1', 'demo-activity-delivery', 'FUEL', 'category-fuel', 'Kauri Fuel Point', '2026-08-03T04:55:00.000Z', 10480, 'NZD', 1367, 'GST_INCLUDED', 'Full tank before delivery work', 'ONE_OFF', 'REVIEWED', 'demo-owner', 'demo-accountant', '2026-08-04T02:00:00.000Z', '2026-08-03T05:00:00.000Z', '2026-08-04T02:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-fuel-2', 'demo-activity-rideshare', 'FUEL', 'category-fuel', 'Southern Star Energy', '2026-08-09T23:40:00.000Z', 9630, 'NZD', 1256, 'GST_INCLUDED', 'Weekly fuel receipt', 'ONE_OFF', 'READY_FOR_REVIEW', 'demo-owner', NULL, NULL, '2026-08-09T23:45:00.000Z', '2026-08-09T23:45:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-fuel-3', 'demo-activity-delivery', 'FUEL', 'category-fuel', 'Kauri Fuel Point', '2026-08-17T04:45:00.000Z', 10125, 'NZD', 1321, 'GST_INCLUDED', 'Full tank', 'ONE_OFF', 'NEW', 'demo-owner', NULL, NULL, '2026-08-17T04:50:00.000Z', '2026-08-17T04:50:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-parking-1', 'demo-activity-contracting', 'PARKING', 'category-parking', 'Civic Quay Parking', '2026-08-06T20:30:00.000Z', 2400, 'NZD', 313, 'GST_INCLUDED', 'Client workshop parking', 'ONE_OFF', 'PROCESSED', 'demo-owner', 'demo-accountant', '2026-08-07T02:00:00.000Z', '2026-08-06T20:35:00.000Z', '2026-08-07T02:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-parking-2', 'demo-activity-rideshare', 'PARKING', 'category-parking', 'Harbour Park', '2026-08-14T05:50:00.000Z', 1250, 'NZD', 163, 'GST_INCLUDED', 'Airport waiting area', 'ONE_OFF', 'MISSING_INFORMATION', 'demo-owner', NULL, NULL, '2026-08-14T05:55:00.000Z', '2026-08-14T05:55:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-software-1', 'demo-activity-contracting', 'GENERAL', 'category-software', 'Tussock Code Tools', '2026-08-01T00:00:00.000Z', 4600, 'NZD', 600, 'GST_INCLUDED', 'Monthly development tools', 'RECURRING', 'REVIEWED', 'demo-owner', 'demo-accountant', '2026-08-02T01:00:00.000Z', '2026-08-01T00:05:00.000Z', '2026-08-02T01:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-cloud-1', 'demo-activity-saas', 'GENERAL', 'category-cloud-hosting', 'Pounamu Cloud Services', '2026-08-02T00:00:00.000Z', 13800, 'NZD', 1800, 'GST_INCLUDED', 'Application hosting and database', 'RECURRING', 'READY_FOR_REVIEW', 'demo-owner', NULL, NULL, '2026-08-02T00:05:00.000Z', '2026-08-02T00:05:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-insurance-vehicle', 'demo-activity-delivery', 'INSURANCE', 'category-vehicle-insurance', 'Rimu Mutual', '2026-07-01T00:00:00.000Z', 12400, 'NZD', NULL, 'NO_GST', 'July vehicle insurance premium', 'RECURRING', 'REVIEWED', 'demo-owner', 'demo-accountant', '2026-07-03T01:00:00.000Z', '2026-07-01T00:05:00.000Z', '2026-07-03T01:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-insurance-liability', 'demo-activity-contracting', 'INSURANCE', 'category-liability-insurance', 'Rimu Mutual', '2026-04-01T00:00:00.000Z', 9200, 'NZD', NULL, 'NO_GST', 'April professional liability premium', 'RECURRING', 'PROCESSED', 'demo-owner', 'demo-accountant', '2026-04-03T01:00:00.000Z', '2026-04-01T00:05:00.000Z', '2026-04-03T01:00:00.000Z', '2037-03-31', '2037-04-01');

INSERT INTO fuel_expense_details (expense_id, vehicle_id, fuel_station, fuel_price_micros_per_litre, fuel_litres, odometer_km, fill_type, notes)
VALUES
  ('demo-fuel-1', 'demo-vehicle-koru', 'Kauri Fuel Point', 2620000, 40.000, 18420, 'FULL', 'Pump and receipt values agree'),
  ('demo-fuel-2', 'demo-vehicle-koru', 'Southern Star Energy', 2675000, 36.000, 18724, 'FULL', 'Allocated across delivery and rideshare work'),
  ('demo-fuel-3', 'demo-vehicle-koru', 'Kauri Fuel Point', 2500000, 40.500, 18937, 'FULL', NULL);

INSERT INTO parking_expense_details (expense_id, vehicle_id, parking_provider, parking_location, parking_start_datetime, parking_end_datetime, parking_reference)
VALUES
  ('demo-parking-1', 'demo-vehicle-koru', 'Civic Quay Parking', 'Wellington waterfront', '2026-08-06T20:30:00.000Z', '2026-08-07T01:30:00.000Z', 'CQ-8042'),
  ('demo-parking-2', 'demo-vehicle-koru', 'Harbour Park', 'Wellington Airport', '2026-08-14T05:50:00.000Z', '2026-08-14T06:25:00.000Z', NULL);

INSERT INTO insurance_expense_details (expense_id, insurance_type, provider, policy_number, policy_period_start, policy_period_end, vehicle_id)
VALUES
  ('demo-insurance-vehicle', 'VEHICLE', 'Rimu Mutual', 'DEMO-MOTOR-2048', '2026-07-01', '2026-07-31', 'demo-vehicle-koru'),
  ('demo-insurance-liability', 'PROFESSIONAL_LIABILITY', 'Rimu Mutual', 'DEMO-PL-1024', '2026-04-01', '2026-04-30', NULL);

INSERT INTO expense_allocations (id, expense_id, business_activity_id, allocation_method, percentage_basis_points, allocated_amount_minor, calculation_period_start, calculation_period_end, notes, reviewed_by, created_at, updated_at)
VALUES
  ('demo-allocation-vehicle', 'demo-insurance-vehicle', 'demo-activity-delivery', 'BUSINESS_KM_OVER_TOTAL_KM', 7200, 8928, '2026-07-01', '2026-07-31', 'Illustrative allocation based on recorded business kilometres; not final tax treatment', 'demo-accountant', '2026-07-03T01:00:00.000Z', '2026-07-03T01:00:00.000Z'),
  ('demo-allocation-liability', 'demo-insurance-liability', 'demo-activity-contracting', '100_PERCENT_BUSINESS', 10000, 9200, '2026-04-01', '2026-04-30', 'Professional services policy', 'demo-accountant', '2026-04-03T01:00:00.000Z', '2026-04-03T01:00:00.000Z');

INSERT INTO income_records (id, business_activity_id, income_type, received_from, transaction_date, total_amount_minor, currency, status, notes, created_by, reviewed_by, reviewed_at, created_at, updated_at, retention_until, purge_eligible_at)
VALUES
  ('demo-platform-1', 'demo-activity-delivery', 'PLATFORM', 'Harbour Hopper', '2026-08-04', 58240, 'NZD', 'REVIEWED', 'Weekly delivery statement', 'demo-owner', 'demo-accountant', '2026-08-05T01:00:00.000Z', '2026-08-04T00:10:00.000Z', '2026-08-05T01:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-platform-2', 'demo-activity-rideshare', 'PLATFORM', 'Koru Ride', '2026-08-11', 71450, 'NZD', 'PROCESSED', 'Weekly rideshare statement', 'demo-owner', 'demo-accountant', '2026-08-12T01:00:00.000Z', '2026-08-11T00:10:00.000Z', '2026-08-12T01:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-platform-3', 'demo-activity-delivery', 'PLATFORM', 'Harbour Hopper', '2026-08-18', 61380, 'NZD', 'READY_FOR_REVIEW', 'Weekly delivery statement', 'demo-owner', NULL, NULL, '2026-08-18T00:10:00.000Z', '2026-08-18T00:10:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-platform-4', 'demo-activity-rideshare', 'PLATFORM', 'Koru Ride', '2026-08-25', 68920, 'NZD', 'MISSING_INFORMATION', 'Waiting for the fee breakdown', 'demo-owner', NULL, NULL, '2026-08-25T00:10:00.000Z', '2026-08-25T00:10:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-contract-paid', 'demo-activity-contracting', 'CONTRACT', 'Harbour Lantern Limited', '2026-07-31', 862500, 'NZD', 'PROCESSED', 'API integration milestone', 'demo-owner', 'demo-accountant', '2026-08-01T01:00:00.000Z', '2026-07-31T00:10:00.000Z', '2026-08-01T01:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-contract-open', 'demo-activity-contracting', 'CONTRACT', 'Kowhai Field Services Limited', '2026-08-20', 517500, 'NZD', 'READY_FOR_REVIEW', 'Reporting dashboard milestone', 'demo-owner', NULL, NULL, '2026-08-20T00:10:00.000Z', '2026-08-20T00:10:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-subscription-1', 'demo-activity-saas', 'SUBSCRIPTION', 'Subscription platform', '2026-07-31', 284750, 'NZD', 'REVIEWED', 'July subscriber summary', 'demo-owner', 'demo-accountant', '2026-08-02T02:00:00.000Z', '2026-08-01T00:15:00.000Z', '2026-08-02T02:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-subscription-2', 'demo-activity-saas', 'SUBSCRIPTION', 'Subscription platform', '2026-08-31', 319600, 'NZD', 'NEW', 'August subscriber summary', 'demo-owner', NULL, NULL, '2026-09-01T00:15:00.000Z', '2026-09-01T00:15:00.000Z', '2037-03-31', '2037-04-01');

INSERT INTO platform_income_details (income_id, provider_name, period_start, period_end, payment_date, gross_earnings_minor, tips_minor, bonuses_promotions_minor, flat_rate_credit_minor, platform_fees_minor, other_adjustments_minor, net_payment_received_minor)
VALUES
  ('demo-platform-1', 'Harbour Hopper', '2026-07-27', '2026-08-02', '2026-08-04', 64800, 3200, 1800, 0, 7560, 0, 58240),
  ('demo-platform-2', 'Koru Ride', '2026-08-03', '2026-08-09', '2026-08-11', 80600, 4100, 2600, 0, 9150, 0, 71450),
  ('demo-platform-3', 'Harbour Hopper', '2026-08-10', '2026-08-16', '2026-08-18', 68700, 2900, 1200, 0, 7320, 0, 61380),
  ('demo-platform-4', 'Koru Ride', '2026-08-17', '2026-08-23', '2026-08-25', 78100, 3800, 1400, 0, 9180, 0, 68920);

INSERT INTO contract_income_details (income_id, client_id, invoice_number, invoice_date, service_period_start, service_period_end, subtotal_minor, gst_amount_minor, total_minor, due_date, payment_received_date, amount_received_minor, payment_status)
VALUES
  ('demo-contract-paid', 'demo-client-harbour', 'HL-2026-071', '2026-07-31', '2026-07-01', '2026-07-31', 750000, 112500, 862500, '2026-08-14', '2026-08-12', 862500, 'PAID'),
  ('demo-contract-open', 'demo-client-kowhai', 'KF-2026-082', '2026-08-20', '2026-08-01', '2026-08-20', 450000, 67500, 517500, '2026-09-03', NULL, 0, 'ISSUED');

INSERT INTO subscription_income_details (income_id, period_start, period_end, gross_subscription_revenue_minor, refunds_minor, platform_fees_minor, payment_processing_fees_minor, net_payment_received_minor, subscriber_count, new_subscribers, cancelled_subscribers)
VALUES
  ('demo-subscription-1', '2026-07-01', '2026-07-31', 312000, 6500, 12480, 12270, 284750, 128, 18, 9),
  ('demo-subscription-2', '2026-08-01', '2026-08-31', 349500, 8200, 13980, 17720, 319600, 141, 22, 9);

-- A dense but deterministic history makes the public demo useful without
-- implying that any record belongs to a real person or provider. Delivery and
-- ride-hailing shifts share one vehicle, so their times and odometers never
-- overlap: morning ride-hailing, lunch and dinner delivery, then a late shift.
WITH RECURSIVE demo_days(day_number, work_date) AS (
  VALUES (0, '2026-09-21')
  UNION ALL
  SELECT day_number + 1, date(work_date, '+1 day')
  FROM demo_days
  WHERE day_number < 9
), generated_sessions AS (
  SELECT
    printf('demo-delivery-lunch-%02d', day_number + 1) AS id,
    'demo-activity-delivery' AS activity_id,
    work_date || 'T11:30:00.000Z' AS started_at,
    work_date || 'T14:00:00.000Z' AS ended_at,
    30000 + day_number * 150 + 45 AS odometer_start,
    30000 + day_number * 150 + 70 AS odometer_end,
    6900 + day_number * 175 AS revenue,
    'Lunch delivery round' AS notes
  FROM demo_days
  UNION ALL
  SELECT
    printf('demo-delivery-dinner-%02d', day_number + 1),
    'demo-activity-delivery',
    work_date || 'T17:30:00.000Z',
    work_date || 'T20:30:00.000Z',
    30000 + day_number * 150 + 70,
    30000 + day_number * 150 + 105,
    9800 + day_number * 225,
    'Dinner delivery round'
  FROM demo_days
  UNION ALL
  SELECT
    printf('demo-rideshare-morning-%02d', day_number + 1),
    'demo-activity-rideshare',
    work_date || 'T06:00:00.000Z',
    work_date || 'T09:00:00.000Z',
    30000 + day_number * 150,
    30000 + day_number * 150 + 45,
    12600 + day_number * 240,
    CASE WHEN strftime('%w', work_date) IN ('0', '6')
      THEN 'Weekend morning ride-hailing shift'
      ELSE 'Weekday commuter ride-hailing shift' END
  FROM demo_days
  UNION ALL
  SELECT
    printf('demo-rideshare-night-%02d', day_number + 1),
    'demo-activity-rideshare',
    work_date || 'T21:00:00.000Z',
    work_date || 'T23:59:00.000Z',
    30000 + day_number * 150 + 105,
    30000 + day_number * 150 + 150,
    15100 + day_number * 275,
    CASE WHEN strftime('%w', work_date) IN ('0', '6')
      THEN 'Weekend evening ride-hailing shift'
      ELSE 'Weekday evening ride-hailing shift' END
  FROM demo_days
)
INSERT INTO work_sessions (
  id, business_activity_id, vehicle_id, started_at, ended_at,
  odometer_start_km, odometer_end_km, gross_revenue_minor, currency, notes,
  status, created_by, created_at, updated_at, retention_until, purge_eligible_at
)
SELECT
  id, activity_id, 'demo-vehicle-koru', started_at, ended_at,
  odometer_start, odometer_end, revenue, 'NZD', notes,
  CASE abs(odometer_start) % 4
    WHEN 0 THEN 'PROCESSED'
    WHEN 1 THEN 'REVIEWED'
    WHEN 2 THEN 'READY_FOR_REVIEW'
    ELSE 'NEW'
  END,
  'demo-owner', ended_at, ended_at, '2037-03-31', '2037-04-01'
FROM generated_sessions;

-- Weekly fuel, monthly insurance, and occasional parking for each driving
-- business. Separate transaction dates keep their histories easy to follow.
WITH RECURSIVE fuel_weeks(week_number) AS (
  VALUES (0) UNION ALL SELECT week_number + 1 FROM fuel_weeks WHERE week_number < 5
), generated_fuel AS (
  SELECT printf('demo-delivery-fuel-%02d', week_number + 1) AS id,
    'demo-activity-delivery' AS activity_id,
    datetime('2026-08-23', printf('+%d days', week_number * 7), '+16 hours') AS purchased_at,
    8900 + week_number * 185 AS amount,
    28500 + week_number * 340 AS odometer,
    'Kauri Fuel Point' AS merchant
  FROM fuel_weeks
  UNION ALL
  SELECT printf('demo-rideshare-fuel-%02d', week_number + 1),
    'demo-activity-rideshare',
    datetime('2026-08-21', printf('+%d days', week_number * 7), '+10 hours'),
    9600 + week_number * 210,
    28640 + week_number * 340,
    'Southern Star Energy'
  FROM fuel_weeks
)
INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, created_at, updated_at,
  retention_until, purge_eligible_at
)
SELECT id, activity_id, 'FUEL', 'category-fuel', merchant, purchased_at,
  amount, 'NZD', CAST(round(amount * 3.0 / 23.0) AS INTEGER), 'GST_INCLUDED',
  'Weekly fuel fill', 'ONE_OFF', 'REVIEWED', 'demo-owner', purchased_at,
  purchased_at, '2037-03-31', '2037-04-01'
FROM generated_fuel;

WITH RECURSIVE fuel_weeks(week_number) AS (
  VALUES (0) UNION ALL SELECT week_number + 1 FROM fuel_weeks WHERE week_number < 5
), generated_fuel AS (
  SELECT printf('demo-delivery-fuel-%02d', week_number + 1) AS id,
    28500 + week_number * 340 AS odometer, 'Kauri Fuel Point' AS merchant
  FROM fuel_weeks
  UNION ALL
  SELECT printf('demo-rideshare-fuel-%02d', week_number + 1),
    28640 + week_number * 340, 'Southern Star Energy'
  FROM fuel_weeks
)
INSERT INTO fuel_expense_details (
  expense_id, vehicle_id, fuel_station, fuel_price_micros_per_litre,
  fuel_litres, odometer_km, fill_type, notes
)
SELECT id, 'demo-vehicle-koru', merchant, 2640000, 36.500, odometer,
  'FULL', 'Synthetic weekly fill'
FROM generated_fuel;

WITH insurance_months(month_start) AS (
  VALUES ('2026-04-01'), ('2026-05-01'), ('2026-06-01'),
    ('2026-07-01'), ('2026-08-01'), ('2026-09-01')
), generated_insurance AS (
  SELECT 'demo-delivery-insurance-' || strftime('%Y-%m', month_start) AS id,
    'demo-activity-delivery' AS activity_id, 'category-vehicle-insurance' AS category_id,
    12400 AS amount, 'Vehicle insurance monthly premium' AS description,
    'VEHICLE' AS insurance_type, 'DEMO-MOTOR-2048' AS policy_number,
    'demo-vehicle-koru' AS vehicle_id, month_start
  FROM insurance_months WHERE month_start <> '2026-07-01'
  UNION ALL
  SELECT 'demo-rideshare-insurance-' || strftime('%Y-%m', month_start),
    'demo-activity-rideshare', 'category-vehicle-insurance', 11800,
    'Ride-hailing vehicle insurance monthly premium', 'VEHICLE',
    'DEMO-RIDE-818', 'demo-vehicle-koru', month_start
  FROM insurance_months
  UNION ALL
  SELECT 'demo-contract-insurance-' || strftime('%Y-%m', month_start),
    'demo-activity-contracting', 'category-liability-insurance', 9200,
    'Professional liability monthly premium', 'PROFESSIONAL_LIABILITY',
    'DEMO-PL-1024', NULL, month_start
  FROM insurance_months WHERE month_start <> '2026-04-01'
)
INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, created_at, updated_at,
  retention_until, purge_eligible_at
)
SELECT id, activity_id, 'INSURANCE', category_id, 'Rimu Mutual',
  month_start || 'T00:00:00.000Z', amount, 'NZD', NULL, 'NO_GST', description,
  'RECURRING', 'PROCESSED', 'demo-owner', month_start || 'T00:05:00.000Z',
  month_start || 'T00:05:00.000Z', '2037-03-31', '2037-04-01'
FROM generated_insurance;

WITH insurance_months(month_start) AS (
  VALUES ('2026-04-01'), ('2026-05-01'), ('2026-06-01'),
    ('2026-07-01'), ('2026-08-01'), ('2026-09-01')
), generated_insurance AS (
  SELECT 'demo-delivery-insurance-' || strftime('%Y-%m', month_start) AS id,
    'VEHICLE' AS insurance_type, 'DEMO-MOTOR-2048' AS policy_number,
    'demo-vehicle-koru' AS vehicle_id, month_start
  FROM insurance_months WHERE month_start <> '2026-07-01'
  UNION ALL
  SELECT 'demo-rideshare-insurance-' || strftime('%Y-%m', month_start),
    'VEHICLE', 'DEMO-RIDE-818', 'demo-vehicle-koru', month_start
  FROM insurance_months
  UNION ALL
  SELECT 'demo-contract-insurance-' || strftime('%Y-%m', month_start),
    'PROFESSIONAL_LIABILITY', 'DEMO-PL-1024', NULL, month_start
  FROM insurance_months WHERE month_start <> '2026-04-01'
)
INSERT INTO insurance_expense_details (
  expense_id, insurance_type, provider, policy_number, policy_period_start,
  policy_period_end, vehicle_id
)
SELECT id, insurance_type, 'Rimu Mutual', policy_number, month_start,
  date(month_start, '+1 month', '-1 day'), vehicle_id
FROM generated_insurance;

WITH generated_parking(id, activity_id, purchased_at, amount, provider, location) AS (
  VALUES
    ('demo-delivery-parking-01', 'demo-activity-delivery', '2026-09-22T10:45:00.000Z', 650, 'Central City Parking', 'Te Aro'),
    ('demo-delivery-parking-02', 'demo-activity-delivery', '2026-09-25T16:50:00.000Z', 900, 'Market Lane Parking', 'Wellington CBD'),
    ('demo-delivery-parking-03', 'demo-activity-delivery', '2026-09-27T10:55:00.000Z', 550, 'Central City Parking', 'Te Aro'),
    ('demo-delivery-parking-04', 'demo-activity-delivery', '2026-09-30T16:45:00.000Z', 750, 'Market Lane Parking', 'Wellington CBD'),
    ('demo-rideshare-parking-01', 'demo-activity-rideshare', '2026-09-21T09:20:00.000Z', 1100, 'Harbour Park', 'Wellington Airport'),
    ('demo-rideshare-parking-02', 'demo-activity-rideshare', '2026-09-24T09:30:00.000Z', 1250, 'Harbour Park', 'Wellington Airport'),
    ('demo-rideshare-parking-03', 'demo-activity-rideshare', '2026-09-26T15:10:00.000Z', 800, 'Stadium Parking', 'Thorndon'),
    ('demo-rideshare-parking-04', 'demo-activity-rideshare', '2026-09-29T09:15:00.000Z', 1050, 'Harbour Park', 'Wellington Airport')
)
INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, created_at, updated_at,
  retention_until, purge_eligible_at
)
SELECT id, activity_id, 'PARKING', 'category-parking', provider, purchased_at,
  amount, 'NZD', CAST(round(amount * 3.0 / 23.0) AS INTEGER), 'GST_INCLUDED',
  'Parking between scheduled jobs', 'ONE_OFF', 'READY_FOR_REVIEW',
  'demo-owner', purchased_at, purchased_at, '2037-03-31', '2037-04-01'
FROM generated_parking;

WITH generated_parking(id, purchased_at, provider, location) AS (
  VALUES
    ('demo-delivery-parking-01', '2026-09-22T10:45:00.000Z', 'Central City Parking', 'Te Aro'),
    ('demo-delivery-parking-02', '2026-09-25T16:50:00.000Z', 'Market Lane Parking', 'Wellington CBD'),
    ('demo-delivery-parking-03', '2026-09-27T10:55:00.000Z', 'Central City Parking', 'Te Aro'),
    ('demo-delivery-parking-04', '2026-09-30T16:45:00.000Z', 'Market Lane Parking', 'Wellington CBD'),
    ('demo-rideshare-parking-01', '2026-09-21T09:20:00.000Z', 'Harbour Park', 'Wellington Airport'),
    ('demo-rideshare-parking-02', '2026-09-24T09:30:00.000Z', 'Harbour Park', 'Wellington Airport'),
    ('demo-rideshare-parking-03', '2026-09-26T15:10:00.000Z', 'Stadium Parking', 'Thorndon'),
    ('demo-rideshare-parking-04', '2026-09-29T09:15:00.000Z', 'Harbour Park', 'Wellington Airport')
)
INSERT INTO parking_expense_details (
  expense_id, vehicle_id, parking_provider, parking_location,
  parking_start_datetime, parking_end_datetime, parking_reference
)
SELECT id, 'demo-vehicle-koru', provider, location, purchased_at,
  replace(datetime(purchased_at, '+45 minutes'), ' ', 'T') || '.000Z',
  upper(substr(id, -2))
FROM generated_parking;

-- Ten weeks of Tuesday delivery and Thursday ride-hailing settlements.
WITH RECURSIVE payout_weeks(week_number) AS (
  VALUES (0) UNION ALL SELECT week_number + 1 FROM payout_weeks WHERE week_number < 9
), generated_payouts AS (
  SELECT printf('demo-delivery-payout-%02d', week_number + 1) AS id,
    'demo-activity-delivery' AS activity_id,
    date('2026-07-28', printf('+%d days', week_number * 7)) AS paid_on,
    47200 + week_number * 1350 AS net_amount, 'Harbour Hopper' AS provider
  FROM payout_weeks
  UNION ALL
  SELECT printf('demo-rideshare-payout-%02d', week_number + 1),
    'demo-activity-rideshare',
    date('2026-07-30', printf('+%d days', week_number * 7)),
    63800 + week_number * 1725, 'Koru Ride'
  FROM payout_weeks
)
INSERT INTO income_records (
  id, business_activity_id, income_type, received_from, transaction_date,
  total_amount_minor, currency, status, notes, created_by, created_at,
  updated_at, retention_until, purge_eligible_at
)
SELECT id, activity_id, 'PLATFORM', provider, paid_on, net_amount, 'NZD',
  'PROCESSED', 'Weekly platform settlement', 'demo-owner',
  paid_on || 'T00:10:00.000Z', paid_on || 'T00:10:00.000Z',
  '2037-03-31', '2037-04-01'
FROM generated_payouts;

WITH RECURSIVE payout_weeks(week_number) AS (
  VALUES (0) UNION ALL SELECT week_number + 1 FROM payout_weeks WHERE week_number < 9
), generated_payouts AS (
  SELECT printf('demo-delivery-payout-%02d', week_number + 1) AS id,
    date('2026-07-28', printf('+%d days', week_number * 7)) AS paid_on,
    47200 + week_number * 1350 AS net_amount, 'Harbour Hopper' AS provider
  FROM payout_weeks
  UNION ALL
  SELECT printf('demo-rideshare-payout-%02d', week_number + 1),
    date('2026-07-30', printf('+%d days', week_number * 7)),
    63800 + week_number * 1725, 'Koru Ride'
  FROM payout_weeks
)
INSERT INTO platform_income_details (
  income_id, provider_name, period_start, period_end, payment_date,
  gross_earnings_minor, tips_minor, bonuses_promotions_minor,
  flat_rate_credit_minor, platform_fees_minor, other_adjustments_minor,
  net_payment_received_minor
)
SELECT id, provider, date(paid_on, '-8 days'), date(paid_on, '-2 days'), paid_on,
  net_amount + 7200, 2400, 1200, 0, 7200, 0, net_amount
FROM generated_payouts;

-- Six months of weekday client parking and weekly Friday payments make the
-- contracting business feel like a sustained engagement rather than a sample.
WITH RECURSIVE contract_days(day_number, parking_date) AS (
  VALUES (0, '2026-04-01')
  UNION ALL
  SELECT day_number + 1, date(parking_date, '+1 day')
  FROM contract_days
  WHERE parking_date < '2026-09-30'
), weekday_parking AS (
  SELECT day_number, parking_date
  FROM contract_days
  WHERE strftime('%w', parking_date) BETWEEN '1' AND '5'
)
INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, created_at, updated_at,
  retention_until, purge_eligible_at
)
SELECT printf('demo-contract-parking-%s', replace(parking_date, '-', '')),
  'demo-activity-contracting', 'PARKING', 'category-parking',
  CASE day_number % 2 WHEN 0 THEN 'Civic Quay Parking' ELSE 'Terrace Parking' END,
  parking_date || 'T08:15:00.000Z', 1800 + (day_number % 4) * 200, 'NZD',
  CAST(round((1800 + (day_number % 4) * 200) * 3.0 / 23.0) AS INTEGER),
  'GST_INCLUDED', 'Parking for client-site contracting', 'ONE_OFF',
  'PROCESSED', 'demo-owner', parking_date || 'T08:15:00.000Z',
  parking_date || 'T17:20:00.000Z', '2037-03-31', '2037-04-01'
FROM weekday_parking;

WITH RECURSIVE contract_days(day_number, parking_date) AS (
  VALUES (0, '2026-04-01')
  UNION ALL
  SELECT day_number + 1, date(parking_date, '+1 day')
  FROM contract_days
  WHERE parking_date < '2026-09-30'
), weekday_parking AS (
  SELECT day_number, parking_date
  FROM contract_days
  WHERE strftime('%w', parking_date) BETWEEN '1' AND '5'
)
INSERT INTO parking_expense_details (
  expense_id, vehicle_id, parking_provider, parking_location,
  parking_start_datetime, parking_end_datetime, parking_reference
)
SELECT printf('demo-contract-parking-%s', replace(parking_date, '-', '')),
  'demo-vehicle-koru',
  CASE day_number % 2 WHEN 0 THEN 'Civic Quay Parking' ELSE 'Terrace Parking' END,
  CASE day_number % 2 WHEN 0 THEN 'Wellington waterfront' ELSE 'The Terrace' END,
  parking_date || 'T08:15:00.000Z', parking_date || 'T17:15:00.000Z',
  printf('CON-%03d', day_number + 1)
FROM weekday_parking;

WITH RECURSIVE contract_weeks(week_number, paid_on) AS (
  VALUES (0, '2026-04-03')
  UNION ALL
  SELECT week_number + 1, date(paid_on, '+7 days')
  FROM contract_weeks
  WHERE week_number < 25
)
INSERT INTO income_records (
  id, business_activity_id, income_type, received_from, transaction_date,
  total_amount_minor, currency, status, notes, created_by, created_at,
  updated_at, retention_until, purge_eligible_at
)
SELECT printf('demo-contract-week-%02d', week_number + 1),
  'demo-activity-contracting', 'CONTRACT', 'Harbour Lantern Limited', paid_on,
  230000, 'NZD', 'PROCESSED', 'Weekly contracting invoice paid Friday',
  'demo-owner', paid_on || 'T17:30:00.000Z', paid_on || 'T17:30:00.000Z',
  '2037-03-31', '2037-04-01'
FROM contract_weeks;

WITH RECURSIVE contract_weeks(week_number, paid_on) AS (
  VALUES (0, '2026-04-03')
  UNION ALL
  SELECT week_number + 1, date(paid_on, '+7 days')
  FROM contract_weeks
  WHERE week_number < 25
)
INSERT INTO contract_income_details (
  income_id, client_id, invoice_number, invoice_date, service_period_start,
  service_period_end, subtotal_minor, gst_amount_minor, total_minor, due_date,
  payment_received_date, amount_received_minor, payment_status
)
SELECT printf('demo-contract-week-%02d', week_number + 1),
  'demo-client-harbour', printf('HL-2026-W%02d', week_number + 14),
  date(paid_on, '-4 days'), date(paid_on, '-7 days'), date(paid_on, '-3 days'),
  200000, 30000, 230000, paid_on, paid_on, 230000, 'PAID'
FROM contract_weeks;

-- Six complete months of subscription settlements, hosting, payment fees and
-- quarterly domain renewals provide exactly twenty SaaS records.
WITH subscription_months(month_start, net_amount, subscribers) AS (
  VALUES
    ('2026-04-01', 211400, 96), ('2026-05-01', 232800, 104),
    ('2026-06-01', 259300, 115), ('2026-09-01', 351900, 153)
)
INSERT INTO income_records (
  id, business_activity_id, income_type, received_from, transaction_date,
  total_amount_minor, currency, status, notes, created_by, created_at,
  updated_at, retention_until, purge_eligible_at
)
SELECT 'demo-subscription-' || strftime('%Y-%m', month_start),
  'demo-activity-saas', 'SUBSCRIPTION', 'Subscription platform',
  date(month_start, '+1 month', '-1 day'), net_amount, 'NZD', 'PROCESSED',
  strftime('%Y-%m', month_start) || ' subscriber summary', 'demo-owner',
  date(month_start, '+1 month') || 'T00:15:00.000Z',
  date(month_start, '+1 month') || 'T00:15:00.000Z', '2037-03-31', '2037-04-01'
FROM subscription_months;

WITH subscription_months(month_start, net_amount, subscribers) AS (
  VALUES
    ('2026-04-01', 211400, 96), ('2026-05-01', 232800, 104),
    ('2026-06-01', 259300, 115), ('2026-09-01', 351900, 153)
)
INSERT INTO subscription_income_details (
  income_id, period_start, period_end, gross_subscription_revenue_minor,
  refunds_minor, platform_fees_minor, payment_processing_fees_minor,
  net_payment_received_minor, subscriber_count, new_subscribers,
  cancelled_subscribers
)
SELECT 'demo-subscription-' || strftime('%Y-%m', month_start), month_start,
  date(month_start, '+1 month', '-1 day'), net_amount + 24200, 4200, 8600,
  11400, net_amount, subscribers, 12 + subscribers % 7, 5 + subscribers % 4
FROM subscription_months;

WITH saas_expenses(id, purchased_at, amount, category_id, merchant, description) AS (
  VALUES
    ('demo-cloud-2026-04', '2026-04-02T00:00:00.000Z', 11200, 'category-cloud-hosting', 'Pounamu Cloud Services', 'April application hosting'),
    ('demo-cloud-2026-05', '2026-05-02T00:00:00.000Z', 11800, 'category-cloud-hosting', 'Pounamu Cloud Services', 'May application hosting'),
    ('demo-cloud-2026-06', '2026-06-02T00:00:00.000Z', 12400, 'category-cloud-hosting', 'Pounamu Cloud Services', 'June application hosting'),
    ('demo-cloud-2026-07', '2026-07-02T00:00:00.000Z', 13100, 'category-cloud-hosting', 'Pounamu Cloud Services', 'July application hosting'),
    ('demo-cloud-2026-09', '2026-09-02T00:00:00.000Z', 14600, 'category-cloud-hosting', 'Pounamu Cloud Services', 'September application hosting'),
    ('demo-processing-2026-04', '2026-04-30T23:00:00.000Z', 8300, 'category-payment-processing', 'Koru Payments', 'April payment processing fees'),
    ('demo-processing-2026-05', '2026-05-31T23:00:00.000Z', 8900, 'category-payment-processing', 'Koru Payments', 'May payment processing fees'),
    ('demo-processing-2026-06', '2026-06-30T23:00:00.000Z', 9600, 'category-payment-processing', 'Koru Payments', 'June payment processing fees'),
    ('demo-processing-2026-07', '2026-07-31T23:00:00.000Z', 10400, 'category-payment-processing', 'Koru Payments', 'July payment processing fees'),
    ('demo-processing-2026-08', '2026-08-31T23:00:00.000Z', 11200, 'category-payment-processing', 'Koru Payments', 'August payment processing fees'),
    ('demo-processing-2026-09', '2026-09-30T23:00:00.000Z', 12100, 'category-payment-processing', 'Koru Payments', 'September payment processing fees'),
    ('demo-domain-2026-04', '2026-04-01T01:00:00.000Z', 3200, 'category-domain-registration', 'Aotearoa Domains', 'Quarterly domain renewal'),
    ('demo-domain-2026-07', '2026-07-01T01:00:00.000Z', 3200, 'category-domain-registration', 'Aotearoa Domains', 'Quarterly domain renewal')
)
INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, created_at, updated_at,
  retention_until, purge_eligible_at
)
SELECT id, 'demo-activity-saas', 'GENERAL', category_id, merchant, purchased_at,
  amount, 'NZD', CAST(round(amount * 3.0 / 23.0) AS INTEGER), 'GST_INCLUDED',
  description, 'RECURRING', 'PROCESSED', 'demo-owner', purchased_at,
  purchased_at, '2037-03-31', '2037-04-01'
FROM saas_expenses;

INSERT INTO income_reconciliations (id, income_id, expected_amount_minor, actual_amount_minor, matched, notes, reconciled_by, created_at, updated_at)
VALUES
  ('demo-reconciliation-platform', 'demo-platform-1', 58240, 58240, 1, 'Matched to synthetic bank deposit', 'demo-accountant', '2026-08-05T01:00:00.000Z', '2026-08-05T01:00:00.000Z'),
  ('demo-reconciliation-subscription', 'demo-subscription-1', 284750, 284700, 0, 'Small settlement difference left for follow-up', 'demo-accountant', '2026-08-02T02:00:00.000Z', '2026-08-02T02:00:00.000Z');

INSERT INTO comments (id, record_type, record_id, author_id, message, created_at)
VALUES
  ('demo-comment-1', 'INCOME', 'demo-contract-open', 'demo-owner', 'Invoice and statement are ready for review.', '2026-08-20T00:20:00.000Z'),
  ('demo-comment-2', 'INCOME', 'demo-platform-1', 'demo-accountant', 'Deposit agrees to the weekly statement.', '2026-08-05T01:05:00.000Z'),
  ('demo-comment-3', 'EXPENSE', 'demo-parking-2', 'demo-accountant', 'Please add the parking receipt before review.', '2026-08-15T01:00:00.000Z'),
  ('demo-comment-4', 'EXPENSE', 'demo-software-1', 'demo-owner', 'Recurring development subscription.', '2026-08-01T00:10:00.000Z');

INSERT INTO saved_filters (id, user_id, name, filter_type, criteria_json, created_at, updated_at)
VALUES
  ('demo-filter-owner', 'demo-owner', 'Needs my attention', 'TRANSACTIONS', '{"status":"MISSING_INFORMATION"}', '2026-08-15T01:00:00.000Z', '2026-08-15T01:00:00.000Z'),
  ('demo-filter-accountant', 'demo-accountant', 'Ready for review', 'TRANSACTIONS', '{"status":"READY_FOR_REVIEW"}', '2026-08-15T01:00:00.000Z', '2026-08-15T01:00:00.000Z');

INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, business_activity_id, summary, changed_fields_json, created_at)
VALUES
  ('demo-audit-1', 'demo-owner', 'WORK_SESSION_CREATED', 'WORK_SESSION', 'demo-session-1', 'demo-activity-delivery', 'Work session recorded.', NULL, '2026-08-03T09:20:00.000Z'),
  ('demo-audit-2', 'demo-owner', 'EXPENSE_CREATED', 'EXPENSE', 'demo-fuel-1', 'demo-activity-delivery', 'Fuel expense recorded.', NULL, '2026-08-03T05:00:00.000Z'),
  ('demo-audit-3', 'demo-owner', 'INCOME_CREATED', 'INCOME', 'demo-platform-1', 'demo-activity-delivery', 'Platform income recorded.', NULL, '2026-08-04T00:10:00.000Z'),
  ('demo-audit-4', 'demo-accountant', 'RECORD_STATUS_CHANGED', 'INCOME', 'demo-platform-1', 'demo-activity-delivery', 'Income status changed to reviewed.', '{"status":{"before":"READY_FOR_REVIEW","after":"REVIEWED"}}', '2026-08-05T01:00:00.000Z'),
  ('demo-audit-5', 'demo-accountant', 'INCOME_RECONCILED', 'INCOME', 'demo-platform-1', 'demo-activity-delivery', 'Platform payout reconciled.', NULL, '2026-08-05T01:00:00.000Z'),
  ('demo-audit-6', 'demo-owner', 'EXPENSE_CREATED', 'EXPENSE', 'demo-parking-1', 'demo-activity-contracting', 'Parking expense recorded.', NULL, '2026-08-06T20:35:00.000Z'),
  ('demo-audit-7', 'demo-owner', 'INCOME_CREATED', 'INCOME', 'demo-contract-paid', 'demo-activity-contracting', 'Contract invoice recorded.', NULL, '2026-07-31T00:10:00.000Z'),
  ('demo-audit-8', 'demo-accountant', 'RECORD_STATUS_CHANGED', 'INCOME', 'demo-contract-paid', 'demo-activity-contracting', 'Contract invoice processed.', '{"status":{"before":"REVIEWED","after":"PROCESSED"}}', '2026-08-01T01:00:00.000Z'),
  ('demo-audit-9', 'demo-owner', 'INCOME_CREATED', 'INCOME', 'demo-subscription-1', 'demo-activity-saas', 'Subscription summary recorded.', NULL, '2026-08-01T00:15:00.000Z'),
  ('demo-audit-10', 'demo-accountant', 'COMMENT_CREATED', 'INCOME', 'demo-platform-1', 'demo-activity-delivery', 'Review comment added.', NULL, '2026-08-05T01:05:00.000Z'),
  ('demo-audit-11', 'demo-owner', 'INCOME_CREATED', 'INCOME', 'demo-contract-open', 'demo-activity-contracting', 'Outstanding contract invoice recorded.', NULL, '2026-08-20T00:10:00.000Z'),
  ('demo-audit-12', 'demo-accountant', 'COMMENT_CREATED', 'EXPENSE', 'demo-parking-2', 'demo-activity-rideshare', 'Missing receipt requested.', NULL, '2026-08-15T01:00:00.000Z');

-- Seed inserts retain the legacy activity columns for compatibility. Populate
-- the authoritative business/entity attribution from the known demo periods.
UPDATE expenses
SET business_id = 'business-' || business_activity_id,
    legal_entity_id = CASE business_activity_id
      WHEN 'demo-activity-rideshare' THEN 'demo-entity-taxi-limited'
      WHEN 'demo-activity-saas' THEN 'demo-entity-saas-limited'
      ELSE 'business-entity-primary'
    END,
    attribution_review_required = 0;

UPDATE work_sessions
SET business_id = 'business-' || business_activity_id,
    legal_entity_id = CASE business_activity_id
      WHEN 'demo-activity-rideshare' THEN 'demo-entity-taxi-limited'
      ELSE 'business-entity-primary'
    END,
    attribution_review_required = 0;

UPDATE income_records
SET business_id = 'business-' || business_activity_id,
    legal_entity_id = CASE business_activity_id
      WHEN 'demo-activity-rideshare' THEN 'demo-entity-taxi-limited'
      WHEN 'demo-activity-saas' THEN 'demo-entity-saas-limited'
      ELSE 'business-entity-primary'
    END,
    attribution_review_required = 0;

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
SET business_id = 'business-' || business_activity_id,
    legal_entity_id = CASE business_activity_id
      WHEN 'demo-activity-rideshare' THEN 'demo-entity-taxi-limited'
      WHEN 'demo-activity-saas' THEN 'demo-entity-saas-limited'
      ELSE 'business-entity-primary'
    END
WHERE business_activity_id IS NOT NULL;

UPDATE expense_categories
SET business_id = (
  SELECT CASE WHEN COUNT(DISTINCT expense.business_id) = 1
    THEN MIN(expense.business_id) ELSE NULL END
  FROM expenses AS expense
  WHERE expense.expense_category_id = expense_categories.id
);

UPDATE retention_settings
SET retention_tax_years = 10,
    tax_year_end_month = 3,
    tax_year_end_day = 31,
    backup_reminder_days = 30,
    updated_by = 'demo-owner',
    updated_at = '2026-04-01T00:00:00.000Z'
WHERE singleton_id = 1;

INSERT INTO runtime_metadata (key, value, updated_at)
VALUES
  ('seed_profile', 'public-demo-synthetic-nz', '2026-09-11T00:00:00.000Z'),
  ('schema_phase', '19', '2026-09-11T00:00:00.000Z'),
  ('schema_architecture', 'business-identity-backfilled', '2026-09-23T00:00:00.000Z');
