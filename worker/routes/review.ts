import { requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
import { expenseText } from '../services/expenseService';
import {
  ensureStatusPermission,
  reviewRecordType,
  reviewStatus,
  savedFilterType,
  type ReviewRecordType,
} from '../services/reviewService';
import type { Env } from '../types';

const transactionProjection = `SELECT expenses.id, 'EXPENSE' AS record_type,
  expenses.expense_type AS subtype, substr(expenses.purchase_datetime, 1, 10) AS transaction_date,
  expenses.business_activity_id, business_activities.name AS activity_name,
  expenses.merchant_name AS counterparty, expenses.total_amount_minor,
  expenses.currency, expenses.status, expense_categories.id AS category_id,
  expense_categories.name AS category_name,
  COALESCE(fuel_expense_details.vehicle_id, parking_expense_details.vehicle_id,
    insurance_expense_details.vehicle_id) AS vehicle_id,
  vehicles.registration AS vehicle_registration,
  expenses.reviewed_by, reviewers.email AS reviewer_email, expenses.reviewed_at,
  (SELECT COUNT(*) FROM attachments WHERE record_type='EXPENSE' AND record_id=expenses.id AND is_current=1 AND purged_at IS NULL) AS attachment_count
  FROM expenses
  LEFT JOIN business_activities ON business_activities.id=expenses.business_activity_id
  LEFT JOIN expense_categories ON expense_categories.id=expenses.expense_category_id
  LEFT JOIN fuel_expense_details ON fuel_expense_details.expense_id=expenses.id
  LEFT JOIN parking_expense_details ON parking_expense_details.expense_id=expenses.id
  LEFT JOIN insurance_expense_details ON insurance_expense_details.expense_id=expenses.id
  LEFT JOIN vehicles ON vehicles.id=COALESCE(fuel_expense_details.vehicle_id,
    parking_expense_details.vehicle_id, insurance_expense_details.vehicle_id)
  LEFT JOIN users AS reviewers ON reviewers.id=expenses.reviewed_by
  WHERE expenses.deleted_at IS NULL
  UNION ALL
  SELECT income_records.id, 'INCOME' AS record_type,
  income_records.income_type AS subtype, income_records.transaction_date,
  income_records.business_activity_id, business_activities.name AS activity_name,
  COALESCE(platform_income_details.provider_name, clients.name,
    income_records.received_from, 'Income') AS counterparty,
  income_records.total_amount_minor, income_records.currency, income_records.status,
  NULL AS category_id, NULL AS category_name, NULL AS vehicle_id,
  NULL AS vehicle_registration, income_records.reviewed_by,
  reviewers.email AS reviewer_email, income_records.reviewed_at,
  (SELECT COUNT(*) FROM attachments WHERE record_type='INCOME' AND record_id=income_records.id AND is_current=1 AND purged_at IS NULL) AS attachment_count
  FROM income_records
  JOIN business_activities ON business_activities.id=income_records.business_activity_id
  LEFT JOIN platform_income_details ON platform_income_details.income_id=income_records.id
  LEFT JOIN contract_income_details ON contract_income_details.income_id=income_records.id
  LEFT JOIN clients ON clients.id=contract_income_details.client_id
  LEFT JOIN users AS reviewers ON reviewers.id=income_records.reviewed_by
  WHERE income_records.deleted_at IS NULL`;

interface TransactionRow {
  id: string;
  record_type: 'EXPENSE' | 'INCOME';
  subtype: string;
  transaction_date: string;
  business_activity_id: string | null;
  activity_name: string | null;
  counterparty: string;
  total_amount_minor: number;
  currency: string;
  status: string;
  category_id: string | null;
  category_name: string | null;
  vehicle_id: string | null;
  vehicle_registration: string | null;
  reviewed_by: string | null;
  reviewer_email: string | null;
  reviewed_at: string | null;
  attachment_count: number;
}

function validDate(value: string | null, label: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new HttpError(400, `${label} must be a valid date.`);
  return value;
}
function integerMoney(value: string | null, label: string) {
  if (!value) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new HttpError(400, `${label} must have at most two decimals.`);
  const minor = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(minor))
    throw new HttpError(400, `${label} is outside the supported range.`);
  return minor;
}

