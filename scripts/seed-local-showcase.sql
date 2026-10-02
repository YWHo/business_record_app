PRAGMA foreign_keys = ON;

UPDATE businesses
SET name = CASE id
      WHEN 'business-activity-delivery' THEN 'Uber Eats'
      WHEN 'business-activity-rideshare' THEN 'Uber Ride'
      WHEN 'business-activity-contracting' THEN 'IT Contracting'
      WHEN 'business-activity-saas' THEN 'Music Streaming'
    END,
    description = CASE id
      WHEN 'business-activity-delivery' THEN 'Food delivery'
      WHEN 'business-activity-rideshare' THEN 'Ride-hailing'
      WHEN 'business-activity-contracting' THEN 'IT services'
      WHEN 'business-activity-saas' THEN 'SaaS website'
    END,
    updated_at = '2026-10-01T00:00:00.000Z';

-- One shared vehicle follows a non-overlapping daily schedule: ride-hailing
-- during commuter/night periods and delivery during lunch/dinner periods.
WITH RECURSIVE days(day_number, work_date) AS (
  VALUES (0, '2026-09-21')
  UNION ALL
  SELECT day_number + 1, date(work_date, '+1 day')
  FROM days
  WHERE day_number < 9
), sessions AS (
  SELECT printf('showcase-delivery-lunch-%02d', day_number + 1) AS id,
    'activity-delivery' AS activity_id,
    work_date || 'T11:30:00.000Z' AS started_at,
    work_date || 'T14:00:00.000Z' AS ended_at,
    30000 + day_number * 150 + 45 AS odometer_start,
    30000 + day_number * 150 + 70 AS odometer_end,
    6900 + day_number * 175 AS revenue,
    'Lunch delivery round' AS notes
  FROM days
  UNION ALL
  SELECT printf('showcase-delivery-dinner-%02d', day_number + 1),
    'activity-delivery', work_date || 'T17:30:00.000Z',
    work_date || 'T20:30:00.000Z', 30000 + day_number * 150 + 70,
    30000 + day_number * 150 + 105, 9800 + day_number * 225,
    'Dinner delivery round'
  FROM days
  UNION ALL
  SELECT printf('showcase-rideshare-morning-%02d', day_number + 1),
    'activity-rideshare', work_date || 'T06:00:00.000Z',
    work_date || 'T09:00:00.000Z', 30000 + day_number * 150,
    30000 + day_number * 150 + 45, 12600 + day_number * 240,
    CASE WHEN strftime('%w', work_date) IN ('0', '6')
      THEN 'Weekend morning ride-hailing shift'
      ELSE 'Weekday commuter ride-hailing shift' END
  FROM days
  UNION ALL
  SELECT printf('showcase-rideshare-night-%02d', day_number + 1),
    'activity-rideshare', work_date || 'T21:00:00.000Z',
    work_date || 'T23:59:00.000Z', 30000 + day_number * 150 + 105,
    30000 + day_number * 150 + 150, 15100 + day_number * 275,
    CASE WHEN strftime('%w', work_date) IN ('0', '6')
      THEN 'Weekend evening ride-hailing shift'
      ELSE 'Weekday evening ride-hailing shift' END
  FROM days
)
INSERT INTO work_sessions (
  id, business_activity_id, vehicle_id, started_at, ended_at,
  odometer_start_km, odometer_end_km, gross_revenue_minor, currency, notes,
  status, created_by, created_at, updated_at, retention_until, purge_eligible_at
)
SELECT id, activity_id, 'vehicle-current', started_at, ended_at,
  odometer_start, odometer_end, revenue, 'NZD', notes,
  CASE odometer_start % 4 WHEN 0 THEN 'PROCESSED' WHEN 1 THEN 'REVIEWED'
    WHEN 2 THEN 'READY_FOR_REVIEW' ELSE 'NEW' END,
  'dev-owner', ended_at, ended_at, '2037-03-31', '2037-04-01'
FROM sessions;

