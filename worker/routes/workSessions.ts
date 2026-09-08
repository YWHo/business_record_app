import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
import { calculateFuelMetrics } from '../services/fuelService';
import {
  calculateRetentionDate,
  calculateWorkSessionMetrics,
  type WorkSessionValues,
  workSessionValues,
} from '../services/workSessionService';
import type { Env } from '../types';

interface WorkSessionRow {
  id: string;
  business_activity_id: string;
  activity_name: string;
  vehicle_id: string;
  vehicle_registration: string;
  started_at: string;
  ended_at: string;
  odometer_start_km: number;
  odometer_end_km: number;
  distance_km: number;
  gross_revenue_minor: number | null;
  currency: string;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  tank_full_at_start: number | null;
  no_personal_driving: number | null;
  tank_full_at_end: number | null;
  starting_fuel_expense_id: string | null;
  starting_fuel_merchant: string | null;
  ending_fuel_expense_id: string | null;
  ending_fuel_merchant: string | null;
  ending_fuel_total_minor: number | null;
  ending_fuel_currency: string | null;
  ending_fuel_litres: number | null;
  ending_fill_type: string | null;
}

interface RetentionSettings {
  retention_tax_years: number;
  tax_year_end_month: number;
  tax_year_end_day: number;
}

const sessionSelect = `SELECT work_sessions.id, work_sessions.business_activity_id,
  business_activities.name AS activity_name, work_sessions.vehicle_id,
  vehicles.registration AS vehicle_registration, work_sessions.started_at,
  work_sessions.ended_at, work_sessions.odometer_start_km,
  work_sessions.odometer_end_km, work_sessions.distance_km,
  work_sessions.gross_revenue_minor, work_sessions.currency, work_sessions.notes,
  work_sessions.status, work_sessions.created_at, work_sessions.updated_at,
  work_sessions.tank_full_at_start, work_sessions.no_personal_driving,
  work_sessions.tank_full_at_end, work_sessions.starting_fuel_expense_id,
  starting_fuel.merchant_name AS starting_fuel_merchant,
  work_sessions.ending_fuel_expense_id,
  ending_fuel.merchant_name AS ending_fuel_merchant,
  ending_fuel.total_amount_minor AS ending_fuel_total_minor,
  ending_fuel.currency AS ending_fuel_currency,
  ending_detail.fuel_litres AS ending_fuel_litres,
  ending_detail.fill_type AS ending_fill_type
  FROM work_sessions
  JOIN business_activities ON business_activities.id = work_sessions.business_activity_id
  JOIN vehicles ON vehicles.id = work_sessions.vehicle_id
  LEFT JOIN expenses AS starting_fuel ON starting_fuel.id = work_sessions.starting_fuel_expense_id
  LEFT JOIN expenses AS ending_fuel ON ending_fuel.id = work_sessions.ending_fuel_expense_id
  LEFT JOIN fuel_expense_details AS ending_detail ON ending_detail.expense_id = ending_fuel.id`;

function serialize(row: WorkSessionRow) {
  const evidenceReady =
    row.tank_full_at_start === 1 &&
    row.no_personal_driving === 1 &&
    row.tank_full_at_end === 1 &&
    row.ending_fill_type === 'FULL';
  return {
    id: row.id,
    businessActivityId: row.business_activity_id,
    activityName: row.activity_name,
    vehicleId: row.vehicle_id,
    vehicleRegistration: row.vehicle_registration,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    odometerStartKm: row.odometer_start_km,
    odometerEndKm: row.odometer_end_km,
    grossRevenueMinor: row.gross_revenue_minor,
    currency: row.currency,
    notes: row.notes,
    status: row.status,
    tankFullAtStart:
      row.tank_full_at_start === null ? null : row.tank_full_at_start === 1,
    noPersonalDriving:
      row.no_personal_driving === null ? null : row.no_personal_driving === 1,
    tankFullAtEnd:
      row.tank_full_at_end === null ? null : row.tank_full_at_end === 1,
    startingFuelExpenseId: row.starting_fuel_expense_id,
    startingFuelMerchant: row.starting_fuel_merchant,
    endingFuelExpenseId: row.ending_fuel_expense_id,
    endingFuelMerchant: row.ending_fuel_merchant,
    fuelCurrency: row.ending_fuel_currency,
    ...calculateWorkSessionMetrics(
      row.started_at,
      row.ended_at,
      row.distance_km,
      row.gross_revenue_minor,
    ),
    ...calculateFuelMetrics(
      row.distance_km,
      row.ending_fill_type === 'FULL' ? row.ending_fuel_litres : null,
      row.ending_fill_type === 'FULL' ? row.ending_fuel_total_minor : null,
      evidenceReady,
    ),
  };
}