export async function listTransactions(request: Request, env: Env) {
  await requireUser(request, env);
  const url = new URL(request.url),
    where: string[] = [],
    bindings: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    where.push(sql);
    bindings.push(value);
  };
  const q = url.searchParams.get('q')?.trim();
  if (q) {
    add(
      '(lower(counterparty) LIKE ? OR lower(subtype) LIKE ?)',
      `%${q.toLowerCase()}%`,
    );
    bindings.push(`%${q.toLowerCase()}%`);
  }
  let from = validDate(url.searchParams.get('dateFrom'), 'Start date');
  let to = validDate(url.searchParams.get('dateTo'), 'End date');
  const taxYear = url.searchParams.get('taxYear');
  if (taxYear) {
    if (!/^\d{4}$/.test(taxYear))
      throw new HttpError(400, 'Tax year is invalid.');
    const endYear = Number(taxYear);
    if (endYear < 1901) throw new HttpError(400, 'Tax year is invalid.');
    from = `${endYear - 1}-04-01`;
    to = `${endYear}-03-31`;
  }
  if (from && to && from > to)
    throw new HttpError(400, 'End date cannot be before start date.');
  if (from) add('transaction_date >= ?', from);
  if (to) add('transaction_date <= ?', to);
  const exact = [
    ['activityId', 'business_activity_id'],
    ['direction', 'record_type'],
    ['subtype', 'subtype'],
    ['categoryId', 'category_id'],
    ['status', 'status'],
    ['vehicleId', 'vehicle_id'],
  ] as const;
  const allowedExact: Partial<Record<(typeof exact)[number][0], string[]>> = {
    direction: ['INCOME', 'EXPENSE'],
    subtype: [
      'PLATFORM',
      'CONTRACT',
      'SUBSCRIPTION',
      'GENERAL',
      'FUEL',
      'PARKING',
      'INSURANCE',
    ],
    status: [
      'NEW',
      'MISSING_INFORMATION',
      'READY_FOR_REVIEW',
      'REVIEWED',
      'PROCESSED',
      'VOIDED',
    ],
  };
  for (const [parameter, column] of exact) {
    const value = url.searchParams.get(parameter)?.trim();
    if (value) {
      if (allowedExact[parameter] && !allowedExact[parameter]?.includes(value))
        throw new HttpError(400, `${parameter} filter is invalid.`);
      add(`${column} = ?`, value);
    }
  }
  const counterparty = url.searchParams.get('counterparty')?.trim();
  if (counterparty)
    add('lower(counterparty) LIKE ?', `%${counterparty.toLowerCase()}%`);
  const min = integerMoney(url.searchParams.get('amountMin'), 'Minimum amount');
  const max = integerMoney(url.searchParams.get('amountMax'), 'Maximum amount');
  if (min !== null && max !== null && min > max)
    throw new HttpError(400, 'Maximum amount cannot be below minimum amount.');
  if (min !== null) add('total_amount_minor >= ?', min);
  if (max !== null) add('total_amount_minor <= ?', max);
  const attachment = url.searchParams.get('attachment');
  if (attachment === 'PRESENT') where.push('attachment_count > 0');
  else if (attachment === 'MISSING') where.push('attachment_count = 0');
  else if (attachment)
    throw new HttpError(400, 'Attachment filter is invalid.');
  const review = url.searchParams.get('review');
  if (review === 'REVIEWED') where.push('reviewed_by IS NOT NULL');
  else if (review === 'UNREVIEWED') where.push('reviewed_by IS NULL');
  else if (review) throw new HttpError(400, 'Review filter is invalid.');
  const rows = await env.DB.prepare(
    `SELECT * FROM (${transactionProjection})${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY transaction_date DESC, id DESC LIMIT 500`,
  )
    .bind(...bindings)
    .all<TransactionRow>();
  const transactions = rows.results.map((row) => ({
    id: row.id,
    recordType: row.record_type,
    subtype: row.subtype,
    transactionDate: row.transaction_date,
    businessActivityId: row.business_activity_id,
    activityName: row.activity_name,
    counterparty: row.counterparty,
    totalAmountMinor: row.total_amount_minor,
    currency: row.currency,
    status: row.status,
    categoryId: row.category_id,
    categoryName: row.category_name,
    vehicleId: row.vehicle_id,
    vehicleRegistration: row.vehicle_registration,
    reviewedBy: row.reviewed_by,
    reviewerEmail: row.reviewer_email,
    reviewedAt: row.reviewed_at,
    attachmentCount: row.attachment_count,
  }));
  return json({
    transactions,
    summary: {
      resultCount: transactions.length,
      missingAttachmentCount: transactions.filter(
        (item) => item.attachmentCount === 0,
      ).length,
      unreviewedCount: transactions.filter((item) => !item.reviewedBy).length,
    },
  });
}

interface ReviewParent {
  id: string;
  status: string;
  business_activity_id: string | null;
}
async function reviewParent(
  env: Env,
  recordType: ReviewRecordType,
  id: string,
) {
  const tables = {
    EXPENSE: 'expenses',
    INCOME: 'income_records',
    WORK_SESSION: 'work_sessions',
  } as const;
  const row = await env.DB.prepare(
    `SELECT id,status,business_activity_id FROM ${tables[recordType]} WHERE id=? AND deleted_at IS NULL`,
  )
    .bind(id)
    .first<ReviewParent>();
  if (!row) throw new HttpError(404, 'Record not found.');
  return row;
}

