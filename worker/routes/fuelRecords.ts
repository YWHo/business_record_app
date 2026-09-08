import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
import {
  confirmedWarningCodes,
  fuelValues,
  fuelWarnings,
  type FuelValues,
} from '../services/fuelService';
import { calculateRetentionDate } from '../services/workSessionService';
import type { Env } from '../types';

interface FuelRow {
  id: string;
  business_activity_id: string | null;
  activity_name: string | null;
  vehicle_id: string;
  vehicle_registration: string;
  merchant_name: string;
  purchase_datetime: string;
  total_amount_minor: number;
  currency: string;
  gst_amount_minor: number | null;
  gst_status: FuelValues['gstStatus'];
  description: string | null;
  recurrence_type: FuelValues['recurrenceType'];
  fuel_station: string | null;
  fuel_price_micros_per_litre: number | null;
  fuel_litres: number | null;
  odometer_km: number | null;
  fill_type: FuelValues['fillType'];
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface RetentionSettings {
  retention_tax_years: number;
  tax_year_end_month: number;
  tax_year_end_day: number;
}

const fuelSelect = `SELECT expenses.id, expenses.business_activity_id,
  business_activities.name AS activity_name, fuel_expense_details.vehicle_id,
  vehicles.registration AS vehicle_registration, expenses.merchant_name,
  expenses.purchase_datetime, expenses.total_amount_minor, expenses.currency,
  expenses.gst_amount_minor, expenses.gst_status, expenses.description,
  expenses.recurrence_type,
  fuel_expense_details.fuel_station,
  fuel_expense_details.fuel_price_micros_per_litre,
  fuel_expense_details.fuel_litres, fuel_expense_details.odometer_km,
  fuel_expense_details.fill_type, fuel_expense_details.notes, expenses.status,
  expenses.created_at, expenses.updated_at
  FROM expenses
  JOIN fuel_expense_details ON fuel_expense_details.expense_id = expenses.id
  JOIN vehicles ON vehicles.id = fuel_expense_details.vehicle_id
  LEFT JOIN business_activities ON business_activities.id = expenses.business_activity_id
  WHERE expenses.expense_type = 'FUEL' AND expenses.deleted_at IS NULL`;

function serialize(row: FuelRow) {
  return {
    id: row.id,
    businessActivityId: row.business_activity_id,
    activityName: row.activity_name,
    vehicleId: row.vehicle_id,
    vehicleRegistration: row.vehicle_registration,
    merchantName: row.merchant_name,
    purchaseDatetime: row.purchase_datetime,
    totalAmountMinor: row.total_amount_minor,
    currency: row.currency,
    gstAmountMinor: row.gst_amount_minor,
    gstStatus: row.gst_status,
    description: row.description,
    recurrenceType: row.recurrence_type,
    fuelStation: row.fuel_station,
    fuelPriceMicrosPerLitre: row.fuel_price_micros_per_litre,
    fuelLitres: row.fuel_litres,
    odometerKm: row.odometer_km,
    fillType: row.fill_type,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function currentValues(row: FuelRow): FuelValues {
  return {
    businessActivityId: row.business_activity_id,
    vehicleId: row.vehicle_id,
    merchantName: row.merchant_name,
    purchaseDatetime: row.purchase_datetime,
    totalAmountMinor: row.total_amount_minor,
    currency: row.currency,
    gstAmountMinor: row.gst_amount_minor,
    gstStatus: row.gst_status,
    description: row.description,
    recurrenceType: row.recurrence_type,
    fuelStation: row.fuel_station,
    fuelPriceMicrosPerLitre: row.fuel_price_micros_per_litre,
    fuelLitres: row.fuel_litres,
    odometerKm: row.odometer_km,
    fillType: row.fill_type,
    notes: row.notes,
  };
}

async function assertReferences(
  env: Env,
  values: FuelValues,
  current?: FuelRow,
) {
  const [activity, vehicle] = await Promise.all([
    values.businessActivityId
      ? env.DB.prepare('SELECT active FROM business_activities WHERE id = ?')
          .bind(values.businessActivityId)
          .first<{ active: number }>()
      : Promise.resolve(null),
    env.DB.prepare('SELECT active FROM vehicles WHERE id = ?')
      .bind(values.vehicleId)
      .first<{ active: number }>(),
  ]);
  if (
    values.businessActivityId &&
    (!activity ||
      (!activity.active &&
        current?.business_activity_id !== values.businessActivityId))
  ) {
    throw new HttpError(400, 'Select an active business activity.');
  }
  if (
    !vehicle ||
    (!vehicle.active && current?.vehicle_id !== values.vehicleId)
  ) {
    throw new HttpError(400, 'Select an active vehicle.');
  }
}

async function retentionDate(env: Env, occurredAt: string): Promise<string> {
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

function confirmationRequired(
  values: FuelValues,
  input: Record<string, unknown>,
) {
  const warnings = fuelWarnings(values);
  const confirmed = confirmedWarningCodes(input.confirmedWarnings);
  const unconfirmed = warnings.filter(
    (warning) => !confirmed.has(warning.code),
  );
  return unconfirmed.length
    ? json(
        {
          error: 'Review the fuel warnings before saving.',
          warnings: unconfirmed,
        },
        { status: 409 },
      )
    : null;
}

export async function listFuelRecords(
  request: Request,
  env: Env,
): Promise<Response> {
  await requireUser(request, env);
  const result = await env.DB.prepare(
    `${fuelSelect} ORDER BY expenses.purchase_datetime DESC`,
  ).all<FuelRow>();
  return json({ fuelRecords: result.results.map(serialize) });
}

export async function createFuelRecord(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const input = await readJsonObject(request);
  const values = fuelValues(input);
  await assertReferences(env, values);
  const warningResponse = confirmationRequired(values, input);
  if (warningResponse) return warningResponse;
  const category = await env.DB.prepare(
    "SELECT id FROM expense_categories WHERE system_key = 'FUEL' AND active = 1",
  ).first<{ id: string }>();
  if (!category)
    throw new HttpError(503, 'Fuel expense category is unavailable.');
  const retentionUntil = await retentionDate(env, values.purchaseDatetime);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO expenses
        (id, business_activity_id, expense_type, expense_category_id, merchant_name,
         purchase_datetime, total_amount_minor, currency, gst_amount_minor, gst_status,
         description, recurrence_type, status, created_by, created_at, updated_at,
         retention_until, purge_eligible_at)
       VALUES (?, ?, 'FUEL', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      values.businessActivityId,
      category.id,
      values.merchantName,
      values.purchaseDatetime,
      values.totalAmountMinor,
      values.currency,
      values.gstAmountMinor,
      values.gstStatus,
      values.description,
      values.recurrenceType,
      owner.id,
      now,
      now,
      retentionUntil,
      retentionUntil,
    ),
    env.DB.prepare(
      `INSERT INTO fuel_expense_details
        (expense_id, vehicle_id, fuel_station, fuel_price_micros_per_litre,
         fuel_litres, odometer_km, fill_type, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      values.vehicleId,
      values.fuelStation,
      values.fuelPriceMicrosPerLitre,
      values.fuelLitres,
      values.odometerKm,
      values.fillType,
      values.notes,
    ),
  ]);
  await writeAudit(
    env,
    owner,
    'FUEL_EXPENSE_CREATED',
    'EXPENSE',
    id,
    'Fuel expense created.',
    values.businessActivityId,
  );
  const row = await env.DB.prepare(`${fuelSelect} AND expenses.id = ?`)
    .bind(id)
    .first<FuelRow>();
  if (!row) throw new HttpError(500, 'Fuel expense could not be loaded.');
  return json({ fuelRecord: serialize(row) }, { status: 201 });
}

export async function updateFuelRecord(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const input = await readJsonObject(request);
  const id = getRequiredString(input, 'id');
  const row = await env.DB.prepare(`${fuelSelect} AND expenses.id = ?`)
    .bind(id)
    .first<FuelRow>();
  if (!row) throw new HttpError(404, 'Fuel expense not found.');
  const values = fuelValues(input, currentValues(row));
  await assertReferences(env, values, row);
  const warningResponse = confirmationRequired(values, input);
  if (warningResponse) return warningResponse;
  const retentionUntil = await retentionDate(env, values.purchaseDatetime);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE expenses SET business_activity_id = ?, merchant_name = ?, purchase_datetime = ?,
        total_amount_minor = ?, currency = ?, gst_amount_minor = ?, gst_status = ?,
        description = ?, recurrence_type = ?, status = 'NEW', reviewed_by = NULL,
        reviewed_at = NULL, updated_at = ?, retention_until = ?, purge_eligible_at = ?
       WHERE id = ? AND expense_type = 'FUEL'`,
    ).bind(
      values.businessActivityId,
      values.merchantName,
      values.purchaseDatetime,
      values.totalAmountMinor,
      values.currency,
      values.gstAmountMinor,
      values.gstStatus,
      values.description,
      values.recurrenceType,
      now,
      retentionUntil,
      retentionUntil,
      id,
    ),
    env.DB.prepare(
      `UPDATE fuel_expense_details SET vehicle_id = ?, fuel_station = ?,
        fuel_price_micros_per_litre = ?, fuel_litres = ?, odometer_km = ?,
        fill_type = ?, notes = ? WHERE expense_id = ?`,
    ).bind(
      values.vehicleId,
      values.fuelStation,
      values.fuelPriceMicrosPerLitre,
      values.fuelLitres,
      values.odometerKm,
      values.fillType,
      values.notes,
      id,
    ),
  ]);
  await writeAudit(
    env,
    owner,
    'FUEL_EXPENSE_UPDATED',
    'EXPENSE',
    id,
    'Fuel expense updated.',
    values.businessActivityId,
  );
  const updated = await env.DB.prepare(`${fuelSelect} AND expenses.id = ?`)
    .bind(id)
    .first<FuelRow>();
  if (!updated) throw new HttpError(500, 'Fuel expense could not be loaded.');
  return json({ fuelRecord: serialize(updated) });
}
