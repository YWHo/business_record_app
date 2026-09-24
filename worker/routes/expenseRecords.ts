import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import type { RouteParameters } from '../lib/router';
import { writeAudit } from '../services/auditService';
import {
  requireBusinessAccess,
  requireBusinessScopedReference,
  resolveLegalEntityForBusinessDate,
} from '../services/businessContextService';
import {
  commonExpenseValues,
  parkingDurationMinutes,
  parkingValues,
  type CommonExpenseValues,
  type ParkingValues,
} from '../services/expenseService';
import { calculateRetentionDate } from '../services/workSessionService';
import type { Env } from '../types';

interface ExpenseRow {
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
  gst_status: CommonExpenseValues['gstStatus'];
  description: string | null;
  recurrence_type: CommonExpenseValues['recurrenceType'];
  status: string;
  created_at: string;
  updated_at: string;
}
interface ParkingRow extends ExpenseRow {
  vehicle_id: string | null;
  vehicle_registration: string | null;
  parking_provider: string | null;
  parking_location: string;
  parking_start_datetime: string | null;
  parking_end_datetime: string | null;
  parking_reference: string | null;
}
interface RetentionSettings {
  retention_tax_years: number;
  tax_year_end_month: number;
  tax_year_end_day: number;
}

const expenseSelect = `SELECT expenses.id, expenses.business_id,
  expenses.legal_entity_id, expenses.business_activity_id,
  business_activities.name AS activity_name, expenses.expense_category_id,
  expense_categories.name AS category_name, expenses.merchant_name,
  expenses.purchase_datetime, expenses.total_amount_minor, expenses.currency,
  expenses.gst_amount_minor, expenses.gst_status, expenses.description,
  expenses.recurrence_type, expenses.status, expenses.created_at, expenses.updated_at
  FROM expenses
  JOIN expense_categories ON expense_categories.id = expenses.expense_category_id
  LEFT JOIN business_activities ON business_activities.id = expenses.business_activity_id`;
const parkingSelect = `${expenseSelect.replace(
  '\n  FROM expenses',
  `, parking_expense_details.vehicle_id,
  vehicles.registration AS vehicle_registration, parking_expense_details.parking_provider,
  parking_expense_details.parking_location, parking_expense_details.parking_start_datetime,
  parking_expense_details.parking_end_datetime, parking_expense_details.parking_reference
  FROM expenses`,
)}
  JOIN parking_expense_details ON parking_expense_details.expense_id = expenses.id
  LEFT JOIN vehicles ON vehicles.id = parking_expense_details.vehicle_id`;