export async function updateRecordStatus(request: Request, env: Env) {
  const actor = await requireUser(request, env),
    body = await readJsonObject(request);
  const recordType = reviewRecordType(body.recordType),
    id = getRequiredString(body, 'recordId'),
    status = reviewStatus(body.status);
  const current = await reviewParent(env, recordType, id);
  ensureStatusPermission(actor.role, current.status, status);
  if (current.status === status)
    return json({ record: { id, recordType, status } });
  const table = {
    EXPENSE: 'expenses',
    INCOME: 'income_records',
    WORK_SESSION: 'work_sessions',
  }[recordType];
  const now = new Date().toISOString();
  if (recordType === 'WORK_SESSION' || status === 'PROCESSED') {
    await env.DB.prepare(`UPDATE ${table} SET status=?,updated_at=? WHERE id=?`)
      .bind(status, now, id)
      .run();
  } else {
    const reviewer = ['REVIEWED', 'PROCESSED'].includes(status)
      ? actor.id
      : null;
    const reviewedAt = reviewer ? now : null;
    await env.DB.prepare(
      `UPDATE ${table} SET status=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?`,
    )
      .bind(status, reviewer, reviewedAt, now, id)
      .run();
  }
  await writeAudit(
    env,
    actor,
    status === 'REVIEWED' ? 'RECORD_REVIEWED' : 'RECORD_STATUS_CHANGED',
    recordType,
    id,
    `Status changed from ${current.status} to ${status}.`,
    current.business_activity_id,
  );
  const retainedReview =
    status === 'PROCESSED' && recordType !== 'WORK_SESSION'
      ? await env.DB.prepare(
          `SELECT users.email AS reviewer_email, ${table}.reviewed_at FROM ${table} LEFT JOIN users ON users.id=${table}.reviewed_by WHERE ${table}.id=?`,
        )
          .bind(id)
          .first<{
            reviewer_email: string | null;
            reviewed_at: string | null;
          }>()
      : null;
  return json({
    record: {
      id,
      recordType,
      status,
      reviewerEmail:
        status === 'REVIEWED'
          ? actor.email
          : (retainedReview?.reviewer_email ?? null),
      reviewedAt:
        status === 'REVIEWED' ? now : (retainedReview?.reviewed_at ?? null),
    },
  });
}

interface CommentRow {
  id: string;
  record_type: ReviewRecordType;
  record_id: string;
  message: string;
  created_at: string;
  author_id: string;
  author_email: string;
  author_role: string;
}
const commentSelect = `SELECT comments.id,comments.record_type,comments.record_id,comments.message,comments.created_at,comments.author_id,users.email AS author_email,users.role AS author_role FROM comments JOIN users ON users.id=comments.author_id`;
const commentJson = (row: CommentRow) => ({
  id: row.id,
  recordType: row.record_type,
  recordId: row.record_id,
  message: row.message,
  createdAt: row.created_at,
  authorId: row.author_id,
  authorEmail: row.author_email,
  authorRole: row.author_role,
});
export async function listComments(request: Request, env: Env) {
  await requireUser(request, env);
  const url = new URL(request.url);
  const recordType = reviewRecordType(url.searchParams.get('recordType'));
  const recordId = url.searchParams.get('recordId')?.trim();
  if (!recordId) throw new HttpError(400, 'recordId is required.');
  await reviewParent(env, recordType, recordId);
  const rows = await env.DB.prepare(
    `${commentSelect} WHERE comments.record_type=? AND comments.record_id=? ORDER BY comments.created_at,comments.id`,
  )
    .bind(recordType, recordId)
    .all<CommentRow>();
  return json({ comments: rows.results.map(commentJson) });
}
export async function createComment(request: Request, env: Env) {
  const actor = await requireUser(request, env),
    body = await readJsonObject(request);
  const recordType = reviewRecordType(body.recordType),
    recordId = getRequiredString(body, 'recordId');
  const target = await reviewParent(env, recordType, recordId);
  const message = expenseText(body.message, 'Comment', 4000, true)!;
  const row: CommentRow = {
    id: crypto.randomUUID(),
    record_type: recordType,
    record_id: recordId,
    message,
    created_at: new Date().toISOString(),
    author_id: actor.id,
    author_email: actor.email,
    author_role: actor.role,
  };
  await env.DB.prepare(
    'INSERT INTO comments (id,record_type,record_id,author_id,message,created_at) VALUES (?,?,?,?,?,?)',
  )
    .bind(row.id, recordType, recordId, actor.id, message, row.created_at)
    .run();
  await writeAudit(
    env,
    actor,
    'COMMENT_CREATED',
    recordType,
    recordId,
    'Comment added.',
    target.business_activity_id,
  );
  return json({ comment: commentJson(row) }, { status: 201 });
}