-- Weekly Tuesday delivery and Thursday ride-hailing settlements.
WITH RECURSIVE weeks(week_number) AS (
  VALUES (0) UNION ALL SELECT week_number + 1 FROM weeks WHERE week_number < 9
), payouts AS (
  SELECT printf('showcase-delivery-payout-%02d', week_number + 1) AS id,
    'activity-delivery' AS activity_id,
    date('2026-07-28', printf('+%d days', week_number * 7)) AS paid_on,
    47200 + week_number * 1350 AS amount, 'Harbour Hopper' AS provider
  FROM weeks
  UNION ALL
  SELECT printf('showcase-rideshare-payout-%02d', week_number + 1),
    'activity-rideshare',
    date('2026-07-30', printf('+%d days', week_number * 7)),
    63800 + week_number * 1725, 'Koru Ride'
  FROM weeks
)
INSERT INTO income_records (
  id, business_activity_id, income_type, received_from, transaction_date,
  total_amount_minor, currency, status, notes, created_by, created_at,
  updated_at, retention_until, purge_eligible_at
)
SELECT id, activity_id, 'PLATFORM', provider, paid_on, amount, 'NZD',
  'PROCESSED', 'Weekly platform settlement', 'dev-owner',
  paid_on || 'T00:10:00.000Z', paid_on || 'T00:10:00.000Z',
  '2037-03-31', '2037-04-01'
FROM payouts;

WITH RECURSIVE weeks(week_number) AS (
  VALUES (0) UNION ALL SELECT week_number + 1 FROM weeks WHERE week_number < 9
), payouts AS (
  SELECT printf('showcase-delivery-payout-%02d', week_number + 1) AS id,
    date('2026-07-28', printf('+%d days', week_number * 7)) AS paid_on,
    47200 + week_number * 1350 AS amount, 'Harbour Hopper' AS provider
  FROM weeks
  UNION ALL
  SELECT printf('showcase-rideshare-payout-%02d', week_number + 1),
    date('2026-07-30', printf('+%d days', week_number * 7)),
    63800 + week_number * 1725, 'Koru Ride'
  FROM weeks
)
INSERT INTO platform_income_details (
  income_id, provider_name, period_start, period_end, payment_date,
  gross_earnings_minor, tips_minor, bonuses_promotions_minor,
  flat_rate_credit_minor, platform_fees_minor, other_adjustments_minor,
  net_payment_received_minor
)
SELECT id, provider, date(paid_on, '-8 days'), date(paid_on, '-2 days'),
  paid_on, amount + 7200, 2400, 1200, 0, 7200, 0, amount
FROM payouts;

-- Six weekly fuel fills for each driving business.
WITH RECURSIVE weeks(week_number) AS (
  VALUES (0) UNION ALL SELECT week_number + 1 FROM weeks WHERE week_number < 5
), fuel AS (
  SELECT printf('showcase-delivery-fuel-%02d', week_number + 1) AS id,
    'activity-delivery' AS activity_id,
    datetime('2026-08-23', printf('+%d days', week_number * 7), '+16 hours')
      AS purchased_at,
    8900 + week_number * 185 AS amount,
    28500 + week_number * 340 AS odometer, 'Kauri Fuel Point' AS merchant
  FROM weeks
  UNION ALL
  SELECT printf('showcase-rideshare-fuel-%02d', week_number + 1),
    'activity-rideshare',
    datetime('2026-08-21', printf('+%d days', week_number * 7), '+10 hours'),
    9600 + week_number * 210, 28640 + week_number * 340,
    'Southern Star Energy'
  FROM weeks
)
INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, created_at, updated_at,
  retention_until, purge_eligible_at
)
SELECT id, activity_id, 'FUEL', 'category-fuel', merchant, purchased_at,
  amount, 'NZD', CAST(round(amount * 3.0 / 23.0) AS INTEGER), 'GST_INCLUDED',
  'Weekly fuel fill', 'ONE_OFF', 'REVIEWED', 'dev-owner', purchased_at,
  purchased_at, '2037-03-31', '2037-04-01'
FROM fuel;

WITH RECURSIVE weeks(week_number) AS (
  VALUES (0) UNION ALL SELECT week_number + 1 FROM weeks WHERE week_number < 5
), fuel AS (
  SELECT printf('showcase-delivery-fuel-%02d', week_number + 1) AS id,
    28500 + week_number * 340 AS odometer, 'Kauri Fuel Point' AS merchant
  FROM weeks
  UNION ALL
  SELECT printf('showcase-rideshare-fuel-%02d', week_number + 1),
    28640 + week_number * 340, 'Southern Star Energy'
  FROM weeks
)
INSERT INTO fuel_expense_details (
  expense_id, vehicle_id, fuel_station, fuel_price_micros_per_litre,
  fuel_litres, odometer_km, fill_type, notes
)
SELECT id, 'vehicle-current', merchant, 2640000, 36.500, odometer,
  'FULL', 'Synthetic weekly fill'