function currentValues(row: WorkSessionRow): WorkSessionValues {
  return {
    businessActivityId: row.business_activity_id,
    vehicleId: row.vehicle_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    odometerStartKm: row.odometer_start_km,
    odometerEndKm: row.odometer_end_km,
    grossRevenueMinor: row.gross_revenue_minor,
    currency: row.currency,
    notes: row.notes,
  };
}

async function assertReferences(
  env: Env,
  values: WorkSessionValues,
  current?: WorkSessionRow,
) {
  const [activity, vehicle] = await Promise.all([
    env.DB.prepare('SELECT active FROM business_activities WHERE id = ?')
      .bind(values.businessActivityId)
      .first<{ active: number }>(),
    env.DB.prepare('SELECT active FROM vehicles WHERE id = ?')
      .bind(values.vehicleId)
      .first<{ active: number }>(),
  ]);
  if (
    !activity ||
    (!activity.active &&
      current?.business_activity_id !== values.businessActivityId)
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
  if (!settings) {
    throw new HttpError(503, 'Retention settings are unavailable.');
  }
  return calculateRetentionDate(
    occurredAt,
    settings.retention_tax_years,
    settings.tax_year_end_month,
    settings.tax_year_end_day,
  );
}

function summarize(rows: WorkSessionRow[]) {
  let totalMinutes = 0;
  let totalDistanceKm = 0;
  let totalRevenueMinor = 0;
  let sessionsWithRevenue = 0;
  for (const row of rows) {
    const metrics = calculateWorkSessionMetrics(
      row.started_at,
      row.ended_at,
      row.distance_km,
      row.gross_revenue_minor,
    );
    totalMinutes += metrics.durationMinutes;
    totalDistanceKm += metrics.distanceKm;
    if (row.gross_revenue_minor !== null) {
      totalRevenueMinor += row.gross_revenue_minor;
      sessionsWithRevenue += 1;
    }
  }
  totalDistanceKm = Math.round(totalDistanceKm * 1000) / 1000;
  const revenueCurrencies = new Set(
    rows
      .filter((row) => row.gross_revenue_minor !== null)
      .map((row) => row.currency),
  );
  const oneCurrency = revenueCurrencies.size <= 1;
  const completeRevenueData =
    rows.length > 0 && sessionsWithRevenue === rows.length;
  const aggregateCurrency = oneCurrency
    ? (revenueCurrencies.values().next().value ?? null)
    : null;
  return {
    sessionCount: rows.length,
    totalDurationHours: Math.round((totalMinutes / 60) * 100) / 100,
    totalDistanceKm,
    totalRevenueMinor:
      sessionsWithRevenue && oneCurrency ? totalRevenueMinor : null,
    revenuePerHourMinor:
      completeRevenueData && oneCurrency && totalMinutes > 0
        ? Math.round((totalRevenueMinor * 60) / totalMinutes)
        : null,
    revenuePerKmMinor:
      completeRevenueData && oneCurrency && totalDistanceKm > 0
        ? Math.round(totalRevenueMinor / totalDistanceKm)
        : null,
    currency: aggregateCurrency,
    completeRevenueData,
  };
}

export async function listWorkSessions(
  request: Request,
  env: Env,
): Promise<Response> {
  await requireUser(request, env);
  const result = await env.DB.prepare(
    `${sessionSelect} ORDER BY work_sessions.started_at DESC`,
  ).all<WorkSessionRow>();
  return json({
    sessions: result.results.map(serialize),
    summary: summarize(result.results),
  });
}

export async function createWorkSession(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const values = workSessionValues(await readJsonObject(request));
  await assertReferences(env, values);
  const retentionUntil = await retentionDate(env, values.endedAt);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO work_sessions
      (id, business_activity_id, vehicle_id, started_at, ended_at,
       odometer_start_km, odometer_end_km, gross_revenue_minor, currency, notes,
       status, created_by, created_at, updated_at, retention_until, purge_eligible_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      values.businessActivityId,
      values.vehicleId,
      values.startedAt,
      values.endedAt,
      values.odometerStartKm,
      values.odometerEndKm,
      values.grossRevenueMinor,
      values.currency,
      values.notes,
      owner.id,
      now,
      now,
      retentionUntil,
      retentionUntil,
    )
    .run();
  await writeAudit(
    env,
    owner,
    'WORK_SESSION_CREATED',
    'WORK_SESSION',
    id,
    'Work session created.',
    values.businessActivityId,
  );
  const row = await env.DB.prepare(
    `${sessionSelect} WHERE work_sessions.id = ?`,
  )
    .bind(id)
    .first<WorkSessionRow>();
  if (!row) throw new HttpError(500, 'Work session could not be loaded.');
  return json({ session: serialize(row) }, { status: 201 });
}

export async function updateWorkSession(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    `${sessionSelect} WHERE work_sessions.id = ?`,
  )
    .bind(id)
    .first<WorkSessionRow>();
  if (!row) throw new HttpError(404, 'Work session not found.');
  const values = workSessionValues(body, currentValues(row));
  await assertReferences(env, values, row);
  const retentionUntil = await retentionDate(env, values.endedAt);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE work_sessions SET business_activity_id = ?, vehicle_id = ?, started_at = ?,
      ended_at = ?, odometer_start_km = ?, odometer_end_km = ?,
      gross_revenue_minor = ?, currency = ?, notes = ?, updated_at = ?,
      retention_until = ?, purge_eligible_at = ? WHERE id = ?`,
  )
    .bind(
      values.businessActivityId,
      values.vehicleId,
      values.startedAt,
      values.endedAt,
      values.odometerStartKm,
      values.odometerEndKm,
      values.grossRevenueMinor,
      values.currency,
      values.notes,
      now,
      retentionUntil,
      retentionUntil,
      id,
    )
    .run();
  await writeAudit(
    env,
    owner,
    'WORK_SESSION_UPDATED',
    'WORK_SESSION',
    id,
    'Work session updated.',
    values.businessActivityId,
  );
  const updated = await env.DB.prepare(
    `${sessionSelect} WHERE work_sessions.id = ?`,
  )
    .bind(id)
    .first<WorkSessionRow>();
  if (!updated) throw new HttpError(500, 'Work session could not be loaded.');
  return json({ session: serialize(updated) });
}

function requiredBoolean(
  input: Record<string, unknown>,
  field: string,
): boolean {
  const value = input[field];
  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${field} must be confirmed as yes or no.`);
  }
  return value;
}