interface FilterRow {
  id: string;
  name: string;
  filter_type: 'TRANSACTIONS' | 'RECEIPTS' | 'AUDIT';
  criteria_json: string;
  created_at: string;
  updated_at: string;
}
const filterJson = (row: FilterRow) => ({
  id: row.id,
  name: row.name,
  filterType: row.filter_type,
  criteria: JSON.parse(row.criteria_json) as unknown,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
function criteria(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(400, 'Filter criteria must be an object.');
  const allowed = new Set([
    'q',
    'dateFrom',
    'dateTo',
    'taxYear',
    'activityId',
    'direction',
    'subtype',
    'categoryId',
    'status',
    'vehicleId',
    'amountMin',
    'amountMax',
    'attachment',
    'review',
    'userId',
    'action',
    'entityType',
  ]);
  for (const [key, item] of Object.entries(value))
    if (!allowed.has(key) || typeof item !== 'string' || item.length > 500)
      throw new HttpError(400, 'Filter criteria contains an invalid field.');
  const serialized = JSON.stringify(value);
  if (serialized.length > 8000)
    throw new HttpError(400, 'Filter criteria is too large.');
  return serialized;
}
export async function listSavedFilters(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const rawType = new URL(request.url).searchParams.get('filterType');
  const type = rawType ? savedFilterType(rawType) : null;
  const rows = await env.DB.prepare(
    `SELECT id,name,filter_type,criteria_json,created_at,updated_at FROM saved_filters WHERE user_id=?${type ? ' AND filter_type=?' : ''} ORDER BY name COLLATE NOCASE`,
  )
    .bind(actor.id, ...(type ? [type] : []))
    .all<FilterRow>();
  return json({ savedFilters: rows.results.map(filterJson) });
}
export async function createSavedFilter(request: Request, env: Env) {
  const actor = await requireUser(request, env),
    body = await readJsonObject(request);
  const name = expenseText(body.name, 'Filter name', 100, true)!,
    filterType = savedFilterType(body.filterType),
    criteriaJson = criteria(body.criteria),
    now = new Date().toISOString(),
    id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      'INSERT INTO saved_filters (id,user_id,name,filter_type,criteria_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    )
      .bind(id, actor.id, name, filterType, criteriaJson, now, now)
      .run();
  } catch {
    throw new HttpError(409, 'A saved filter with this name already exists.');
  }
  return json(
    {
      savedFilter: filterJson({
        id,
        name,
        filter_type: filterType,
        criteria_json: criteriaJson,
        created_at: now,
        updated_at: now,
      }),
    },
    { status: 201 },
  );
}
export async function updateSavedFilter(request: Request, env: Env) {
  const actor = await requireUser(request, env),
    body = await readJsonObject(request),
    id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(
    'SELECT id,name,filter_type,criteria_json,created_at,updated_at FROM saved_filters WHERE id=? AND user_id=?',
  )
    .bind(id, actor.id)
    .first<FilterRow>();
  if (!row) throw new HttpError(404, 'Saved filter not found.');
  const name = Object.hasOwn(body, 'name')
    ? expenseText(body.name, 'Filter name', 100, true)!
    : row.name;
  const filterType = Object.hasOwn(body, 'filterType')
    ? savedFilterType(body.filterType)
    : row.filter_type;
  const criteriaJson = Object.hasOwn(body, 'criteria')
    ? criteria(body.criteria)
    : row.criteria_json;
  const updatedAt = new Date().toISOString();
  try {
    await env.DB.prepare(
      'UPDATE saved_filters SET name=?,filter_type=?,criteria_json=?,updated_at=? WHERE id=? AND user_id=?',
    )
      .bind(name, filterType, criteriaJson, updatedAt, id, actor.id)
      .run();
  } catch {
    throw new HttpError(409, 'A saved filter with this name already exists.');
  }
  return json({
    savedFilter: filterJson({
      ...row,
      name,
      filter_type: filterType,
      criteria_json: criteriaJson,
      updated_at: updatedAt,
    }),
  });
}
export async function deleteSavedFilter(request: Request, env: Env) {
  const actor = await requireUser(request, env),
    body = await readJsonObject(request),
    id = getRequiredString(body, 'id');
  const result = await env.DB.prepare(
    'DELETE FROM saved_filters WHERE id=? AND user_id=?',
  )
    .bind(id, actor.id)
    .run();
  if (!result.meta.changes) throw new HttpError(404, 'Saved filter not found.');
  return json({ deleted: true });
}