function serializeExpense(row: ExpenseRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    legalEntityId: row.legal_entity_id,
    businessActivityId: row.business_activity_id,
    activityName: row.activity_name,
    expenseCategoryId: row.expense_category_id,
    categoryName: row.category_name,
    merchantName: row.merchant_name,
    purchaseDatetime: row.purchase_datetime,
    totalAmountMinor: row.total_amount_minor,
    currency: row.currency,
    gstAmountMinor: row.gst_amount_minor,
    gstStatus: row.gst_status,
    description: row.description,
    recurrenceType: row.recurrence_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function serializeParking(row: ParkingRow) {
  return {
    ...serializeExpense(row),
    vehicleId: row.vehicle_id,
    vehicleRegistration: row.vehicle_registration,
    parkingProvider: row.parking_provider,
    parkingLocation: row.parking_location,
    parkingStartDatetime: row.parking_start_datetime,
    parkingEndDatetime: row.parking_end_datetime,
    parkingReference: row.parking_reference,
    parkingDurationMinutes: parkingDurationMinutes(
      row.parking_start_datetime,
      row.parking_end_datetime,
    ),
  };
}
function current(row: ExpenseRow): CommonExpenseValues {
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
  };
}
function currentParking(row: ParkingRow): ParkingValues {
  return {
    ...current(row),
    vehicleId: row.vehicle_id,
    parkingProvider: row.parking_provider,
    parkingLocation: row.parking_location,
    parkingStartDatetime: row.parking_start_datetime,
    parkingEndDatetime: row.parking_end_datetime,
    parkingReference: row.parking_reference,
  };
}
async function retentionDate(
  env: Env,
  businessAccountId: string,
  occurredAt: string,
) {
  const settings = await env.DB.prepare(
    'SELECT retention_tax_years, tax_year_end_month, tax_year_end_day FROM retention_settings WHERE business_account_id = ?',
  )
    .bind(businessAccountId)
    .first<RetentionSettings>();
  if (!settings)
    throw new HttpError(503, 'Retention settings are unavailable.');
  return calculateRetentionDate(
    occurredAt,
    settings.retention_tax_years,
    settings.tax_year_end_month,
    settings.tax_year_end_day,
  );
}
async function parkingCategory(env: Env, businessAccountId: string) {
  const row = await env.DB.prepare(
    "SELECT id FROM expense_categories WHERE business_account_id = ? AND system_key = 'PARKING' AND active = 1",
  )
    .bind(businessAccountId)
    .first<{ id: string }>();
  if (!row)
    throw new HttpError(503, 'Parking expense category is unavailable.');
  return row.id;
}
async function assertReferences(
  env: Env,
  businessAccountId: string,
  values: CommonExpenseValues,
  vehicleId: string | null,
  prior?: {
    business_activity_id: string | null;
    expense_category_id: string;
    vehicle_id?: string | null;
  },
) {
  const [activity, category, vehicle] = await Promise.all([
    values.businessActivityId
      ? env.DB.prepare(
          'SELECT active FROM business_activities WHERE id = ? AND business_account_id = ?',
        )
          .bind(values.businessActivityId, businessAccountId)
          .first<{ active: number }>()
      : Promise.resolve(null),
    env.DB.prepare(
      'SELECT active FROM expense_categories WHERE id = ? AND business_account_id = ?',
    )
      .bind(values.expenseCategoryId, businessAccountId)
      .first<{ active: number }>(),
    vehicleId
      ? env.DB.prepare(
          'SELECT active FROM vehicles WHERE id = ? AND business_account_id = ?',
        )
          .bind(vehicleId, businessAccountId)
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
    !category ||
    (!category.active &&
      prior?.expense_category_id !== values.expenseCategoryId)
  )
    throw new HttpError(400, 'Select an active expense category.');
  if (
    vehicleId &&
    (!vehicle || (!vehicle.active && prior?.vehicle_id !== vehicleId))
  )
    throw new HttpError(400, 'Select an active vehicle.');
}
function insertExpense(
  env: Env,
  id: string,
  businessAccountId: string,
  type: 'PARKING' | 'GENERAL',
  values: CommonExpenseValues,
  ownerId: string,
  now: string,
  retention: string,
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    businessAccountId,
    businessId,
    legalEntityId,
    values.businessActivityId,
    type,
    values.expenseCategoryId,
    values.merchantName,
    values.purchaseDatetime,
    values.totalAmountMinor,
    values.currency,
    values.gstAmountMinor,
    values.gstStatus,
    values.description,
    values.recurrenceType,
    ownerId,
    now,
    now,
    retention,
    retention,
  );
}
function updateExpense(
  env: Env,
  id: string,
  businessAccountId: string,
  values: CommonExpenseValues,
  now: string,
  retention: string,
) {
  return env.DB.prepare(
    `UPDATE expenses SET business_activity_id = ?, expense_category_id = ?,
    merchant_name = ?, purchase_datetime = ?, total_amount_minor = ?, currency = ?,
    gst_amount_minor = ?, gst_status = ?, description = ?, recurrence_type = ?,
    status = 'NEW', reviewed_by = NULL, reviewed_at = NULL,
    updated_at = ?, retention_until = ?, purge_eligible_at = ?
    WHERE id = ? AND business_account_id = ?`,
  ).bind(
    values.businessActivityId,
    values.expenseCategoryId,
    values.merchantName,
    values.purchaseDatetime,
    values.totalAmountMinor,
    values.currency,
    values.gstAmountMinor,
    values.gstStatus,
    values.description,
    values.recurrenceType,
    now,
    retention,
    retention,
    id,
    businessAccountId,
  );
}

