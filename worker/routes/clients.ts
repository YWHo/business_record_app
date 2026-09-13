import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
import { expenseText } from '../services/expenseService';
import type { Env } from '../types';

interface ClientRow {
  id: string;
  name: string;
  active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
const select =
  'SELECT id, name, active, notes, created_at, updated_at FROM clients';
const serialize = (row: ClientRow) => ({
  id: row.id,
  name: row.name,
  active: row.active === 1,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
async function unique(
  env: Env,
  businessAccountId: string,
  name: string,
  excluded = '',
) {
  if (
    await env.DB.prepare(
      'SELECT id FROM clients WHERE business_account_id = ? AND name = ? AND id != ?',
    )
      .bind(businessAccountId, name, excluded)
      .first()
  )
    throw new HttpError(409, 'A client with this name already exists.');
}
export async function listClients(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const rows = await env.DB.prepare(
    `${select} WHERE business_account_id = ? ORDER BY active DESC, name COLLATE NOCASE LIMIT 200`,
  )
    .bind(actor.businessAccountId)
    .all<ClientRow>();
  return json({ clients: rows.results.map(serialize) });
}
export async function createClient(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const name = expenseText(body.name, 'Client name', 200, true)!;
  const notes = expenseText(body.notes, 'Notes', 2000);
  await unique(env, owner.businessAccountId, name);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row: ClientRow = {
    id,
    name,
    notes,
    active: 1,
    created_at: now,
    updated_at: now,
  };
  await env.DB.prepare(
    'INSERT INTO clients (id, business_account_id, name, active, notes, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)',
  )
    .bind(id, owner.businessAccountId, name, notes, now, now)
    .run();
  await writeAudit(
    env,
    owner,
    'CLIENT_CREATED',
    'CLIENT',
    id,
    'Client created.',
  );
  return json({ client: serialize(row) }, { status: 201 });
}
export async function updateClient(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    `${select} WHERE id = ? AND business_account_id = ?`,
  )
    .bind(id, owner.businessAccountId)
    .first<ClientRow>();
  if (!row) throw new HttpError(404, 'Client not found.');
  const name = Object.hasOwn(body, 'name')
    ? expenseText(body.name, 'Client name', 200, true)!
    : row.name;
  const notes = Object.hasOwn(body, 'notes')
    ? expenseText(body.notes, 'Notes', 2000)
    : row.notes;
  const active = Object.hasOwn(body, 'active') ? body.active : row.active === 1;
  if (typeof active !== 'boolean')
    throw new HttpError(400, 'Active must be true or false.');
  await unique(env, owner.businessAccountId, name, id);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE clients SET name = ?, active = ?, notes = ?, updated_at = ? WHERE id = ? AND business_account_id = ?',
  )
    .bind(name, active ? 1 : 0, notes, now, id, owner.businessAccountId)
    .run();
  const action =
    row.active !== (active ? 1 : 0)
      ? active
        ? 'CLIENT_ACTIVATED'
        : 'CLIENT_DEACTIVATED'
      : 'CLIENT_UPDATED';
  await writeAudit(env, owner, action, 'CLIENT', id, 'Client updated.');
  return json({
    client: serialize({
      ...row,
      name,
      notes,
      active: active ? 1 : 0,
      updated_at: now,
    }),
  });
}