function optionalId(
  input: Record<string, unknown>,
  field: string,
): string | null {
  const value = input[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 100) {
    throw new HttpError(400, `${field} is invalid.`);
  }
  return value.trim();
}

interface LinkedFuelRow {
  id: string;
  vehicle_id: string;
}

async function linkedFuel(
  env: Env,
  id: string | null,
): Promise<LinkedFuelRow | null> {
  if (!id) return null;
  const fuel = await env.DB.prepare(
    `SELECT expenses.id, fuel_expense_details.vehicle_id FROM expenses
     JOIN fuel_expense_details ON fuel_expense_details.expense_id = expenses.id
     WHERE expenses.id = ? AND expenses.expense_type = 'FUEL' AND expenses.deleted_at IS NULL`,
  )
    .bind(id)
    .first<LinkedFuelRow>();
  if (!fuel) throw new HttpError(400, 'Select a valid fuel expense.');
  return fuel;
}

export async function updateFuelWorkflow(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const input = await readJsonObject(request);
  const id = getRequiredString(input, 'id');
  const row = await env.DB.prepare(
    `${sessionSelect} WHERE work_sessions.id = ?`,
  )
    .bind(id)
    .first<WorkSessionRow>();
  if (!row) throw new HttpError(404, 'Work session not found.');

  const tankFullAtStart = requiredBoolean(input, 'tankFullAtStart');
  const noPersonalDriving = requiredBoolean(input, 'noPersonalDriving');
  const tankFullAtEnd = requiredBoolean(input, 'tankFullAtEnd');
  const startingFuelExpenseId = optionalId(input, 'startingFuelExpenseId');
  const endingFuelExpenseId = optionalId(input, 'endingFuelExpenseId');
  if (
    startingFuelExpenseId &&
    endingFuelExpenseId &&
    startingFuelExpenseId === endingFuelExpenseId
  ) {
    throw new HttpError(
      400,
      'Starting and ending fuel expenses must be different.',
    );
  }
  const [startingFuel, endingFuel] = await Promise.all([
    linkedFuel(env, startingFuelExpenseId),
    linkedFuel(env, endingFuelExpenseId),
  ]);
  if (
    (startingFuel && startingFuel.vehicle_id !== row.vehicle_id) ||
    (endingFuel && endingFuel.vehicle_id !== row.vehicle_id)
  ) {
    throw new HttpError(
      400,
      'Linked fuel expenses must use the session vehicle.',
    );
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE work_sessions SET tank_full_at_start = ?, no_personal_driving = ?,
      tank_full_at_end = ?, starting_fuel_expense_id = ?, ending_fuel_expense_id = ?,
      updated_at = ? WHERE id = ?`,
  )
    .bind(
      tankFullAtStart ? 1 : 0,
      noPersonalDriving ? 1 : 0,
      tankFullAtEnd ? 1 : 0,
      startingFuelExpenseId,
      endingFuelExpenseId,
      now,
      id,
    )
    .run();
  await writeAudit(
    env,
    owner,
    'WORK_SESSION_FUEL_UPDATED',
    'WORK_SESSION',
    id,
    'Full-tank fuel workflow updated.',
    row.business_activity_id,
  );
  const updated = await env.DB.prepare(
    `${sessionSelect} WHERE work_sessions.id = ?`,
  )
    .bind(id)
    .first<WorkSessionRow>();
  if (!updated) throw new HttpError(500, 'Work session could not be loaded.');
  return json({ session: serialize(updated) });
}
