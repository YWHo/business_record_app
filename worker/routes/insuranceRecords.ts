import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import {
  allocationSummary,
  allocationValues,
  type AllocationMethod,
  type AllocationValues,
} from '../services/allocationService';
import { writeAudit } from '../services/auditService';
import {
  insuranceValues,
  type InsuranceType,
  type InsuranceValues,
} from '../services/insuranceService';
import { calculateRetentionDate } from '../services/workSessionService';
import type { Env } from '../types';

interface InsuranceRow {
  id: string;
  business_activity_id: string | null;
  activity_name: string | null;
  expense_category_id: string;
  category_name: string;
  merchant_name: string;
  purchase_datetime: string;
  total_amount_minor: number;
  currency: string;
  gst_amount_minor: number | null;
  gst_status: InsuranceValues['gstStatus'];
  description: string | null;
  recurrence_type: InsuranceValues['recurrenceType'];
  status: string;
  created_at: string;
  updated_at: string;
  insurance_type: InsuranceType;
  provider: string;
  policy_number: string | null;
  policy_period_start: string;
  policy_period_end: string;
  vehicle_id: string | null;
  vehicle_registration: string | null;
  allocation_id: string | null;
  allocation_method: AllocationMethod | null;
  percentage_basis_points: number | null;
  allocated_amount_minor: number | null;
  calculation_period_start: string | null;
  calculation_period_end: string | null;
  allocation_notes: string | null;
  reviewed_by: string | null;
  reviewer_email: string | null;
}
interface Settings {
  retention_tax_years: number;
  tax_year_end_month: number;
  tax_year_end_day: number;
}

const select = `SELECT expenses.id, expenses.business_activity_id,
  business_activities.name AS activity_name, expenses.expense_category_id,
  expense_categories.name AS category_name, expenses.merchant_name,
  expenses.purchase_datetime, expenses.total_amount_minor, expenses.currency,
  expenses.gst_amount_minor, expenses.gst_status, expenses.description,
  expenses.recurrence_type, expenses.status, expenses.created_at, expenses.updated_at,
  insurance_expense_details.insurance_type, insurance_expense_details.provider,
  insurance_expense_details.policy_number, insurance_expense_details.policy_period_start,
  insurance_expense_details.policy_period_end, insurance_expense_details.vehicle_id,
  vehicles.registration AS vehicle_registration, expense_allocations.id AS allocation_id,
  expense_allocations.allocation_method, expense_allocations.percentage_basis_points,
  expense_allocations.allocated_amount_minor, expense_allocations.calculation_period_start,
  expense_allocations.calculation_period_end, expense_allocations.notes AS allocation_notes,
  expense_allocations.reviewed_by, reviewers.email AS reviewer_email
  FROM expenses
  JOIN insurance_expense_details ON insurance_expense_details.expense_id = expenses.id
  JOIN expense_categories ON expense_categories.id = expenses.expense_category_id
  LEFT JOIN business_activities ON business_activities.id = expenses.business_activity_id
  LEFT JOIN vehicles ON vehicles.id = insurance_expense_details.vehicle_id
  LEFT JOIN expense_allocations ON expense_allocations.expense_id = expenses.id
  LEFT JOIN users AS reviewers ON reviewers.id = expense_allocations.reviewed_by`;

