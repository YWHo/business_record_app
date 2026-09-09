import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
import {
  isPurgeEligible,
  retainedRecordType,
  retentionSettingsValues,
  type RetainedRecordType,
} from '../services/retentionService';
import type { Env } from '../types';

const tables = {
  EXPENSE: 'expenses',
  INCOME: 'income_records',
  WORK_SESSION: 'work_sessions',
} as const;

function parsedObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

interface RetainedRow {
  id: string;
  status: string;
  business_activity_id: string | null;
  deleted_at: string | null;
  retention_until: string;
  purge_eligible_at: string;
  purged_at: string | null;
}

async function retainedRecord(
  env: Env,
  recordType: RetainedRecordType,
  id: string,
) {
  const record = await env.DB.prepare(
    `SELECT id,status,business_activity_id,deleted_at,retention_until,purge_eligible_at,purged_at FROM ${tables[recordType]} WHERE id=?`,
  )
    .bind(id)
    .first<RetainedRow>();
  if (!record) throw new HttpError(404, 'Record not found.');
  return record;
}

export async function listAuditLog(request: Request, env: Env) {
  await requireUser(request, env);
  const url = new URL(request.url),
    where: string[] = [],
    bindings: unknown[] = [];
  const exact = [
    ['userId', 'audit_log.user_id'],
    ['action', 'audit_log.action'],
    ['entityType', 'audit_log.entity_type'],
    ['activityId', 'audit_log.business_activity_id'],
  ] as const;
  for (const [parameter, column] of exact) {
    const value = url.searchParams.get(parameter)?.trim();
    if (value) {
      where.push(`${column}=?`);
      bindings.push(value);
    }
  }
  for (const [parameter, operator] of [
    ['dateFrom', '>='],
    ['dateTo', '<='],
  ] as const) {
    const value = url.searchParams.get(parameter)?.trim();
    if (value) {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(parsed.valueOf()) ||
        parsed.toISOString().slice(0, 10) !== value
      )
        throw new HttpError(400, `${parameter} is invalid.`);
      where.push(`substr(audit_log.created_at,1,10) ${operator} ?`);
      bindings.push(value);
    }
  }
  const rows = await env.DB.prepare(
    `SELECT audit_log.id,audit_log.action,audit_log.entity_type,audit_log.entity_id,
      audit_log.business_activity_id,audit_log.summary,audit_log.changed_fields_json,
      audit_log.created_at,users.id AS user_id,users.email AS user_email,
      business_activities.name AS activity_name
     FROM audit_log JOIN users ON users.id=audit_log.user_id
     LEFT JOIN business_activities ON business_activities.id=audit_log.business_activity_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY audit_log.created_at DESC,audit_log.id DESC LIMIT 500`,
  )
    .bind(...bindings)
    .all<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      business_activity_id: string | null;
      summary: string;
      changed_fields_json: string | null;
      created_at: string;
      user_id: string;
      user_email: string;
      activity_name: string | null;
    }>();
  return json({
    auditEvents: rows.results.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      businessActivityId: row.business_activity_id,
      activityName: row.activity_name,
      summary: row.summary,
      changedFields: parsedObject(row.changed_fields_json),
      createdAt: row.created_at,
      userId: row.user_id,
      userEmail: row.user_email,
    })),
  });
}

export async function listTrash(request: Request, env: Env) {
  await requireUser(request, env);
  const rows = await env.DB.prepare(
    `SELECT * FROM (
      SELECT id,'EXPENSE' AS record_type,expense_type AS subtype,merchant_name AS label,
        substr(purchase_datetime,1,10) AS record_date,business_activity_id,status,deleted_at,
        retention_until,purge_eligible_at,purged_at FROM expenses WHERE deleted_at IS NOT NULL
      UNION ALL
      SELECT id,'INCOME',income_type,COALESCE(received_from,'Income'),transaction_date,
        business_activity_id,status,deleted_at,retention_until,purge_eligible_at,purged_at
        FROM income_records WHERE deleted_at IS NOT NULL
      UNION ALL
      SELECT id,'WORK_SESSION','MILEAGE','Work session',substr(started_at,1,10),
        business_activity_id,status,deleted_at,retention_until,purge_eligible_at,purged_at
        FROM work_sessions WHERE deleted_at IS NOT NULL
    ) ORDER BY deleted_at DESC,id DESC`,
  ).all<{
    id: string;
    record_type: RetainedRecordType;
    subtype: string;
    label: string;
    record_date: string;
    business_activity_id: string | null;
    status: string;
    deleted_at: string;
    retention_until: string;
    purge_eligible_at: string;
    purged_at: string | null;
  }>();
  const now = new Date();
  return json({
    trash: rows.results.map((row) => ({
      id: row.id,
      recordType: row.record_type,
      subtype: row.subtype,
      label: row.label,
      recordDate: row.record_date,
      businessActivityId: row.business_activity_id,
      status: row.status,
      deletedAt: row.deleted_at,
      retentionUntil: row.retention_until,
      purgeEligibleAt: row.purge_eligible_at,
      purgeEligible: isPurgeEligible(row.purge_eligible_at, now),
      purgePending: row.purged_at !== null,
    })),
  });
}