FROM fuel;

-- Monthly vehicle/professional insurance for April through September.
WITH months(month_start) AS (
  VALUES ('2026-04-01'), ('2026-05-01'), ('2026-06-01'),
    ('2026-07-01'), ('2026-08-01'), ('2026-09-01')
), insurance AS (
  SELECT 'showcase-delivery-insurance-' || strftime('%Y-%m', month_start) AS id,
    'activity-delivery' AS activity_id, 'category-vehicle-insurance' AS category,
    12400 AS amount, 'VEHICLE' AS insurance_type,
    'LOCAL-MOTOR-DELIVERY' AS policy, 'vehicle-current' AS vehicle_id,
    month_start
  FROM months
  UNION ALL
  SELECT 'showcase-rideshare-insurance-' || strftime('%Y-%m', month_start),
    'activity-rideshare', 'category-vehicle-insurance', 11800, 'VEHICLE',
    'LOCAL-MOTOR-RIDE', 'vehicle-current', month_start
  FROM months
  UNION ALL
  SELECT 'showcase-contract-insurance-' || strftime('%Y-%m', month_start),
    'activity-contracting', 'category-liability-insurance', 9200,
    'PROFESSIONAL_LIABILITY', 'LOCAL-PL-CONTRACT', NULL, month_start
  FROM months
)
INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, created_at, updated_at,
  retention_until, purge_eligible_at
)
SELECT id, activity_id, 'INSURANCE', category, 'Rimu Mutual',
  month_start || 'T00:00:00.000Z', amount, 'NZD', NULL, 'NO_GST',
  'Monthly insurance premium', 'RECURRING', 'PROCESSED', 'dev-owner',
  month_start || 'T00:05:00.000Z', month_start || 'T00:05:00.000Z',
  '2037-03-31', '2037-04-01'
FROM insurance;

WITH months(month_start) AS (
  VALUES ('2026-04-01'), ('2026-05-01'), ('2026-06-01'),
    ('2026-07-01'), ('2026-08-01'), ('2026-09-01')
), insurance AS (
  SELECT 'showcase-delivery-insurance-' || strftime('%Y-%m', month_start) AS id,
    'VEHICLE' AS insurance_type, 'LOCAL-MOTOR-DELIVERY' AS policy,
    'vehicle-current' AS vehicle_id, month_start FROM months
  UNION ALL
  SELECT 'showcase-rideshare-insurance-' || strftime('%Y-%m', month_start),
    'VEHICLE', 'LOCAL-MOTOR-RIDE', 'vehicle-current', month_start FROM months
  UNION ALL
  SELECT 'showcase-contract-insurance-' || strftime('%Y-%m', month_start),
    'PROFESSIONAL_LIABILITY', 'LOCAL-PL-CONTRACT', NULL, month_start FROM months
)
INSERT INTO insurance_expense_details (
  expense_id, insurance_type, provider, policy_number, policy_period_start,
  policy_period_end, vehicle_id
)
SELECT id, insurance_type, 'Rimu Mutual', policy, month_start,
  date(month_start, '+1 month', '-1 day'), vehicle_id
FROM insurance;

