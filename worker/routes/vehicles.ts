import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
import {
  vehicleValues,
  type VehicleValues,
} from '../services/referenceDataService';
import type { Env } from '../types';

interface VehicleRow {
  id: string;
  registration: string;
  description: string;
  active: number;
  acquired_at: string | null;
  retired_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function serialize(row: VehicleRow) {
  return {
    id: row.id,
    registration: row.registration,
    description: row.description,
    active: row.active === 1,
    acquiredAt: row.acquired_at,
    retiredAt: row.retired_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function currentValues(row: VehicleRow): VehicleValues {
  return {
    registration: row.registration,
    description: row.description,
    active: row.active === 1,
    acquiredAt: row.acquired_at,
    retiredAt: row.retired_at,
    notes: row.notes,
  };
}

function toRow(
  values: VehicleValues,
  createdAt: string,
  updatedAt: string,
): Omit<VehicleRow, 'id'> {
  return {
    registration: values.registration,
    description: values.description,
    active: values.active ? 1 : 0,
    acquired_at: values.acquiredAt,
    retired_at: values.retiredAt,
    notes: values.notes,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function assertUniqueRegistration(
  env: Env,
  businessAccountId: string,
  registration: string,
  excludedId = '',
) {
  const duplicate = await env.DB.prepare(
    'SELECT id FROM vehicles WHERE business_account_id = ? AND registration = ? AND id != ?',
  )
    .bind(businessAccountId, registration, excludedId)
    .first();
  if (duplicate) {
    throw new HttpError(
      409,
      'A vehicle with this registration already exists.',
    );
  }
}

export async function listVehicles(
  request: Request,
  env: Env,
): Promise<Response> {
  const actor = await requireUser(request, env);
  const result = await env.DB.prepare(
    `SELECT id, registration, description, active, acquired_at, retired_at, notes, created_at, updated_at
       FROM vehicles
      WHERE business_account_id = ?
      ORDER BY active DESC, registration COLLATE NOCASE LIMIT 200`,
  )
    .bind(actor.businessAccountId)
    .all<VehicleRow>();
  return json({ vehicles: result.results.map(serialize) });
}

export async function createVehicle(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const values = vehicleValues(await readJsonObject(request));
  await assertUniqueRegistration(
    env,
    owner.businessAccountId,
    values.registration,
  );
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO vehicles
      (id, business_account_id, registration, description, active, acquired_at,
       retired_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      owner.businessAccountId,
      values.registration,
      values.description,
      values.active ? 1 : 0,
      values.acquiredAt,
      values.retiredAt,
      values.notes,
      now,
      now,
    )
    .run();
  await writeAudit(
    env,
    owner,
    'VEHICLE_CREATED',
    'VEHICLE',
    id,
    'Vehicle created.',
  );
  return json(
    { vehicle: serialize({ id, ...toRow(values, now, now) }) },
    { status: 201 },
  );
}

export async function updateVehicle(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    `SELECT id, registration, description, active, acquired_at, retired_at, notes, created_at, updated_at
       FROM vehicles WHERE id = ? AND business_account_id = ?`,
  )
    .bind(id, owner.businessAccountId)
    .first<VehicleRow>();
  if (!row) throw new HttpError(404, 'Vehicle not found.');

  const values = vehicleValues(body, currentValues(row));
  await assertUniqueRegistration(
    env,
    owner.businessAccountId,
    values.registration,
    id,
  );
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE vehicles
        SET registration = ?, description = ?, active = ?, acquired_at = ?, retired_at = ?, notes = ?, updated_at = ?
      WHERE id = ? AND business_account_id = ?`,
  )
    .bind(
      values.registration,
      values.description,
      values.active ? 1 : 0,
      values.acquiredAt,
      values.retiredAt,
      values.notes,
      now,
      id,
      owner.businessAccountId,
    )
    .run();
  const action =
    row.active !== (values.active ? 1 : 0)
      ? values.active
        ? 'VEHICLE_ACTIVATED'
        : 'VEHICLE_DEACTIVATED'
      : 'VEHICLE_UPDATED';
  await writeAudit(env, owner, action, 'VEHICLE', id, 'Vehicle updated.');
  return json({
    vehicle: serialize({ id, ...toRow(values, row.created_at, now) }),
  });
}
