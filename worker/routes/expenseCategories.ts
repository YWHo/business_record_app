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

interface CategoryRow {
  id: string;
  name: string;
  active: number;
  system_key: string | null;
  created_at: string;
  updated_at: string;
}

const select =
  'SELECT id, name, active, system_key, created_at, updated_at FROM expense_categories';
const serialize = (row: CategoryRow) => ({
  id: row.id,
  name: row.name,
  active: row.active === 1,
  systemKey: row.system_key,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function assertUnique(
  env: Env,
  businessAccountId: string,
  name: string,
  excludedId = '',
) {
  const duplicate = await env.DB.prepare(
    'SELECT id FROM expense_categories WHERE business_account_id = ? AND name = ? AND id != ?',
  )
    .bind(businessAccountId, name, excludedId)
    .first();
  if (duplicate)
    throw new HttpError(
      409,
      'An expense category with this name already exists.',
    );
}

export async function listExpenseCategories(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const result = await env.DB.prepare(
    `${select} WHERE business_account_id = ? ORDER BY active DESC, name COLLATE NOCASE LIMIT 200`,
  )
    .bind(actor.businessAccountId)
    .all<CategoryRow>();
  return json({ categories: result.results.map(serialize) });
}

export async function createExpenseCategory(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const name = expenseText(body.name, 'Category name', 100, true)!;
  await assertUnique(env, owner.businessAccountId, name);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO expense_categories (id, business_account_id, name, active, system_key, created_at, updated_at) VALUES (?, ?, ?, 1, NULL, ?, ?)',
  )
    .bind(id, owner.businessAccountId, name, now, now)
    .run();
  await writeAudit(
    env,
    owner,
    'EXPENSE_CATEGORY_CREATED',
    'EXPENSE_CATEGORY',
    id,
    'Expense category created.',
  );
  return json(
    {
      category: serialize({
        id,
        name,
        active: 1,
        system_key: null,
        created_at: now,
        updated_at: now,
      }),
    },
    { status: 201 },
  );
}

export async function updateExpenseCategory(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    `${select} WHERE id = ? AND business_account_id = ?`,
  )
    .bind(id, owner.businessAccountId)
    .first<CategoryRow>();
  if (!row) throw new HttpError(404, 'Expense category not found.');
  const name = Object.hasOwn(body, 'name')
    ? expenseText(body.name, 'Category name', 100, true)!
    : row.name;
  const active = Object.hasOwn(body, 'active') ? body.active : row.active === 1;
  if (typeof active !== 'boolean')
    throw new HttpError(400, 'Active must be true or false.');
  if (
    !active &&
    [
      'FUEL',
      'PARKING',
      'VEHICLE_INSURANCE',
      'PROFESSIONAL_LIABILITY_INSURANCE',
    ].includes(row.system_key ?? '')
  ) {
    throw new HttpError(
      400,
      'Specialised expense categories must remain active for their workflows.',
    );
  }
  await assertUnique(env, owner.businessAccountId, name, id);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE expense_categories SET name = ?, active = ?, updated_at = ? WHERE id = ? AND business_account_id = ?',
  )
    .bind(name, active ? 1 : 0, now, id, owner.businessAccountId)
    .run();
  const action =
    row.active !== (active ? 1 : 0)
      ? active
        ? 'EXPENSE_CATEGORY_ACTIVATED'
        : 'EXPENSE_CATEGORY_DEACTIVATED'
      : 'EXPENSE_CATEGORY_UPDATED';
  await writeAudit(
    env,
    owner,
    action,
    'EXPENSE_CATEGORY',
    id,
    'Expense category updated.',
  );
  return json({
    category: serialize({
      ...row,
      name,
      active: active ? 1 : 0,
      updated_at: now,
    }),
  });
}
