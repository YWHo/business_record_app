import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
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

const expenseSelect = `SELECT expenses.id, expenses.business_activity_id,
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
async function retentionDate(env: Env, occurredAt: string) {
  const settings = await env.DB.prepare(
    'SELECT retention_tax_years, tax_year_end_month, tax_year_end_day FROM retention_settings WHERE singleton_id = 1',
  ).first<RetentionSettings>();
  if (!settings)
    throw new HttpError(503, 'Retention settings are unavailable.');
  return calculateRetentionDate(
    occurredAt,
    settings.retention_tax_years,
    settings.tax_year_end_month,
    settings.tax_year_end_day,
  );
}
async function parkingCategory(env: Env) {
  const row = await env.DB.prepare(
    "SELECT id FROM expense_categories WHERE system_key = 'PARKING' AND active = 1",
  ).first<{ id: string }>();
  if (!row)
    throw new HttpError(503, 'Parking expense category is unavailable.');
  return row.id;
}
async function assertReferences(
  env: Env,
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
      ? env.DB.prepare('SELECT active FROM business_activities WHERE id = ?')
          .bind(values.businessActivityId)
          .first<{ active: number }>()
      : Promise.resolve(null),
    env.DB.prepare('SELECT active FROM expense_categories WHERE id = ?')
      .bind(values.expenseCategoryId)
      .first<{ active: number }>(),
    vehicleId
      ? env.DB.prepare('SELECT active FROM vehicles WHERE id = ?')
          .bind(vehicleId)
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
  type: 'PARKING' | 'GENERAL',
  values: CommonExpenseValues,
  ownerId: string,
  now: string,
  retention: string,
) {
  return env.DB.prepare(
    `INSERT INTO expenses
    (id, business_activity_id, expense_type, expense_category_id, merchant_name,
     purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
     description, recurrence_type, status, created_by, created_at, updated_at,
     retention_until, purge_eligible_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`,
  ).bind(
    id,
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
  values: CommonExpenseValues,
  now: string,
  retention: string,
) {
  return env.DB.prepare(
    `UPDATE expenses SET business_activity_id = ?, expense_category_id = ?,
    merchant_name = ?, purchase_datetime = ?, total_amount_minor = ?, currency = ?,
    gst_amount_minor = ?, gst_status = ?, description = ?, recurrence_type = ?,
    updated_at = ?, retention_until = ?, purge_eligible_at = ? WHERE id = ?`,
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
  );
}

export async function listGeneralExpenses(request: Request, env: Env) {
  await requireUser(request, env);
  const rows = await env.DB.prepare(
    `${expenseSelect} WHERE expenses.expense_type = 'GENERAL' AND expenses.deleted_at IS NULL ORDER BY expenses.purchase_datetime DESC`,
  ).all<ExpenseRow>();
  return json({ generalExpenses: rows.results.map(serializeExpense) });
}
export async function createGeneralExpense(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const values = commonExpenseValues(await readJsonObject(request));
  await assertReferences(env, values, null);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const retention = await retentionDate(env, values.purchaseDatetime);
  await insertExpense(
    env,
    id,
    'GENERAL',
    values,
    owner.id,
    now,
    retention,
  ).run();
  await writeAudit(
    env,
    owner,
    'GENERAL_EXPENSE_CREATED',
    'EXPENSE',
    id,
    'General expense created.',
    values.businessActivityId,
  );
  const row = await env.DB.prepare(`${expenseSelect} WHERE expenses.id = ?`)
    .bind(id)
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
    `${expenseSelect} WHERE expenses.id = ? AND expenses.expense_type = 'GENERAL'`,
  )
    .bind(id)
    .first<ExpenseRow>();
  if (!row) throw new HttpError(404, 'General expense not found.');
  const values = commonExpenseValues(body, current(row));
  await assertReferences(env, values, null, row);
  const now = new Date().toISOString();
  const retention = await retentionDate(env, values.purchaseDatetime);
  await updateExpense(env, id, values, now, retention).run();
  await writeAudit(
    env,
    owner,
    'GENERAL_EXPENSE_UPDATED',
    'EXPENSE',
    id,
    'General expense updated.',
    values.businessActivityId,
  );
  const updated = await env.DB.prepare(`${expenseSelect} WHERE expenses.id = ?`)
    .bind(id)
    .first<ExpenseRow>();
  if (!updated)
    throw new HttpError(500, 'General expense could not be loaded.');
  return json({ generalExpense: serializeExpense(updated) });
}

export async function listParkingRecords(request: Request, env: Env) {
  await requireUser(request, env);
  const rows = await env.DB.prepare(
    `${parkingSelect} WHERE expenses.expense_type = 'PARKING' AND expenses.deleted_at IS NULL ORDER BY expenses.purchase_datetime DESC`,
  ).all<ParkingRow>();
  return json({ parkingRecords: rows.results.map(serializeParking) });
}
export async function createParkingRecord(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const categoryId = await parkingCategory(env);
  const provider =
    typeof body.parkingProvider === 'string' ? body.parkingProvider.trim() : '';
  const values = parkingValues(
    { merchantName: provider || 'Parking', ...body },
    categoryId,
  );
  await assertReferences(env, values, values.vehicleId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const retention = await retentionDate(env, values.purchaseDatetime);
  await env.DB.batch([
    insertExpense(env, id, 'PARKING', values, owner.id, now, retention),
    env.DB.prepare(
      `INSERT INTO parking_expense_details
      (expense_id, vehicle_id, parking_provider, parking_location, parking_start_datetime, parking_end_datetime, parking_reference)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
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
  );
  const row = await env.DB.prepare(`${parkingSelect} WHERE expenses.id = ?`)
    .bind(id)
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
    `${parkingSelect} WHERE expenses.id = ? AND expenses.expense_type = 'PARKING'`,
  )
    .bind(id)
    .first<ParkingRow>();
  if (!row) throw new HttpError(404, 'Parking expense not found.');
  const values = parkingValues(
    body,
    row.expense_category_id,
    currentParking(row),
  );
  await assertReferences(env, values, values.vehicleId, row);
  const now = new Date().toISOString();
  const retention = await retentionDate(env, values.purchaseDatetime);
  await env.DB.batch([
    updateExpense(env, id, values, now, retention),
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
  const updated = await env.DB.prepare(`${parkingSelect} WHERE expenses.id = ?`)
    .bind(id)
    .first<ParkingRow>();
  if (!updated)
    throw new HttpError(500, 'Parking expense could not be loaded.');
  return json({ parkingRecord: serializeParking(updated) });
}
