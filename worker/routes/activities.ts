import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
import {
  activityValues,
  type ActivityValues,
} from '../services/referenceDataService';
import type { Env } from '../types';

interface ActivityRow {
  id: string;
  name: string;
  activity_type: string;
  active: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

function serialize(row: ActivityRow) {
  return {
    id: row.id,
    name: row.name,
    activityType: row.activity_type,
    active: row.active === 1,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function currentValues(row: ActivityRow): ActivityValues {
  return {
    name: row.name,
    activityType: row.activity_type,
    active: row.active === 1,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

async function assertUniqueName(env: Env, name: string, excludedId = '') {
  const duplicate = await env.DB.prepare(
    'SELECT id FROM business_activities WHERE name = ? AND id != ?',
  )
    .bind(name, excludedId)
    .first();
  if (duplicate) {
    throw new HttpError(
      409,
      'A business activity with this name already exists.',
    );
  }
}

export async function listActivities(
  request: Request,
  env: Env,
): Promise<Response> {
  await requireUser(request, env);
  const result = await env.DB.prepare(
    `SELECT id, name, activity_type, active, started_at, ended_at, created_at, updated_at
       FROM business_activities
      ORDER BY active DESC, name COLLATE NOCASE`,
  ).all<ActivityRow>();
  return json({ activities: result.results.map(serialize) });
}

export async function createActivity(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const values = activityValues(await readJsonObject(request));
  await assertUniqueName(env, values.name);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO business_activities
      (id, name, activity_type, active, started_at, ended_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      values.name,
      values.activityType,
      values.active ? 1 : 0,
      values.startedAt,
      values.endedAt,
      now,
      now,
    )
    .run();
  await writeAudit(
    env,
    owner,
    'BUSINESS_ACTIVITY_CREATED',
    'BUSINESS_ACTIVITY',
    id,
    'Business activity created.',
  );
  return json(
    { activity: serialize({ id, ...toRow(values, now, now) }) },
    { status: 201 },
  );
}

function toRow(
  values: ActivityValues,
  createdAt: string,
  updatedAt: string,
): Omit<ActivityRow, 'id'> {
  return {
    name: values.name,
    activity_type: values.activityType,
    active: values.active ? 1 : 0,
    started_at: values.startedAt,
    ended_at: values.endedAt,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function updateActivity(
  request: Request,
  env: Env,
): Promise<Response> {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    `SELECT id, name, activity_type, active, started_at, ended_at, created_at, updated_at
       FROM business_activities WHERE id = ?`,
  )
    .bind(id)
    .first<ActivityRow>();
  if (!row) throw new HttpError(404, 'Business activity not found.');

  const values = activityValues(body, currentValues(row));
  await assertUniqueName(env, values.name, id);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE business_activities
        SET name = ?, activity_type = ?, active = ?, started_at = ?, ended_at = ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      values.name,
      values.activityType,
      values.active ? 1 : 0,
      values.startedAt,
      values.endedAt,
      now,
      id,
    )
    .run();
  const action =
    row.active !== (values.active ? 1 : 0)
      ? values.active
        ? 'BUSINESS_ACTIVITY_ACTIVATED'
        : 'BUSINESS_ACTIVITY_DEACTIVATED'
      : 'BUSINESS_ACTIVITY_UPDATED';
  await writeAudit(
    env,
    owner,
    action,
    'BUSINESS_ACTIVITY',
    id,
    'Business activity updated.',
  );
  return json({
    activity: serialize({ id, ...toRow(values, row.created_at, now) }),
  });
}