-- Occasional delivery/ride-hailing parking outside the work-session windows.
WITH parking(id, activity_id, purchased_at, amount, provider, location) AS (
  VALUES
    ('showcase-delivery-parking-01', 'activity-delivery', '2026-09-22T10:45:00.000Z', 650, 'Central City Parking', 'Te Aro'),
    ('showcase-delivery-parking-02', 'activity-delivery', '2026-09-25T16:50:00.000Z', 900, 'Market Lane Parking', 'Wellington CBD'),
    ('showcase-delivery-parking-03', 'activity-delivery', '2026-09-27T10:55:00.000Z', 550, 'Central City Parking', 'Te Aro'),
    ('showcase-delivery-parking-04', 'activity-delivery', '2026-09-30T16:45:00.000Z', 750, 'Market Lane Parking', 'Wellington CBD'),
    ('showcase-rideshare-parking-01', 'activity-rideshare', '2026-09-21T09:20:00.000Z', 1100, 'Harbour Park', 'Wellington Airport'),
    ('showcase-rideshare-parking-02', 'activity-rideshare', '2026-09-24T09:30:00.000Z', 1250, 'Harbour Park', 'Wellington Airport'),
    ('showcase-rideshare-parking-03', 'activity-rideshare', '2026-09-26T15:10:00.000Z', 800, 'Stadium Parking', 'Thorndon'),
    ('showcase-rideshare-parking-04', 'activity-rideshare', '2026-09-29T09:15:00.000Z', 1050, 'Harbour Park', 'Wellington Airport')
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
  'dev-owner', purchased_at, purchased_at, '2037-03-31', '2037-04-01'
FROM parking;

WITH parking(id, purchased_at, provider, location) AS (
  VALUES
    ('showcase-delivery-parking-01', '2026-09-22T10:45:00.000Z', 'Central City Parking', 'Te Aro'),
    ('showcase-delivery-parking-02', '2026-09-25T16:50:00.000Z', 'Market Lane Parking', 'Wellington CBD'),
    ('showcase-delivery-parking-03', '2026-09-27T10:55:00.000Z', 'Central City Parking', 'Te Aro'),
    ('showcase-delivery-parking-04', '2026-09-30T16:45:00.000Z', 'Market Lane Parking', 'Wellington CBD'),
    ('showcase-rideshare-parking-01', '2026-09-21T09:20:00.000Z', 'Harbour Park', 'Wellington Airport'),
    ('showcase-rideshare-parking-02', '2026-09-24T09:30:00.000Z', 'Harbour Park', 'Wellington Airport'),
    ('showcase-rideshare-parking-03', '2026-09-26T15:10:00.000Z', 'Stadium Parking', 'Thorndon'),
    ('showcase-rideshare-parking-04', '2026-09-29T09:15:00.000Z', 'Harbour Park', 'Wellington Airport')
)
INSERT INTO parking_expense_details (
  expense_id, vehicle_id, parking_provider, parking_location,
  parking_start_datetime, parking_end_datetime, parking_reference
)
SELECT id, 'vehicle-current', provider, location, purchased_at,
  replace(datetime(purchased_at, '+45 minutes'), ' ', 'T') || '.000Z',
  upper(substr(id, -2))
FROM parking;

-- Six months of weekday client parking and 26 weekly Friday payments.
WITH RECURSIVE days(day_number, parking_date) AS (
  VALUES (0, '2026-04-01')
  UNION ALL
  SELECT day_number + 1, date(parking_date, '+1 day')
  FROM days WHERE parking_date < '2026-09-30'
), weekdays AS (
  SELECT day_number, parking_date FROM days
  WHERE strftime('%w', parking_date) BETWEEN '1' AND '5'
)
INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, created_at, updated_at,
  retention_until, purge_eligible_at
)
SELECT 'showcase-contract-parking-' || replace(parking_date, '-', ''),
  'activity-contracting', 'PARKING', 'category-parking',
  CASE day_number % 2 WHEN 0 THEN 'Civic Quay Parking' ELSE 'Terrace Parking' END,
  parking_date || 'T08:15:00.000Z', 1800 + (day_number % 4) * 200, 'NZD',
  CAST(round((1800 + (day_number % 4) * 200) * 3.0 / 23.0) AS INTEGER),
  'GST_INCLUDED', 'Parking for client-site contracting', 'ONE_OFF',
  'PROCESSED', 'dev-owner', parking_date || 'T08:15:00.000Z',
  parking_date || 'T17:20:00.000Z', '2037-03-31', '2037-04-01'
FROM weekdays;

WITH RECURSIVE days(day_number, parking_date) AS (
  VALUES (0, '2026-04-01')
  UNION ALL
  SELECT day_number + 1, date(parking_date, '+1 day')
  FROM days WHERE parking_date < '2026-09-30'
), weekdays AS (
  SELECT day_number, parking_date FROM days
  WHERE strftime('%w', parking_date) BETWEEN '1' AND '5'
)
INSERT INTO parking_expense_details (
  expense_id, vehicle_id, parking_provider, parking_location,
  parking_start_datetime, parking_end_datetime, parking_reference
)
SELECT 'showcase-contract-parking-' || replace(parking_date, '-', ''),
  'vehicle-current',
  CASE day_number % 2 WHEN 0 THEN 'Civic Quay Parking' ELSE 'Terrace Parking' END,
  CASE day_number % 2 WHEN 0 THEN 'Wellington waterfront' ELSE 'The Terrace' END,
  parking_date || 'T08:15:00.000Z', parking_date || 'T17:15:00.000Z',
  printf('LOCAL-%03d', day_number + 1)