export async function listGeneralExpenses(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const rows = await env.DB.prepare(
    `${expenseSelect} WHERE expenses.business_account_id = ? AND expenses.expense_type = 'GENERAL' AND expenses.deleted_at IS NULL ORDER BY expenses.purchase_datetime DESC LIMIT 200`,
  )
    .bind(actor.businessAccountId)
    .all<ExpenseRow>();
  return json({ generalExpenses: rows.results.map(serializeExpense) });
}
export async function createGeneralExpense(
  request: Request,
  env: Env,
  params: RouteParameters = {},
) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const routeBusinessId = params.businessId ?? null;
  if (
    routeBusinessId &&
    body.expenseType !== undefined &&
    body.expenseType !== 'GENERAL'
  ) {
    throw new HttpError(
      400,
      'This endpoint currently creates general expenses only.',
    );
  }
  const business = routeBusinessId
    ? await resolveLegalEntityForBusinessDate(
        env.DB,
        owner,
        routeBusinessId,
        body.purchaseDatetime,
        { forWrite: true },
      )
    : null;
  if (business && !business.business.legacyBusinessActivityId) {
    throw new HttpError(
      409,
      'This business cannot yet be written through the legacy record schema.',
    );
  }
  const values = commonExpenseValues(
    business
      ? {
          ...body,
          businessActivityId: business.business.legacyBusinessActivityId,
        }
      : body,
  );
  await assertReferences(env, owner.businessAccountId, values, null);
  if (business) {
    await requireBusinessScopedReference(
      env.DB,
      owner,
      'expense_categories',
      business.business.id,
      values.expenseCategoryId,
    );
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const retention = await retentionDate(
    env,
    owner.businessAccountId,
    values.purchaseDatetime,
  );
  await insertExpense(
    env,
    id,
    owner.businessAccountId,
    'GENERAL',
    values,
    owner.id,
    now,
    retention,
    business?.business.id ?? null,
    business?.legalEntity.id ?? null,
  ).run();
  await writeAudit(
    env,
    owner,
    'GENERAL_EXPENSE_CREATED',
    'EXPENSE',
    id,
    'General expense created.',
    values.businessActivityId,
    null,
    {
      businessId: business?.business.id ?? null,
      legalEntityId: business?.legalEntity.id ?? null,
    },
  );
  const row = await env.DB.prepare(
    `${expenseSelect} WHERE expenses.id = ? AND expenses.business_account_id = ?`,
  )
    .bind(id, owner.businessAccountId)
    .first<ExpenseRow>();
  if (!row) throw new HttpError(500, 'General expense could not be loaded.');
  return json({ generalExpense: serializeExpense(row) }, { status: 201 });
}
export async function updateGeneralExpense(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    `${expenseSelect} WHERE expenses.id = ? AND expenses.business_account_id = ? AND expenses.expense_type = 'GENERAL'`,
  )
    .bind(id, owner.businessAccountId)
    .first<ExpenseRow>();
  if (!row) throw new HttpError(404, 'General expense not found.');
  const values = commonExpenseValues(body, current(row));
  await assertReferences(env, owner.businessAccountId, values, null, row);
  const now = new Date().toISOString();
  const retention = await retentionDate(
    env,
    owner.businessAccountId,
    values.purchaseDatetime,
  );
  await updateExpense(
    env,
    id,
    owner.businessAccountId,
    values,
    now,
    retention,
  ).run();
  await writeAudit(
    env,
    owner,
    'GENERAL_EXPENSE_UPDATED',
    'EXPENSE',
    id,
    'General expense updated.',
    values.businessActivityId,
  );
  const updated = await env.DB.prepare(
    `${expenseSelect} WHERE expenses.id = ? AND expenses.business_account_id = ?`,
  )
    .bind(id, owner.businessAccountId)
    .first<ExpenseRow>();
  if (!updated)
    throw new HttpError(500, 'General expense could not be loaded.');
  return json({ generalExpense: serializeExpense(updated) });
}