export async function moveToTrash(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  requireRole(actor, ['OWNER']);
  const body = await readJsonObject(request),
    recordType = retainedRecordType(body.recordType),
    id = getRequiredString(body, 'recordId'),
    record = await retainedRecord(env, recordType, id);
  if (record.deleted_at || record.status === 'TRASHED')
    throw new HttpError(409, 'Record is already in trash.');
  if (record.purged_at) throw new HttpError(409, 'Record purge is pending.');
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE ${tables[recordType]} SET status='TRASHED',deleted_at=?,updated_at=? WHERE id=?`,
  )
    .bind(now, now, id)
    .run();
  await writeAudit(
    env,
    actor,
    'RECORD_TRASHED',
    recordType,
    id,
    'Record moved to trash.',
    record.business_activity_id,
    { previousStatus: record.status },
  );
  return json({
    record: { id, recordType, status: 'TRASHED', deletedAt: now },
  });
}

export async function restoreFromTrash(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  requireRole(actor, ['OWNER']);
  const body = await readJsonObject(request),
    recordType = retainedRecordType(body.recordType),
    id = getRequiredString(body, 'recordId'),
    record = await retainedRecord(env, recordType, id);
  if (!record.deleted_at || record.status !== 'TRASHED')
    throw new HttpError(409, 'Only trashed records can be restored.');
  if (record.purged_at)
    throw new HttpError(409, 'A pending purge cannot be restored.');
  const prior = await env.DB.prepare(
    `SELECT changed_fields_json FROM audit_log WHERE entity_type=? AND entity_id=? AND action='RECORD_TRASHED' ORDER BY created_at DESC,id DESC LIMIT 1`,
  )
    .bind(recordType, id)
    .first<{ changed_fields_json: string | null }>();
  let status = 'NEW';
  try {
    const value = parsedObject(
      prior?.changed_fields_json ?? null,
    )?.previousStatus;
    if (
      typeof value === 'string' &&
      [
        'NEW',
        'MISSING_INFORMATION',
        'READY_FOR_REVIEW',
        'REVIEWED',
        'PROCESSED',
        'VOIDED',
      ].includes(value)
    )
      status = value;
  } catch {
    status = 'NEW';
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE ${tables[recordType]} SET status=?,deleted_at=NULL,updated_at=? WHERE id=?`,
  )
    .bind(status, now, id)
    .run();
  await writeAudit(
    env,
    actor,
    'RECORD_RESTORED',
    recordType,
    id,
    `Record restored with ${status} status.`,
    record.business_activity_id,
  );
  return json({ record: { id, recordType, status } });
}