FROM weekdays;

WITH RECURSIVE weeks(week_number, paid_on) AS (
  VALUES (0, '2026-04-03')
  UNION ALL
  SELECT week_number + 1, date(paid_on, '+7 days')
  FROM weeks WHERE week_number < 25
)
INSERT INTO income_records (
  id, business_activity_id, income_type, received_from, transaction_date,
  total_amount_minor, currency, status, notes, created_by, created_at,
  updated_at, retention_until, purge_eligible_at
)
SELECT printf('showcase-contract-week-%02d', week_number + 1),
  'activity-contracting', 'CONTRACT', 'Harbour Digital Limited', paid_on,
  230000, 'NZD', 'PROCESSED', 'Weekly contracting invoice paid Friday',
  'dev-owner', paid_on || 'T17:30:00.000Z', paid_on || 'T17:30:00.000Z',
  '2037-03-31', '2037-04-01'
FROM weeks;

WITH RECURSIVE weeks(week_number, paid_on) AS (
  VALUES (0, '2026-04-03')
  UNION ALL
  SELECT week_number + 1, date(paid_on, '+7 days')
  FROM weeks WHERE week_number < 25
)
INSERT INTO contract_income_details (
  income_id, client_id, invoice_number, invoice_date, service_period_start,
  service_period_end, subtotal_minor, gst_amount_minor, total_minor, due_date,
  payment_received_date, amount_received_minor, payment_status
)
SELECT printf('showcase-contract-week-%02d', week_number + 1),
  'client-harbour-digital', printf('LOCAL-2026-W%02d', week_number + 14),
  date(paid_on, '-4 days'), date(paid_on, '-7 days'), date(paid_on, '-3 days'),
  200000, 30000, 230000, paid_on, paid_on, 230000, 'PAID'
FROM weeks;

-- Six months of subscriptions, hosting and processing plus two domain renewals.
WITH months(month_start, amount, subscribers) AS (
  VALUES ('2026-04-01', 211400, 96), ('2026-05-01', 232800, 104),
    ('2026-06-01', 259300, 115), ('2026-07-01', 284750, 128),
    ('2026-08-01', 319600, 141), ('2026-09-01', 351900, 153)
)
INSERT INTO income_records (
  id, business_activity_id, income_type, received_from, transaction_date,
  total_amount_minor, currency, status, notes, created_by, created_at,
  updated_at, retention_until, purge_eligible_at
)
SELECT 'showcase-subscription-' || strftime('%Y-%m', month_start),
  'activity-saas', 'SUBSCRIPTION', 'Subscription platform',
  date(month_start, '+1 month', '-1 day'), amount, 'NZD', 'PROCESSED',
  strftime('%Y-%m', month_start) || ' subscriber summary', 'dev-owner',
  date(month_start, '+1 month') || 'T00:15:00.000Z',
  date(month_start, '+1 month') || 'T00:15:00.000Z', '2037-03-31',
  '2037-04-01'
FROM months;

WITH months(month_start, amount, subscribers) AS (
  VALUES ('2026-04-01', 211400, 96), ('2026-05-01', 232800, 104),
    ('2026-06-01', 259300, 115), ('2026-07-01', 284750, 128),
    ('2026-08-01', 319600, 141), ('2026-09-01', 351900, 153)
)
INSERT INTO subscription_income_details (
  income_id, period_start, period_end, gross_subscription_revenue_minor,
  refunds_minor, platform_fees_minor, payment_processing_fees_minor,
  net_payment_received_minor, subscriber_count, new_subscribers,
  cancelled_subscribers
)
SELECT 'showcase-subscription-' || strftime('%Y-%m', month_start), month_start,
  date(month_start, '+1 month', '-1 day'), amount + 24200, 4200, 8600,
  11400, amount, subscribers, 12 + subscribers % 7, 5 + subscribers % 4
FROM months;

