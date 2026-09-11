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
DELETE FROM business_activities;
UPDATE retention_settings SET updated_by = NULL;
DELETE FROM development_outbox;
DELETE FROM sessions;
DELETE FROM invitations;
DELETE FROM users;
DELETE FROM runtime_metadata;

INSERT INTO users (id, email, role, status, created_at, updated_at)
VALUES
  ('demo-owner', 'demo-owner@example.invalid', 'OWNER', 'ACTIVE', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-accountant', 'demo-accountant@example.invalid', 'ACCOUNTANT', 'ACTIVE', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

INSERT INTO business_activities (id, name, activity_type, active, started_at, ended_at, created_at, updated_at)
VALUES
  ('demo-activity-delivery', 'Delivery Platform', 'PLATFORM_SERVICES', 1, '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-activity-rideshare', 'Ride-Hailing Platform', 'PLATFORM_SERVICES', 1, '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-activity-contracting', 'IT Contracting', 'PROFESSIONAL_SERVICES', 1, '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-activity-saas', 'SaaS Business', 'SOFTWARE_SERVICE', 1, '2026-04-01', NULL, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

INSERT INTO vehicles (id, registration, description, active, acquired_at, retired_at, notes, created_at, updated_at)
VALUES
  ('demo-vehicle-koru', 'KORU24', '2024 hybrid hatchback', 1, '2025-11-18', NULL, 'Synthetic demonstration vehicle', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-vehicle-tui', 'TUI818', '2018 compact hatchback', 0, '2021-02-10', '2026-06-30', 'Synthetic retired demonstration vehicle', '2026-04-01T00:00:00.000Z', '2026-06-30T00:00:00.000Z');

INSERT INTO clients (id, name, active, notes, created_at, updated_at)
VALUES
  ('demo-client-harbour', 'Harbour Lantern Limited', 1, 'Fictional Wellington software consultancy client', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('demo-client-kowhai', 'Kowhai Field Services Limited', 1, 'Fictional Christchurch operations client', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

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
  ('demo-insurance-vehicle', 'demo-activity-delivery', 'INSURANCE', 'category-vehicle-insurance', 'Rimu Mutual', '2026-07-01T00:00:00.000Z', 148000, 'NZD', NULL, 'NO_GST', 'Annual vehicle policy', 'RECURRING', 'REVIEWED', 'demo-owner', 'demo-accountant', '2026-07-03T01:00:00.000Z', '2026-07-01T00:05:00.000Z', '2026-07-03T01:00:00.000Z', '2037-03-31', '2037-04-01'),
  ('demo-insurance-liability', 'demo-activity-contracting', 'INSURANCE', 'category-liability-insurance', 'Rimu Mutual', '2026-04-01T00:00:00.000Z', 92000, 'NZD', NULL, 'NO_GST', 'Professional liability policy', 'RECURRING', 'PROCESSED', 'demo-owner', 'demo-accountant', '2026-04-03T01:00:00.000Z', '2026-04-01T00:05:00.000Z', '2026-04-03T01:00:00.000Z', '2037-03-31', '2037-04-01');

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
  ('demo-insurance-vehicle', 'VEHICLE', 'Rimu Mutual', 'DEMO-MOTOR-2048', '2026-07-01', '2027-06-30', 'demo-vehicle-koru'),
  ('demo-insurance-liability', 'PROFESSIONAL_LIABILITY', 'Rimu Mutual', 'DEMO-PL-1024', '2026-04-01', '2027-03-31', NULL);

INSERT INTO expense_allocations (id, expense_id, business_activity_id, allocation_method, percentage_basis_points, allocated_amount_minor, calculation_period_start, calculation_period_end, notes, reviewed_by, created_at, updated_at)
VALUES
  ('demo-allocation-vehicle', 'demo-insurance-vehicle', 'demo-activity-delivery', 'BUSINESS_KM_OVER_TOTAL_KM', 7200, 106560, '2026-07-01', '2027-06-30', 'Illustrative allocation based on recorded business kilometres; not final tax treatment', 'demo-accountant', '2026-07-03T01:00:00.000Z', '2026-07-03T01:00:00.000Z'),
  ('demo-allocation-liability', 'demo-insurance-liability', 'demo-activity-contracting', '100_PERCENT_BUSINESS', 10000, 92000, '2026-04-01', '2027-03-31', 'Professional services policy', 'demo-accountant', '2026-04-03T01:00:00.000Z', '2026-04-03T01:00:00.000Z');

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
  ('schema_phase', '19', '2026-09-11T00:00:00.000Z');
