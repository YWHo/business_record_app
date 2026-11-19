import { requireRole, requireUser } from '../auth/authorization';
import { canAdjustInsuranceAllocation } from '../../src/lib/permissions';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import type { RouteParameters } from '../lib/router';
import {
  allocationSummary,
  allocationValues,
  type AllocationMethod,
  type AllocationValues,
} from '../services/allocationService';
import { auditStatement, writeAudit } from '../services/auditService';
import { accessBatch } from '../services/accessMutationService';
import {
  requireBusinessAccess,
  requireBusinessScopedReference,
  resolveLegalEntityForBusinessDate,
} from '../services/businessContextService';
import {
  insuranceValues,
  type InsuranceType,
  type InsuranceValues,
} from '../services/insuranceService';
import { calculateRetentionDate } from '../services/workSessionService';
import type { Env } from '../types';

interface InsuranceRow {
  id: string;
  business_id: string | null;
  legal_entity_id: string | null;
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

const select = `SELECT expenses.id, expenses.business_id,
  expenses.legal_entity_id, expenses.business_activity_id,
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
    businessId: row.business_id,
    legalEntityId: row.legal_entity_id,
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
async function categoryId(
  env: Env,
  businessAccountId: string,
  type: InsuranceType,
) {
  const key =
    type === 'VEHICLE'
      ? 'VEHICLE_INSURANCE'
      : type === 'PROFESSIONAL_LIABILITY'
        ? 'PROFESSIONAL_LIABILITY_INSURANCE'
        : 'GENERAL';
  const row = await env.DB.prepare(
    'SELECT id FROM expense_categories WHERE business_account_id = ? AND system_key = ? AND active = 1',
  )
    .bind(businessAccountId, key)
    .first<{ id: string }>();
  if (!row) {
    throw new HttpError(503, 'Insurance expense category is unavailable.');
  }
  return row.id;
}
async function retention(
  env: Env,
  businessAccountId: string,
  occurredAt: string,
) {
  const row = await env.DB.prepare(
    'SELECT retention_tax_years, tax_year_end_month, tax_year_end_day FROM retention_settings WHERE business_account_id = ?',
  )
    .bind(businessAccountId)
    .first<Settings>();
  if (!row) {
    throw new HttpError(503, 'Retention settings are unavailable.');
  }
  return calculateRetentionDate(
    occurredAt,
    row.retention_tax_years,
    row.tax_year_end_month,
    row.tax_year_end_day,
  );
}
async function assertReferences(
  env: Env,
  businessAccountId: string,
  values: InsuranceValues,
  prior?: InsuranceRow,
) {
  const [activity, vehicle] = await Promise.all([
    values.businessActivityId
      ? env.DB.prepare(
          'SELECT active FROM business_activities WHERE id = ? AND business_account_id = ?',
        )
          .bind(values.businessActivityId, businessAccountId)
          .first<{ active: number }>()
      : Promise.resolve(null),
    values.vehicleId
      ? env.DB.prepare(
          'SELECT active FROM vehicles WHERE id = ? AND business_account_id = ?',
        )
          .bind(values.vehicleId, businessAccountId)
          .first<{ active: number }>()
      : Promise.resolve(null),
  ]);
  if (
    values.businessActivityId &&
    (!activity ||
      (!activity.active &&
        prior?.business_activity_id !== values.businessActivityId))
  ) {
    throw new HttpError(400, 'Select an active business activity.');
  }
  if (
    values.vehicleId &&
    (!vehicle || (!vehicle.active && prior?.vehicle_id !== values.vehicleId))
  ) {
    throw new HttpError(400, 'Select an active vehicle.');
  }
}
function expenseInsert(
  env: Env,
  id: string,
  businessAccountId: string,
  values: InsuranceValues,
  creator: string,
  now: string,
  until: string,
  businessId: string | null = null,
  legalEntityId: string | null = null,
) {
  return env.DB.prepare(
    `INSERT INTO expenses
    (id, business_account_id, business_id, legal_entity_id,
     business_activity_id, expense_type, expense_category_id, merchant_name,
     purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
     description, recurrence_type, status, created_by, created_at, updated_at,
     retention_until, purge_eligible_at)
    VALUES (?, ?, ?, ?, ?, 'INSURANCE', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    businessAccountId,
    businessId,
    legalEntityId,
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
  businessAccountId: string,
  expenseId: string,
  activityId: string | null,
  values: AllocationValues,
  reviewer: string | null,
  now: string,
  businessId: string | null = null,
  legalEntityId: string | null = null,
) {
  return env.DB.prepare(
    `INSERT INTO expense_allocations
    (id, business_account_id, business_id, legal_entity_id,
     expense_id, business_activity_id, allocation_method, percentage_basis_points,
     allocated_amount_minor, calculation_period_start, calculation_period_end, notes,
     reviewed_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    businessAccountId,
    businessId,
    legalEntityId,
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
  const actor = await requireUser(request, env);
  const rows = await env.DB.prepare(
    `${select} WHERE expenses.business_account_id = ? AND expenses.expense_type = 'INSURANCE' AND expenses.deleted_at IS NULL ORDER BY expenses.purchase_datetime DESC LIMIT 200`,
  )
    .bind(actor.businessAccountId)
    .all<InsuranceRow>();
  return json({ insuranceRecords: rows.results.map(serialize) });
}
export async function createInsuranceRecord(
  request: Request,
  env: Env,
  params: RouteParameters = {},
) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const routeBusinessId = params.businessId ?? null;
  const business = routeBusinessId
    ? await requireBusinessAccess(env.DB, owner, routeBusinessId, {
        forWrite: true,
      })
    : null;
  if (business && !business.legacyBusinessActivityId) {
    throw new HttpError(
      409,
      'This business cannot yet be written through the legacy record schema.',
    );
  }
  const rawType = body.insuranceType;
  if (
    typeof rawType !== 'string' ||
    !['PROFESSIONAL_LIABILITY', 'VEHICLE', 'OTHER'].includes(rawType)
  ) {
    throw new HttpError(400, 'Insurance type is invalid.');
  }
  if (body.allocationMethod === 'ACCOUNTANT_ADJUSTMENT') {
    throw new HttpError(
      400,
      'Accountant adjustments must use the review endpoint.',
    );
  }
  const values = insuranceValues(
    business
      ? { ...body, businessActivityId: business.legacyBusinessActivityId }
      : body,
    await categoryId(env, owner.businessAccountId, rawType as InsuranceType),
  );
  const attribution = business
    ? await resolveLegalEntityForBusinessDate(
        env.DB,
        owner,
        business.id,
        values.purchaseDatetime,
        { forWrite: true },
      )
    : null;
  await assertReferences(env, owner.businessAccountId, values);
  if (business) {
    await requireBusinessScopedReference(
      env.DB,
      owner,
      'expense_categories',
      business.id,
      values.expenseCategoryId,
    );
    if (values.vehicleId) {
      await requireBusinessScopedReference(
        env.DB,
        owner,
        'vehicles',
        business.id,
        values.vehicleId,
      );
    }
  }
  const allocation = allocationValues(body, values.totalAmountMinor);
  const id = crypto.randomUUID();
  const allocationId = crypto.randomUUID();
  const now = new Date().toISOString();
  const until = await retention(
    env,
    owner.businessAccountId,
    values.purchaseDatetime,
  );
  await env.DB.batch([
    expenseInsert(
      env,
      id,
      owner.businessAccountId,
      values,
      owner.id,
      now,
      until,
      attribution?.business.id ?? null,
      attribution?.legalEntity.id ?? null,
    ),
    env.DB.prepare(
      `INSERT INTO insurance_expense_details
      (expense_id, business_account_id, business_id, legal_entity_id,
       insurance_type, provider, policy_number, policy_period_start,
       policy_period_end, vehicle_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      owner.businessAccountId,
      attribution?.business.id ?? null,
      attribution?.legalEntity.id ?? null,
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
      owner.businessAccountId,
      id,
      values.businessActivityId,
      allocation,
      null,
      now,
      attribution?.business.id ?? null,
      attribution?.legalEntity.id ?? null,
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
    null,
    {
      businessId: attribution?.business.id ?? null,
      legalEntityId: attribution?.legalEntity.id ?? null,
    },
  );
  const row = await env.DB.prepare(
    `${select} WHERE expenses.id = ? AND expenses.business_account_id = ?`,
  )
    .bind(id, owner.businessAccountId)
    .first<InsuranceRow>();
  if (!row) {
    throw new HttpError(500, 'Insurance expense could not be loaded.');
  }
  return json({ insuranceRecord: serialize(row) }, { status: 201 });
}
export async function updateInsuranceRecord(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    `${select} WHERE expenses.id = ? AND expenses.business_account_id = ? AND expenses.expense_type = 'INSURANCE'`,
  )
    .bind(id, owner.businessAccountId)
    .first<InsuranceRow>();
  if (!row) {
    throw new HttpError(404, 'Insurance expense not found.');
  }
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
    await categoryId(env, owner.businessAccountId, nextType),
    current(row),
  );
  await assertReferences(env, owner.businessAccountId, values, row);
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
  const until = await retention(
    env,
    owner.businessAccountId,
    values.purchaseDatetime,
  );
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE expenses SET business_activity_id = ?, expense_category_id = ?, merchant_name = ?, purchase_datetime = ?, total_amount_minor = ?, currency = ?, gst_amount_minor = ?, gst_status = ?, description = ?, recurrence_type = ?, status = 'NEW', reviewed_by = NULL, reviewed_at = NULL, updated_at = ?, retention_until = ?, purge_eligible_at = ? WHERE id = ? AND business_account_id = ?`,
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
      owner.businessAccountId,
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
      `UPDATE expense_allocations SET business_activity_id = ?, allocation_method = ?, percentage_basis_points = ?, allocated_amount_minor = ?, calculation_period_start = ?, calculation_period_end = ?, notes = ?, reviewed_by = ?, updated_at = ? WHERE id = ? AND business_account_id = ?`,
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
      owner.businessAccountId,
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
  const updated = await env.DB.prepare(
    `${select} WHERE expenses.id = ? AND expenses.business_account_id = ?`,
  )
    .bind(id, owner.businessAccountId)
    .first<InsuranceRow>();
  if (!updated) {
    throw new HttpError(500, 'Insurance expense could not be loaded.');
  }
  return json({ insuranceRecord: serialize(updated) });
}

export async function adjustInsuranceAllocation(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  if (!canAdjustInsuranceAllocation(actor)) {
    throw new HttpError(
      403,
      'Only accountants can record attributed allocation adjustments.',
    );
  }
  const body = await readJsonObject(request);
  const expenseId = getRequiredString(body, 'expenseId');
  const row = await env.DB.prepare(
    `${select} WHERE expenses.id = ? AND expenses.business_account_id = ? AND expenses.expense_type = 'INSURANCE' AND expenses.deleted_at IS NULL AND expenses.purged_at IS NULL`,
  )
    .bind(expenseId, actor.businessAccountId)
    .first<InsuranceRow>();
  if (!row) {
    throw new HttpError(404, 'Insurance allocation not found.');
  }
  const allocation = allocationValues(body, row.total_amount_minor, true);
  if (!allocation.notes) {
    throw new HttpError(400, 'Adjustment notes are required.');
  }
  const previous: AllocationValues = {
    allocationMethod: row.allocation_method ?? 'UNDETERMINED',
    percentageBasisPoints: row.percentage_basis_points,
    allocatedAmountMinor: row.allocated_amount_minor,
    calculationPeriodStart: row.calculation_period_start,
    calculationPeriodEnd: row.calculation_period_end,
    notes: row.allocation_notes,
  };
  const now = new Date().toISOString();
  const allocationId = row.allocation_id ?? crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  if (!row.allocation_id) {
    statements.push(
      allocationStatement(
        env,
        allocationId,
        actor.businessAccountId,
        expenseId,
        row.business_activity_id,
        allocation,
        actor.id,
        now,
        row.business_id,
        row.legal_entity_id,
      ),
    );
  } else {
    statements.push(
      env.DB.prepare(
        "UPDATE expense_allocations SET allocation_method='ACCOUNTANT_ADJUSTMENT',percentage_basis_points=?,allocated_amount_minor=?,calculation_period_start=?,calculation_period_end=?,notes=?,reviewed_by=?,updated_at=? WHERE id=? AND business_account_id=?",
      ).bind(
        allocation.percentageBasisPoints,
        allocation.allocatedAmountMinor,
        allocation.calculationPeriodStart,
        allocation.calculationPeriodEnd,
        allocation.notes,
        actor.id,
        now,
        allocationId,
        actor.businessAccountId,
      ),
    );
  }
  statements.push(
    auditStatement(
      env,
      actor,
      'INSURANCE_ALLOCATION_ADJUSTED',
      'EXPENSE',
      expenseId,
      `Allocation changed from ${allocationSummary(previous)} to ${allocationSummary(allocation)}.`,
      row.business_activity_id,
      { before: previous, after: allocation },
      { businessId: row.business_id, legalEntityId: row.legal_entity_id },
    ),
  );
  // D1 rolls back the full batch if the actor, source or allocation changed after this request read them.
  await accessBatch(
    env,
    actor.businessAccountId,
    `EXISTS (SELECT 1 FROM business_account_members m JOIN users u ON u.id=m.user_id JOIN business_accounts a ON a.id=m.business_account_id
      WHERE m.user_id=? AND m.business_account_id=? AND m.role='ACCOUNTANT' AND m.status='ACTIVE' AND u.status='ACTIVE' AND a.status='ACTIVE'
      AND (m.access_starts_at IS NULL OR m.access_starts_at<=?) AND (m.access_expires_at IS NULL OR m.access_expires_at>?))
    AND EXISTS (SELECT 1 FROM membership_access_scopes WHERE user_id=? AND business_account_id=? AND scope_type='ACCOUNT' AND date_from IS NULL AND date_to IS NULL)
    AND EXISTS (SELECT 1 FROM expenses WHERE id=? AND business_account_id=? AND total_amount_minor=? AND updated_at IS ? AND deleted_at IS NULL AND purged_at IS NULL)
    AND (SELECT COUNT(*) FROM expense_allocations WHERE expense_id=? AND business_account_id=?)=?
    AND (? IS NULL OR EXISTS (SELECT 1 FROM expense_allocations WHERE id=? AND business_account_id=? AND allocation_method IS ? AND percentage_basis_points IS ? AND allocated_amount_minor IS ? AND calculation_period_start IS ? AND calculation_period_end IS ? AND notes IS ? AND reviewed_by IS ?))`,
    [
      actor.id,
      actor.businessAccountId,
      now,
      now,
      actor.id,
      actor.businessAccountId,
      expenseId,
      actor.businessAccountId,
      row.total_amount_minor,
      row.updated_at,
      expenseId,
      actor.businessAccountId,
      row.allocation_id ? 1 : 0,
      row.allocation_id,
      row.allocation_id,
      actor.businessAccountId,
      row.allocation_method,
      row.percentage_basis_points,
      row.allocated_amount_minor,
      row.calculation_period_start,
      row.calculation_period_end,
      row.allocation_notes,
      row.reviewed_by,
    ],
    statements,
  );
  const updated = await env.DB.prepare(
    `${select} WHERE expenses.id = ? AND expenses.business_account_id = ?`,
  )
    .bind(expenseId, actor.businessAccountId)
    .first<InsuranceRow>();
  if (!updated) {
    throw new HttpError(500, 'Insurance expense could not be loaded.');
  }
  return json({ insuranceRecord: serialize(updated) });
}