export async function purgeFromTrash(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  requireRole(actor, ['OWNER']);
  const body = await readJsonObject(request),
    recordType = retainedRecordType(body.recordType),
    id = getRequiredString(body, 'recordId'),
    record = await retainedRecord(env, recordType, id);
  if (!record.deleted_at || record.status !== 'TRASHED')
    throw new HttpError(409, 'Only trashed records can be purged.');
  if (!isPurgeEligible(record.purge_eligible_at))
    throw new HttpError(
      409,
      'Retention has not expired; permanent deletion is blocked.',
    );
  if (body.confirmation !== 'PERMANENTLY DELETE')
    throw new HttpError(
      400,
      'Explicit permanent deletion confirmation is required.',
    );
  if (recordType === 'EXPENSE') {
    const linked = await env.DB.prepare(
      'SELECT id FROM work_sessions WHERE starting_fuel_expense_id=? OR ending_fuel_expense_id=? LIMIT 1',
    )
      .bind(id, id)
      .first();
    if (linked)
      throw new HttpError(409, 'A work session still references this expense.');
  }
  const attachments = await env.DB.prepare(
    'SELECT object_key FROM attachments WHERE record_type=? AND record_id=?',
  )
    .bind(recordType, id)
    .all<{ object_key: string }>();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE ${tables[recordType]} SET purged_at=?,updated_at=? WHERE id=?`,
    ).bind(now, now, id),
    env.DB.prepare(
      'UPDATE attachments SET purged_at=? WHERE record_type=? AND record_id=?',
    ).bind(now, recordType, id),
  ]);
  await Promise.all(
    attachments.results.map(({ object_key }) =>
      env.DOCUMENTS.delete(object_key),
    ),
  );
  const statements = [
    env.DB.prepare(
      'DELETE FROM comments WHERE record_type=? AND record_id=?',
    ).bind(recordType, id),
    env.DB.prepare(
      'DELETE FROM attachments WHERE record_type=? AND record_id=?',
    ).bind(recordType, id),
  ];
  if (recordType === 'EXPENSE')
    statements.push(
      env.DB.prepare('DELETE FROM expense_allocations WHERE expense_id=?').bind(
        id,
      ),
      env.DB.prepare(
        'DELETE FROM fuel_expense_details WHERE expense_id=?',
      ).bind(id),
      env.DB.prepare(
        'DELETE FROM parking_expense_details WHERE expense_id=?',
      ).bind(id),
      env.DB.prepare(
        'DELETE FROM insurance_expense_details WHERE expense_id=?',
      ).bind(id),
    );
  if (recordType === 'INCOME')
    statements.push(
      env.DB.prepare(
        'DELETE FROM income_reconciliations WHERE income_id=?',
      ).bind(id),
      env.DB.prepare(
        'DELETE FROM platform_income_details WHERE income_id=?',
      ).bind(id),
      env.DB.prepare(
        'DELETE FROM contract_income_details WHERE income_id=?',
      ).bind(id),
      env.DB.prepare(
        'DELETE FROM subscription_income_details WHERE income_id=?',
      ).bind(id),
    );
  statements.push(
    env.DB.prepare(`DELETE FROM ${tables[recordType]} WHERE id=?`).bind(id),
  );
  await env.DB.batch(statements);
  await writeAudit(
    env,
    actor,
    'RECORD_PURGED',
    recordType,
    id,
    'Retention-approved permanent purge completed.',
    record.business_activity_id,
  );
  return json({ purged: { id, recordType, purgedAt: now } });
}

export async function getRetentionSettings(request: Request, env: Env) {
  await requireUser(request, env);
  const row = await env.DB.prepare(
    'SELECT retention_tax_years,tax_year_end_month,tax_year_end_day,backup_reminder_days,updated_at FROM retention_settings WHERE singleton_id=1',
  ).first<{
    retention_tax_years: number;
    tax_year_end_month: number;
    tax_year_end_day: number;
    backup_reminder_days: number;
    updated_at: string;
  }>();
  if (!row) throw new HttpError(500, 'Retention settings are unavailable.');
  return json({
    retentionSettings: {
      retentionTaxYears: row.retention_tax_years,
      taxYearEndMonth: row.tax_year_end_month,
      taxYearEndDay: row.tax_year_end_day,
      backupReminderDays: row.backup_reminder_days,
      updatedAt: row.updated_at,
    },
  });
}

export async function updateRetentionSettings(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  requireRole(actor, ['OWNER']);
  const values = retentionSettingsValues(await readJsonObject(request));
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE retention_settings SET retention_tax_years=?,tax_year_end_month=?,tax_year_end_day=?,backup_reminder_days=?,updated_by=?,updated_at=? WHERE singleton_id=1`,
  )
    .bind(
      values.retentionTaxYears,
      values.taxYearEndMonth,
      values.taxYearEndDay,
      values.backupReminderDays,
      actor.id,
      now,
    )
    .run();
  await writeAudit(
    env,
    actor,
    'RETENTION_SETTINGS_CHANGED',
    'RETENTION_SETTINGS',
    '1',
    'Retention settings changed for future record calculations.',
  );
  return json({ retentionSettings: { ...values, updatedAt: now } });
}