WITH months(month_start, month_number) AS (
  VALUES ('2026-04-01', 0), ('2026-05-01', 1), ('2026-06-01', 2),
    ('2026-07-01', 3), ('2026-08-01', 4), ('2026-09-01', 5)
), saas_expenses AS (
  SELECT 'showcase-cloud-' || strftime('%Y-%m', month_start) AS id,
    datetime(month_start, '+1 day') AS purchased_at,
    11200 + month_number * 650 AS amount,
    'category-cloud-hosting' AS category, 'Pounamu Cloud Services' AS merchant,
    'Monthly application hosting' AS description
  FROM months
  UNION ALL
  SELECT 'showcase-processing-' || strftime('%Y-%m', month_start),
    datetime(month_start, '+1 month', '-1 hour'), 8300 + month_number * 760,
    'category-payment-processing', 'Koru Payments',
    'Monthly payment processing fees'
  FROM months
  UNION ALL
  SELECT 'showcase-domain-2026-04', '2026-04-01T01:00:00.000Z', 3200,
    'category-domain-registration', 'Aotearoa Domains',
    'Quarterly domain renewal'
  UNION ALL
  SELECT 'showcase-domain-2026-07', '2026-07-01T01:00:00.000Z', 3200,
    'category-domain-registration', 'Aotearoa Domains',
    'Quarterly domain renewal'
)
INSERT INTO expenses (
  id, business_activity_id, expense_type, expense_category_id, merchant_name,
  purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
  description, recurrence_type, status, created_by, created_at, updated_at,
  retention_until, purge_eligible_at
)
SELECT id, 'activity-saas', 'GENERAL', category, merchant, purchased_at,
  amount, 'NZD', CAST(round(amount * 3.0 / 23.0) AS INTEGER), 'GST_INCLUDED',
  description, 'RECURRING', 'PROCESSED', 'dev-owner', purchased_at,
  purchased_at, '2037-03-31', '2037-04-01'
FROM saas_expenses;

-- Populate the authoritative business/entity columns retained beside legacy
-- activity IDs during the compatibility period.
UPDATE work_sessions
SET business_id = 'business-' || business_activity_id,
    legal_entity_id = 'business-entity-primary',
    attribution_review_required = 0
WHERE id LIKE 'showcase-%';

UPDATE expenses
SET business_id = 'business-' || business_activity_id,
    legal_entity_id = 'business-entity-primary',
    attribution_review_required = 0
WHERE id LIKE 'showcase-%';

UPDATE income_records
SET business_id = 'business-' || business_activity_id,
    legal_entity_id = 'business-entity-primary',
    attribution_review_required = 0
WHERE id LIKE 'showcase-%';

UPDATE fuel_expense_details
SET business_id = (SELECT business_id FROM expenses WHERE id = expense_id),
    legal_entity_id = (SELECT legal_entity_id FROM expenses WHERE id = expense_id)
WHERE expense_id LIKE 'showcase-%';
UPDATE parking_expense_details
SET business_id = (SELECT business_id FROM expenses WHERE id = expense_id),
    legal_entity_id = (SELECT legal_entity_id FROM expenses WHERE id = expense_id)
WHERE expense_id LIKE 'showcase-%';
UPDATE insurance_expense_details
SET business_id = (SELECT business_id FROM expenses WHERE id = expense_id),
    legal_entity_id = (SELECT legal_entity_id FROM expenses WHERE id = expense_id)
WHERE expense_id LIKE 'showcase-%';
UPDATE platform_income_details
SET business_id = (SELECT business_id FROM income_records WHERE id = income_id),
    legal_entity_id = (SELECT legal_entity_id FROM income_records WHERE id = income_id)
WHERE income_id LIKE 'showcase-%';
UPDATE contract_income_details
SET business_id = (SELECT business_id FROM income_records WHERE id = income_id),
    legal_entity_id = (SELECT legal_entity_id FROM income_records WHERE id = income_id)
WHERE income_id LIKE 'showcase-%';
UPDATE subscription_income_details
SET business_id = (SELECT business_id FROM income_records WHERE id = income_id),
    legal_entity_id = (SELECT legal_entity_id FROM income_records WHERE id = income_id)
WHERE income_id LIKE 'showcase-%';

UPDATE runtime_metadata
SET value = 'local-development-showcase',
    updated_at = '2026-10-01T00:00:00.000Z'
WHERE key = 'seed_profile';
