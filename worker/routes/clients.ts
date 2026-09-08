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
async function unique(env: Env, name: string, excluded = '') {
  if (
    await env.DB.prepare('SELECT id FROM clients WHERE name = ? AND id != ?')
      .bind(name, excluded)
      .first()
  )
    throw new HttpError(409, 'A client with this name already exists.');
}
export async function listClients(request: Request, env: Env) {
  await requireUser(request, env);
  const rows = await env.DB.prepare(
    `${select} ORDER BY active DESC, name COLLATE NOCASE`,
  ).all<ClientRow>();
  return json({ clients: rows.results.map(serialize) });
}
export async function createClient(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const name = expenseText(body.name, 'Client name', 200, true)!;
  const notes = expenseText(body.notes, 'Notes', 2000);
  await unique(env, name);
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
    'INSERT INTO clients (id, name, active, notes, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)',
  )
    .bind(id, name, notes, now, now)
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
  const row = await env.DB.prepare(`${select} WHERE id = ?`)
    .bind(id)
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
  await unique(env, name, id);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE clients SET name = ?, active = ?, notes = ?, updated_at = ? WHERE id = ?',
  )
    .bind(name, active ? 1 : 0, notes, now, id)
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