export async function listParkingRecords(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const rows = await env.DB.prepare(
    `${parkingSelect} WHERE expenses.business_account_id = ? AND expenses.expense_type = 'PARKING' AND expenses.deleted_at IS NULL ORDER BY expenses.purchase_datetime DESC LIMIT 200`,
  )
    .bind(actor.businessAccountId)
    .all<ParkingRow>();
  return json({ parkingRecords: rows.results.map(serializeParking) });
}
export async function createParkingRecord(
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
  const categoryId = await parkingCategory(env, owner.businessAccountId);
  const provider =
    typeof body.parkingProvider === 'string' ? body.parkingProvider.trim() : '';
  const values = parkingValues(
    {
      merchantName: provider || 'Parking',
      ...body,
      ...(business
        ? { businessActivityId: business.legacyBusinessActivityId }
        : {}),
    },
    categoryId,
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
  await assertReferences(
    env,
    owner.businessAccountId,
    values,
    values.vehicleId,
  );
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
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const retention = await retentionDate(
    env,
    owner.businessAccountId,
    values.purchaseDatetime,
  );
  await env.DB.batch([
    insertExpense(
      env,
      id,
      owner.businessAccountId,
      'PARKING',
      values,
      owner.id,
      now,
      retention,
      attribution?.business.id ?? null,
      attribution?.legalEntity.id ?? null,
    ),
    env.DB.prepare(
      `INSERT INTO parking_expense_details
      (expense_id, business_account_id, business_id, legal_entity_id,
       vehicle_id, parking_provider, parking_location, parking_start_datetime,
       parking_end_datetime, parking_reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      owner.businessAccountId,
      attribution?.business.id ?? null,
      attribution?.legalEntity.id ?? null,
      values.vehicleId,
      values.parkingProvider,
      values.parkingLocation,
      values.parkingStartDatetime,
      values.parkingEndDatetime,
      values.parkingReference,
    ),
  ]);
  await writeAudit(
    env,
    owner,
    'PARKING_EXPENSE_CREATED',
    'EXPENSE',
    id,
    'Parking expense created.',
    values.businessActivityId,
    null,
    {
      businessId: attribution?.business.id ?? null,
      legalEntityId: attribution?.legalEntity.id ?? null,
    },
  );
  const row = await env.DB.prepare(
    `${parkingSelect} WHERE expenses.id = ? AND expenses.business_account_id = ?`,
  )
    .bind(id, owner.businessAccountId)
    .first<ParkingRow>();
  if (!row) throw new HttpError(500, 'Parking expense could not be loaded.');
  return json({ parkingRecord: serializeParking(row) }, { status: 201 });
}
export async function updateParkingRecord(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    `${parkingSelect} WHERE expenses.id = ? AND expenses.business_account_id = ? AND expenses.expense_type = 'PARKING'`,
  )
    .bind(id, owner.businessAccountId)
    .first<ParkingRow>();
  if (!row) throw new HttpError(404, 'Parking expense not found.');
  const values = parkingValues(
    body,
    row.expense_category_id,
    currentParking(row),
  );
  await assertReferences(
    env,
    owner.businessAccountId,
    values,
    values.vehicleId,
    row,
  );
  const now = new Date().toISOString();
  const retention = await retentionDate(
    env,
    owner.businessAccountId,
    values.purchaseDatetime,
  );
  await env.DB.batch([
    updateExpense(env, id, owner.businessAccountId, values, now, retention),
    env.DB.prepare(
      `UPDATE parking_expense_details SET vehicle_id = ?, parking_provider = ?,
      parking_location = ?, parking_start_datetime = ?, parking_end_datetime = ?, parking_reference = ? WHERE expense_id = ?`,
    ).bind(
      values.vehicleId,
      values.parkingProvider,
      values.parkingLocation,
      values.parkingStartDatetime,
      values.parkingEndDatetime,
      values.parkingReference,
      id,
    ),
  ]);
  await writeAudit(
    env,
    owner,
    'PARKING_EXPENSE_UPDATED',
    'EXPENSE',
    id,
    'Parking expense updated.',
    values.businessActivityId,
  );
  const updated = await env.DB.prepare(
    `${parkingSelect} WHERE expenses.id = ? AND expenses.business_account_id = ?`,
  )
    .bind(id, owner.businessAccountId)
    .first<ParkingRow>();
  if (!updated)
    throw new HttpError(500, 'Parking expense could not be loaded.');
  return json({ parkingRecord: serializeParking(updated) });
}