function serialize(row: InsuranceRow) {
  return {
    id: row.id,
    businessActivityId: row.business_activity_id,
    activityName: row.activity_name,
    expenseCategoryId: row.expense_category_id,
    categoryName: row.category_name,
    provider: row.provider,
    purchaseDatetime: row.purchase_datetime,
    premiumMinor: row.total_amount_minor,
    currency: row.currency,
    gstAmountMinor: row.gst_amount_minor,
    gstStatus: row.gst_status,
    description: row.description,
    recurrenceType: row.recurrence_type,
    status: row.status,
    insuranceType: row.insurance_type,
    policyNumber: row.policy_number,
    policyPeriodStart: row.policy_period_start,
    policyPeriodEnd: row.policy_period_end,
    vehicleId: row.vehicle_id,
    vehicleRegistration: row.vehicle_registration,
    allocation: row.allocation_id
      ? {
          id: row.allocation_id,
          method: row.allocation_method,
          percentageBasisPoints: row.percentage_basis_points,
          allocatedAmountMinor: row.allocated_amount_minor,
          calculationPeriodStart: row.calculation_period_start,
          calculationPeriodEnd: row.calculation_period_end,
          notes: row.allocation_notes,
          reviewedBy: row.reviewed_by,
          reviewerEmail: row.reviewer_email,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function current(row: InsuranceRow): InsuranceValues {
  return {
    businessActivityId: row.business_activity_id,
    expenseCategoryId: row.expense_category_id,
    merchantName: row.merchant_name,
    purchaseDatetime: row.purchase_datetime,
    totalAmountMinor: row.total_amount_minor,
    currency: row.currency,
    gstAmountMinor: row.gst_amount_minor,
    gstStatus: row.gst_status,
    description: row.description,
    recurrenceType: row.recurrence_type,
    insuranceType: row.insurance_type,
    provider: row.provider,
    policyNumber: row.policy_number,
    policyPeriodStart: row.policy_period_start,
    policyPeriodEnd: row.policy_period_end,
    vehicleId: row.vehicle_id,
  };
}
function currentAllocationInput(row: InsuranceRow): Record<string, unknown> {
  return {
    allocationMethod: row.allocation_method ?? 'UNDETERMINED',
    allocationPercentage:
      row.percentage_basis_points === null
        ? null
        : row.percentage_basis_points / 100,
    allocatedAmount:
      row.allocated_amount_minor === null
        ? null
        : (row.allocated_amount_minor / 100).toFixed(2),
    calculationPeriodStart: row.calculation_period_start,
    calculationPeriodEnd: row.calculation_period_end,
    allocationNotes: row.allocation_notes,
  };
}
async function categoryId(env: Env, type: InsuranceType) {
  const key =
    type === 'VEHICLE'
      ? 'VEHICLE_INSURANCE'
      : type === 'PROFESSIONAL_LIABILITY'
        ? 'PROFESSIONAL_LIABILITY_INSURANCE'
        : 'GENERAL';
  const row = await env.DB.prepare(
    'SELECT id FROM expense_categories WHERE system_key = ? AND active = 1',
  )
    .bind(key)
    .first<{ id: string }>();
  if (!row)
    throw new HttpError(503, 'Insurance expense category is unavailable.');
  return row.id;
}
async function retention(env: Env, occurredAt: string) {
  const row = await env.DB.prepare(
    'SELECT retention_tax_years, tax_year_end_month, tax_year_end_day FROM retention_settings WHERE singleton_id = 1',
  ).first<Settings>();
  if (!row) throw new HttpError(503, 'Retention settings are unavailable.');
  return calculateRetentionDate(
    occurredAt,
    row.retention_tax_years,
    row.tax_year_end_month,
    row.tax_year_end_day,
  );
}
async function assertReferences(
  env: Env,
  values: InsuranceValues,
  prior?: InsuranceRow,
) {
  const [activity, vehicle] = await Promise.all([
    values.businessActivityId
      ? env.DB.prepare('SELECT active FROM business_activities WHERE id = ?')
          .bind(values.businessActivityId)
          .first<{ active: number }>()
      : Promise.resolve(null),
    values.vehicleId
      ? env.DB.prepare('SELECT active FROM vehicles WHERE id = ?')
          .bind(values.vehicleId)
          .first<{ active: number }>()
      : Promise.resolve(null),
  ]);
  if (
    values.businessActivityId &&
    (!activity ||
      (!activity.active &&
        prior?.business_activity_id !== values.businessActivityId))
  )
    throw new HttpError(400, 'Select an active business activity.');
  if (
    values.vehicleId &&
    (!vehicle || (!vehicle.active && prior?.vehicle_id !== values.vehicleId))
  )
    throw new HttpError(400, 'Select an active vehicle.');
}
function expenseInsert(
  env: Env,
  id: string,
  values: InsuranceValues,
  creator: string,
  now: string,
  until: string,
) {
  return env.DB.prepare(
    `INSERT INTO expenses
    (id, business_activity_id, expense_type, expense_category_id, merchant_name,
     purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
     description, recurrence_type, status, created_by, created_at, updated_at,
     retention_until, purge_eligible_at)
    VALUES (?, ?, 'INSURANCE', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    values.businessActivityId,
    values.expenseCategoryId,
    values.provider,
    values.purchaseDatetime,
    values.totalAmountMinor,
    values.currency,
    values.gstAmountMinor,
    values.gstStatus,
    values.description,
    values.recurrenceType,
    creator,
    now,
    now,
    until,
    until,
  );
}
function allocationStatement(
  env: Env,
  id: string,
  expenseId: string,
  activityId: string | null,
  values: AllocationValues,
  reviewer: string | null,
  now: string,
) {
  return env.DB.prepare(
    `INSERT INTO expense_allocations
    (id, expense_id, business_activity_id, allocation_method, percentage_basis_points,
     allocated_amount_minor, calculation_period_start, calculation_period_end, notes,
     reviewed_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    expenseId,
    activityId,
    values.allocationMethod,
    values.percentageBasisPoints,
    values.allocatedAmountMinor,
    values.calculationPeriodStart,
    values.calculationPeriodEnd,
    values.notes,
    reviewer,
    now,
    now,
  );
}

export async function listInsuranceRecords(request: Request, env: Env) {
  await requireUser(request, env);
  const rows = await env.DB.prepare(
    `${select} WHERE expenses.expense_type = 'INSURANCE' AND expenses.deleted_at IS NULL ORDER BY expenses.purchase_datetime DESC`,
  ).all<InsuranceRow>();
  return json({ insuranceRecords: rows.results.map(serialize) });
}
export async function createInsuranceRecord(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const rawType = body.insuranceType;
  if (
    typeof rawType !== 'string' ||
    !['PROFESSIONAL_LIABILITY', 'VEHICLE', 'OTHER'].includes(rawType)
  )
    throw new HttpError(400, 'Insurance type is invalid.');
  if (body.allocationMethod === 'ACCOUNTANT_ADJUSTMENT') {
    throw new HttpError(
      400,
      'Accountant adjustments must use the review endpoint.',
    );
  }
  const values = insuranceValues(
    body,
    await categoryId(env, rawType as InsuranceType),
  );
  await assertReferences(env, values);
  const allocation = allocationValues(body, values.totalAmountMinor);
  const id = crypto.randomUUID();
  const allocationId = crypto.randomUUID();
  const now = new Date().toISOString();
  const until = await retention(env, values.purchaseDatetime);
  await env.DB.batch([
    expenseInsert(env, id, values, owner.id, now, until),
    env.DB.prepare(
      `INSERT INTO insurance_expense_details
      (expense_id, insurance_type, provider, policy_number, policy_period_start, policy_period_end, vehicle_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      values.insuranceType,
      values.provider,
      values.policyNumber,
      values.policyPeriodStart,
      values.policyPeriodEnd,
      values.vehicleId,
    ),
    allocationStatement(
      env,
      allocationId,
      id,
      values.businessActivityId,
      allocation,
      null,
      now,
    ),
  ]);
  await writeAudit(
    env,
    owner,
    'INSURANCE_EXPENSE_CREATED',
    'EXPENSE',
    id,
    `Insurance created with allocation: ${allocationSummary(allocation)}.`,
    values.businessActivityId,
  );
  const row = await env.DB.prepare(`${select} WHERE expenses.id = ?`)
    .bind(id)
    .first<InsuranceRow>();
  if (!row) throw new HttpError(500, 'Insurance expense could not be loaded.');
  return json({ insuranceRecord: serialize(row) }, { status: 201 });
}
export async function updateInsuranceRecord(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    `${select} WHERE expenses.id = ? AND expenses.expense_type = 'INSURANCE'`,
  )
    .bind(id)
    .first<InsuranceRow>();
  if (!row) throw new HttpError(404, 'Insurance expense not found.');
  const nextType =
    typeof body.insuranceType === 'string'
      ? (body.insuranceType as InsuranceType)
      : row.insurance_type;
  if (
    body.allocationMethod === 'ACCOUNTANT_ADJUSTMENT' &&
    row.allocation_method !== 'ACCOUNTANT_ADJUSTMENT'
  ) {
    throw new HttpError(
      400,
      'Accountant adjustments must use the review endpoint.',
    );
  }
  const values = insuranceValues(
    body,
    await categoryId(env, nextType),
    current(row),
  );
  await assertReferences(env, values, row);
  const allocationInput = Object.hasOwn(body, 'allocationMethod')
    ? body
    : currentAllocationInput(row);
  const allocationReviewer =
    row.allocation_method === 'ACCOUNTANT_ADJUSTMENT' &&
    body.allocationMethod === 'ACCOUNTANT_ADJUSTMENT'
      ? row.reviewed_by
      : Object.hasOwn(body, 'allocationMethod')
        ? null
        : row.reviewed_by;
  const allocation = allocationValues(allocationInput, values.totalAmountMinor);
  const oldSummary = allocationSummary(
    allocationValues(
      currentAllocationInput(row),
      row.total_amount_minor,
      row.allocation_method === 'ACCOUNTANT_ADJUSTMENT',
    ),
  );
  const now = new Date().toISOString();
  const until = await retention(env, values.purchaseDatetime);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE expenses SET business_activity_id = ?, expense_category_id = ?, merchant_name = ?, purchase_datetime = ?, total_amount_minor = ?, currency = ?, gst_amount_minor = ?, gst_status = ?, description = ?, recurrence_type = ?, status = 'NEW', reviewed_by = NULL, reviewed_at = NULL, updated_at = ?, retention_until = ?, purge_eligible_at = ? WHERE id = ?`,
    ).bind(
      values.businessActivityId,
      values.expenseCategoryId,
      values.provider,
      values.purchaseDatetime,
      values.totalAmountMinor,
      values.currency,
      values.gstAmountMinor,
      values.gstStatus,
      values.description,
      values.recurrenceType,
      now,
      until,
      until,
      id,
    ),
    env.DB.prepare(
      `UPDATE insurance_expense_details SET insurance_type = ?, provider = ?, policy_number = ?, policy_period_start = ?, policy_period_end = ?, vehicle_id = ? WHERE expense_id = ?`,
    ).bind(
      values.insuranceType,
      values.provider,
      values.policyNumber,
      values.policyPeriodStart,
      values.policyPeriodEnd,
      values.vehicleId,
      id,
    ),
    env.DB.prepare(
      `UPDATE expense_allocations SET business_activity_id = ?, allocation_method = ?, percentage_basis_points = ?, allocated_amount_minor = ?, calculation_period_start = ?, calculation_period_end = ?, notes = ?, reviewed_by = ?, updated_at = ? WHERE id = ?`,
    ).bind(
      values.businessActivityId,
      allocation.allocationMethod,
      allocation.percentageBasisPoints,
      allocation.allocatedAmountMinor,
      allocation.calculationPeriodStart,
      allocation.calculationPeriodEnd,
      allocation.notes,
      allocationReviewer,
      now,
      row.allocation_id,
    ),
  ]);
  await writeAudit(
    env,
    owner,
    'INSURANCE_EXPENSE_UPDATED',
    'EXPENSE',
    id,
    `Insurance allocation changed from ${oldSummary} to ${allocationSummary(allocation)}.`,
    values.businessActivityId,
  );
  const updated = await env.DB.prepare(`${select} WHERE expenses.id = ?`)
    .bind(id)
    .first<InsuranceRow>();
  if (!updated)
    throw new HttpError(500, 'Insurance expense could not be loaded.');
  return json({ insuranceRecord: serialize(updated) });
}

export async function adjustInsuranceAllocation(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  requireRole(actor, ['ACCOUNTANT']);
  const body = await readJsonObject(request);
  const expenseId = getRequiredString(body, 'expenseId');
  const row = await env.DB.prepare(
    `${select} WHERE expenses.id = ? AND expenses.expense_type = 'INSURANCE'`,
  )
    .bind(expenseId)
    .first<InsuranceRow>();
  if (!row || !row.allocation_id)
    throw new HttpError(404, 'Insurance allocation not found.');
  const allocation = allocationValues(body, row.total_amount_minor, true);
  if (!allocation.notes) {
    throw new HttpError(400, 'Adjustment notes are required.');
  }
  const previous: AllocationValues = {
    allocationMethod: row.allocation_method!,
    percentageBasisPoints: row.percentage_basis_points,
    allocatedAmountMinor: row.allocated_amount_minor,
    calculationPeriodStart: row.calculation_period_start,
    calculationPeriodEnd: row.calculation_period_end,
    notes: row.allocation_notes,
  };
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE expense_allocations SET allocation_method = 'ACCOUNTANT_ADJUSTMENT', percentage_basis_points = ?, allocated_amount_minor = ?, calculation_period_start = ?, calculation_period_end = ?, notes = ?, reviewed_by = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      allocation.percentageBasisPoints,
      allocation.allocatedAmountMinor,
      allocation.calculationPeriodStart,
      allocation.calculationPeriodEnd,
      allocation.notes,
      actor.id,
      now,
      row.allocation_id,
    )
    .run();
  await writeAudit(
    env,
    actor,
    'INSURANCE_ALLOCATION_ADJUSTED',
    'EXPENSE',
    expenseId,
    `Allocation changed from ${allocationSummary(previous)} to ${allocationSummary(allocation)}.`,
    row.business_activity_id,
  );
  const updated = await env.DB.prepare(`${select} WHERE expenses.id = ?`)
    .bind(expenseId)
    .first<InsuranceRow>();
  if (!updated)
    throw new HttpError(500, 'Insurance expense could not be loaded.');
  return json({ insuranceRecord: serialize(updated) });
}
