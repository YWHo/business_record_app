import { requireUser } from '../auth/authorization';
import { HttpError, json } from '../lib/http';
import { sha256Hex } from '../services/attachmentService';
import { writeAudit } from '../services/auditService';
import {
  backupDue,
  csvDocument,
  exportPeriod,
  safeArchiveName,
  storedZip,
  type ZipEntry,
} from '../services/exportService';
import type { Env } from '../types';

interface RetentionSettingsRow {
  retention_tax_years: number;
  tax_year_end_month: number;
  tax_year_end_day: number;
  backup_reminder_days: number;
}
interface AttachmentExportRow {
  id: string;
  record_type: 'EXPENSE' | 'INCOME' | 'WORK_SESSION';
  record_id: string;
  version_group_id: string;
  version_number: number;
  original_filename: string;
  object_key: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  created_at: string;
  display_rotation_degrees: number;
}

const encoder = new TextEncoder();
const html = (value: unknown) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function dateClause(column: string, from: string | null, to: string | null) {
  return from && to
    ? {
        sql: ` AND substr(${column},1,10) BETWEEN ? AND ?`,
        bindings: [from, to],
      }
    : { sql: '', bindings: [] };
}

const columns = (keys: string[]) => keys.map((key) => ({ key }));

async function textFile(path: string, contents: string) {
  const bytes = encoder.encode(contents);
  return {
    entry: {
      path,
      size: bytes.byteLength,
      load: () => Promise.resolve(bytes),
    } satisfies ZipEntry,
    manifest: {
      path,
      size: bytes.byteLength,
      sha256: await sha256Hex(bytes),
      kind: 'GENERATED',
    },
  };
}

export async function exportStatus(request: Request, env: Env) {
  await requireUser(request, env);
  const settings = await env.DB.prepare(
    'SELECT backup_reminder_days FROM retention_settings WHERE singleton_id=1',
  ).first<{ backup_reminder_days: number }>();
  const latest = await env.DB.prepare(
    `SELECT export_history.id,export_history.export_scope,export_history.period_key,
      export_history.expected_record_count,export_history.expected_attachment_count,
      export_history.completed_at,users.email AS requested_by_email
     FROM export_history JOIN users ON users.id=export_history.requested_by
     ORDER BY export_history.completed_at DESC LIMIT 20`,
  ).all<{
    id: string;
    export_scope: string;
    period_key: string | null;
    expected_record_count: number;
    expected_attachment_count: number;
    completed_at: string;
    requested_by_email: string;
  }>();
  const last = latest.results[0]?.completed_at ?? null;
  const reminderDays = settings?.backup_reminder_days ?? 30;
  return json({
    backup: {
      reminderDays,
      lastSuccessfulExportAt: last,
      due: backupDue(last, reminderDays),
    },
    exports: latest.results.map((row) => ({
      id: row.id,
      scope: row.export_scope,
      periodKey: row.period_key,
      expectedRecordCount: row.expected_record_count,
      expectedAttachmentCount: row.expected_attachment_count,
      completedAt: row.completed_at,
      requestedByEmail: row.requested_by_email,
    })),
  });
}

export async function downloadExport(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const settings = await env.DB.prepare(
    `SELECT retention_tax_years,tax_year_end_month,tax_year_end_day,backup_reminder_days
     FROM retention_settings WHERE singleton_id=1`,
  ).first<RetentionSettingsRow>();
  if (!settings)
    throw new HttpError(500, 'Retention settings are unavailable.');
  const url = new URL(request.url);
  const period = exportPeriod(
    url.searchParams.get('scope'),
    url.searchParams.get('month'),
    url.searchParams.get('taxYear'),
    settings.tax_year_end_month,
    settings.tax_year_end_day,
  );
  const expenseDate = dateClause(
    'expenses.purchase_datetime',
    period.from,
    period.to,
  );
  const incomeDate = dateClause(
    'income_records.transaction_date',
    period.from,
    period.to,
  );
  const sessionDate = dateClause(
    'work_sessions.started_at',
    period.from,
    period.to,
  );
  const auditDate = dateClause('audit_log.created_at', period.from, period.to);
  const [expenses, income, sessions, fuel, parking, insurance, audit] =
    await Promise.all([
      env.DB.prepare(
        `SELECT expenses.id,'EXPENSE' AS record_type,expenses.expense_type AS subtype,
        substr(expenses.purchase_datetime,1,10) AS transaction_date,expenses.business_activity_id,
        business_activities.name AS activity_name,expenses.expense_category_id,
        expense_categories.name AS category_name,expenses.merchant_name AS counterparty,
        expenses.total_amount_minor,expenses.currency,expenses.gst_amount_minor,expenses.gst_status,
        expenses.description,expenses.recurrence_type,expenses.status,expenses.created_at,
        creators.email AS created_by_email,reviewers.email AS reviewed_by_email,expenses.reviewed_at,
        expenses.updated_at,expenses.deleted_at,expenses.retention_until,expenses.purge_eligible_at
       FROM expenses LEFT JOIN business_activities ON business_activities.id=expenses.business_activity_id
       LEFT JOIN expense_categories ON expense_categories.id=expenses.expense_category_id
       JOIN users AS creators ON creators.id=expenses.created_by
       LEFT JOIN users AS reviewers ON reviewers.id=expenses.reviewed_by
       WHERE expenses.purged_at IS NULL${expenseDate.sql} ORDER BY expenses.purchase_datetime,expenses.id`,
      )
        .bind(...expenseDate.bindings)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT income_records.id,'INCOME' AS record_type,income_records.income_type AS subtype,
        income_records.transaction_date,income_records.business_activity_id,business_activities.name AS activity_name,
        COALESCE(platform_income_details.provider_name,clients.name,income_records.received_from) AS counterparty,
        income_records.total_amount_minor,income_records.currency,
        income_records.status,income_records.notes,income_records.created_at,income_records.updated_at,
        creators.email AS created_by_email,reviewers.email AS reviewed_by_email,income_records.reviewed_at,
        income_records.deleted_at,income_records.retention_until,income_records.purge_eligible_at,
        platform_income_details.provider_name,platform_income_details.period_start AS platform_period_start,
        platform_income_details.period_end AS platform_period_end,platform_income_details.payment_date,
        platform_income_details.gross_earnings_minor,platform_income_details.tips_minor,
        platform_income_details.bonuses_promotions_minor,platform_income_details.flat_rate_credit_minor,
        platform_income_details.platform_fees_minor AS platform_income_fees_minor,
        platform_income_details.other_adjustments_minor,platform_income_details.net_payment_received_minor AS platform_net_payment_minor,
        contract_income_details.client_id,clients.name AS client_name,contract_income_details.invoice_number,
        contract_income_details.invoice_date,contract_income_details.service_period_start,
        contract_income_details.service_period_end,contract_income_details.subtotal_minor,
        contract_income_details.gst_amount_minor AS contract_gst_amount_minor,contract_income_details.total_minor,
        contract_income_details.due_date,contract_income_details.payment_received_date,
        contract_income_details.amount_received_minor,contract_income_details.payment_status,
        subscription_income_details.period_start AS subscription_period_start,
        subscription_income_details.period_end AS subscription_period_end,
        subscription_income_details.gross_subscription_revenue_minor,subscription_income_details.refunds_minor,
        subscription_income_details.platform_fees_minor AS subscription_platform_fees_minor,
        subscription_income_details.payment_processing_fees_minor,
        subscription_income_details.net_payment_received_minor AS subscription_net_payment_minor,
        subscription_income_details.subscriber_count,subscription_income_details.new_subscribers,
        subscription_income_details.cancelled_subscribers
       FROM income_records JOIN business_activities ON business_activities.id=income_records.business_activity_id
       LEFT JOIN platform_income_details ON platform_income_details.income_id=income_records.id
       LEFT JOIN contract_income_details ON contract_income_details.income_id=income_records.id
       LEFT JOIN clients ON clients.id=contract_income_details.client_id
       LEFT JOIN subscription_income_details ON subscription_income_details.income_id=income_records.id
       JOIN users AS creators ON creators.id=income_records.created_by
       LEFT JOIN users AS reviewers ON reviewers.id=income_records.reviewed_by
       WHERE income_records.purged_at IS NULL${incomeDate.sql} ORDER BY income_records.transaction_date,income_records.id`,
      )
        .bind(...incomeDate.bindings)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT work_sessions.id,work_sessions.business_activity_id,business_activities.name AS activity_name,
        work_sessions.vehicle_id,vehicles.registration AS vehicle_registration,work_sessions.started_at,
        work_sessions.ended_at,work_sessions.odometer_start_km,work_sessions.odometer_end_km,
        work_sessions.distance_km,work_sessions.gross_revenue_minor,work_sessions.currency,
        work_sessions.notes,work_sessions.tank_full_at_start,work_sessions.no_personal_driving,
        work_sessions.tank_full_at_end,work_sessions.starting_fuel_expense_id,
        work_sessions.ending_fuel_expense_id,work_sessions.status,work_sessions.created_at,
        creators.email AS created_by_email,
        work_sessions.updated_at,work_sessions.deleted_at,work_sessions.retention_until,
        work_sessions.purge_eligible_at FROM work_sessions
       JOIN business_activities ON business_activities.id=work_sessions.business_activity_id
       JOIN vehicles ON vehicles.id=work_sessions.vehicle_id
       JOIN users AS creators ON creators.id=work_sessions.created_by
       WHERE work_sessions.purged_at IS NULL${sessionDate.sql} ORDER BY work_sessions.started_at,work_sessions.id`,
      )
        .bind(...sessionDate.bindings)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT expenses.id AS expense_id,expenses.purchase_datetime,expenses.merchant_name,
        expenses.total_amount_minor,expenses.currency,fuel_expense_details.vehicle_id,
        vehicles.registration AS vehicle_registration,fuel_expense_details.fuel_station,
        fuel_expense_details.fuel_price_micros_per_litre,fuel_expense_details.fuel_litres,
        fuel_expense_details.odometer_km,fuel_expense_details.fill_type,fuel_expense_details.notes
       FROM expenses JOIN fuel_expense_details ON fuel_expense_details.expense_id=expenses.id
       JOIN vehicles ON vehicles.id=fuel_expense_details.vehicle_id
       WHERE expenses.purged_at IS NULL${expenseDate.sql} ORDER BY expenses.purchase_datetime,expenses.id`,
      )
        .bind(...expenseDate.bindings)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT expenses.id AS expense_id,expenses.purchase_datetime,expenses.merchant_name,
        expenses.total_amount_minor AS premium_minor,expenses.currency,expenses.business_activity_id,
        insurance_expense_details.insurance_type,insurance_expense_details.provider,
        insurance_expense_details.policy_number,insurance_expense_details.policy_period_start,
        insurance_expense_details.policy_period_end,insurance_expense_details.vehicle_id,
        vehicles.registration AS vehicle_registration,expense_allocations.allocation_method,
        expense_allocations.percentage_basis_points,expense_allocations.allocated_amount_minor,
        expense_allocations.calculation_period_start,expense_allocations.calculation_period_end,
        expense_allocations.notes AS allocation_notes,reviewers.email AS allocation_reviewer_email
       FROM expenses JOIN insurance_expense_details ON insurance_expense_details.expense_id=expenses.id
       LEFT JOIN vehicles ON vehicles.id=insurance_expense_details.vehicle_id
       LEFT JOIN expense_allocations ON expense_allocations.expense_id=expenses.id
       LEFT JOIN users AS reviewers ON reviewers.id=expense_allocations.reviewed_by
       WHERE expenses.purged_at IS NULL${expenseDate.sql} ORDER BY expenses.purchase_datetime,expenses.id`,
      )
        .bind(...expenseDate.bindings)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT expenses.id AS expense_id,expenses.purchase_datetime,expenses.merchant_name,
        expenses.total_amount_minor,expenses.currency,parking_expense_details.vehicle_id,
        vehicles.registration AS vehicle_registration,parking_expense_details.parking_provider,
        parking_expense_details.parking_location,parking_expense_details.parking_start_datetime,
        parking_expense_details.parking_end_datetime,parking_expense_details.parking_reference
       FROM expenses JOIN parking_expense_details ON parking_expense_details.expense_id=expenses.id
       LEFT JOIN vehicles ON vehicles.id=parking_expense_details.vehicle_id
       WHERE expenses.purged_at IS NULL${expenseDate.sql} ORDER BY expenses.purchase_datetime,expenses.id`,
      )
        .bind(...expenseDate.bindings)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT audit_log.id,audit_log.created_at,users.email AS user_email,audit_log.action,
        audit_log.entity_type,audit_log.entity_id,audit_log.business_activity_id,
        business_activities.name AS activity_name,audit_log.summary,audit_log.changed_fields_json
       FROM audit_log JOIN users ON users.id=audit_log.user_id
       LEFT JOIN business_activities ON business_activities.id=audit_log.business_activity_id
       WHERE 1=1${auditDate.sql} ORDER BY audit_log.created_at,audit_log.id`,
      )
        .bind(...auditDate.bindings)
        .all<Record<string, unknown>>(),
    ]);
  const transactionRows = [...expenses.results, ...income.results].sort(
    (a, b) =>
      String(a.transaction_date).localeCompare(String(b.transaction_date)),
  );
  const recordKeys = new Set([
    ...expenses.results.map((row) => `EXPENSE:${String(row.id)}`),
    ...income.results.map((row) => `INCOME:${String(row.id)}`),
    ...sessions.results.map((row) => `WORK_SESSION:${String(row.id)}`),
  ]);
  if (transactionRows.length + sessions.results.length !== recordKeys.size)
    throw new HttpError(500, 'Export record count verification failed.');
  const incomeIds = new Set(income.results.map((row) => String(row.id)));
  const [
    reconciliations,
    commentRows,
    activities,
    vehicles,
    categories,
    clients,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT income_reconciliations.id,income_reconciliations.income_id,
          income_reconciliations.expected_amount_minor,income_reconciliations.actual_amount_minor,
          income_reconciliations.difference_amount_minor,income_reconciliations.matched,
          income_reconciliations.notes,users.email AS reconciled_by_email,
          income_reconciliations.created_at,income_reconciliations.updated_at
         FROM income_reconciliations JOIN users ON users.id=income_reconciliations.reconciled_by
         ORDER BY income_reconciliations.created_at,income_reconciliations.id`,
    ).all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT comments.id,comments.record_type,comments.record_id,users.email AS author_email,
          comments.message,comments.created_at FROM comments JOIN users ON users.id=comments.author_id
         ORDER BY comments.created_at,comments.id`,
    ).all<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT id,name,activity_type,active,started_at,ended_at,created_at,updated_at FROM business_activities ORDER BY name',
    ).all<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT id,registration,description,active,acquired_at,retired_at,notes,created_at,updated_at FROM vehicles ORDER BY registration',
    ).all<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT id,name,active,system_key,created_at,updated_at FROM expense_categories ORDER BY name',
    ).all<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT id,name,active,notes,created_at,updated_at FROM clients ORDER BY name',
    ).all<Record<string, unknown>>(),
  ]);
  const scopedReconciliations = reconciliations.results.filter((row) =>
    incomeIds.has(String(row.income_id)),
  );
  const scopedComments = commentRows.results.filter((row) =>
    recordKeys.has(`${String(row.record_type)}:${String(row.record_id)}`),
  );
  const attachmentRows = await env.DB.prepare(
    `SELECT id,record_type,record_id,version_group_id,version_number,original_filename,
      object_key,mime_type,file_size,sha256,created_at,display_rotation_degrees
      FROM attachments
     WHERE purged_at IS NULL ORDER BY record_type,record_id,version_group_id,version_number`,
  ).all<AttachmentExportRow>();
  const attachments = attachmentRows.results.filter((row) =>
    recordKeys.has(`${row.record_type}:${row.record_id}`),
  );
  const attachmentEntries: ZipEntry[] = [];
  const attachmentManifest: Array<Record<string, unknown>> = [];
  const attachmentIndex: Array<Record<string, unknown>> = [];
  for (const attachment of attachments) {
    const object = await env.DOCUMENTS.head(attachment.object_key);
    if (!object || object.size !== attachment.file_size)
      throw new HttpError(409, 'An expected source attachment is unavailable.');
    if (
      object.customMetadata?.sha256 &&
      object.customMetadata.sha256 !== attachment.sha256
    )
      throw new HttpError(
        409,
        'A source attachment failed integrity verification.',
      );
    const path = `documents/${attachment.record_type.toLowerCase()}/${attachment.record_id}/${attachment.version_group_id}/v${attachment.version_number}-${safeArchiveName(attachment.original_filename)}`;
    attachmentEntries.push({
      path,
      size: attachment.file_size,
      load: async () => {
        const stored = await env.DOCUMENTS.get(attachment.object_key);
        if (!stored)
          throw new HttpError(500, 'An attachment disappeared during export.');
        const bytes = new Uint8Array(await stored.arrayBuffer());
        if ((await sha256Hex(bytes)) !== attachment.sha256)
          throw new HttpError(500, 'An attachment changed during export.');
        return bytes;
      },
    });
    attachmentManifest.push({
      path,
      size: attachment.file_size,
      sha256: attachment.sha256,
      kind: 'SOURCE_ATTACHMENT',
    });
    attachmentIndex.push({
      attachment_id: attachment.id,
      record_type: attachment.record_type,
      record_id: attachment.record_id,
      version_group_id: attachment.version_group_id,
      version_number: attachment.version_number,
      original_filename: attachment.original_filename,
      mime_type: attachment.mime_type,
      file_size: attachment.file_size,
      sha256: attachment.sha256,
      created_at: attachment.created_at,
      display_rotation_degrees: attachment.display_rotation_degrees,
      archive_path: path,
    });
  }
  const csvFiles = [
    [
      'data/transactions.csv',
      transactionRows,
      [
        'id',
        'record_type',
        'subtype',
        'transaction_date',
        'business_activity_id',
        'activity_name',
        'expense_category_id',
        'category_name',
        'counterparty',
        'total_amount_minor',
        'currency',
        'gst_amount_minor',
        'gst_status',
        'description',
        'recurrence_type',
        'status',
        'created_at',
        'created_by_email',
        'reviewed_by_email',
        'reviewed_at',
        'updated_at',
        'deleted_at',
        'retention_until',
        'purge_eligible_at',
        'provider_name',
        'platform_period_start',
        'platform_period_end',
        'payment_date',
        'gross_earnings_minor',
        'tips_minor',
        'bonuses_promotions_minor',
        'flat_rate_credit_minor',
        'platform_income_fees_minor',
        'other_adjustments_minor',
        'platform_net_payment_minor',
        'client_id',
        'client_name',
        'invoice_number',
        'invoice_date',
        'service_period_start',
        'service_period_end',
        'subtotal_minor',
        'contract_gst_amount_minor',
        'total_minor',
        'due_date',
        'payment_received_date',
        'amount_received_minor',
        'payment_status',
        'subscription_period_start',
        'subscription_period_end',
        'gross_subscription_revenue_minor',
        'refunds_minor',
        'subscription_platform_fees_minor',
        'payment_processing_fees_minor',
        'subscription_net_payment_minor',
        'subscriber_count',
        'new_subscribers',
        'cancelled_subscribers',
      ],
    ],
    [
      'data/fuel.csv',
      fuel.results,
      [
        'expense_id',
        'purchase_datetime',
        'merchant_name',
        'total_amount_minor',
        'currency',
        'vehicle_id',
        'vehicle_registration',
        'fuel_station',
        'fuel_price_micros_per_litre',
        'fuel_litres',
        'odometer_km',
        'fill_type',
        'notes',
      ],
    ],
    [
      'data/parking.csv',
      parking.results,
      [
        'expense_id',
        'purchase_datetime',
        'merchant_name',
        'total_amount_minor',
        'currency',
        'vehicle_id',
        'vehicle_registration',
        'parking_provider',
        'parking_location',
        'parking_start_datetime',
        'parking_end_datetime',
        'parking_reference',
      ],
    ],
    [
      'data/insurance.csv',
      insurance.results,
      [
        'expense_id',
        'purchase_datetime',
        'merchant_name',
        'premium_minor',
        'currency',
        'business_activity_id',
        'insurance_type',
        'provider',
        'policy_number',
        'policy_period_start',
        'policy_period_end',
        'vehicle_id',
        'vehicle_registration',
        'allocation_method',
        'percentage_basis_points',
        'allocated_amount_minor',
        'calculation_period_start',
        'calculation_period_end',
        'allocation_notes',
        'allocation_reviewer_email',
      ],
    ],
    [
      'data/income.csv',
      income.results,
      [
        'id',
        'subtype',
        'transaction_date',
        'business_activity_id',
        'activity_name',
        'counterparty',
        'total_amount_minor',
        'currency',
        'status',
        'notes',
        'created_at',
        'created_by_email',
        'reviewed_by_email',
        'reviewed_at',
        'updated_at',
        'deleted_at',
        'retention_until',
        'purge_eligible_at',
        'provider_name',
        'platform_period_start',
        'platform_period_end',
        'payment_date',
        'gross_earnings_minor',
        'tips_minor',
        'bonuses_promotions_minor',
        'flat_rate_credit_minor',
        'platform_income_fees_minor',
        'other_adjustments_minor',
        'platform_net_payment_minor',
        'client_id',
        'client_name',
        'invoice_number',
        'invoice_date',
        'service_period_start',
        'service_period_end',
        'subtotal_minor',
        'contract_gst_amount_minor',
        'total_minor',
        'due_date',
        'payment_received_date',
        'amount_received_minor',
        'payment_status',
        'subscription_period_start',
        'subscription_period_end',
        'gross_subscription_revenue_minor',
        'refunds_minor',
        'subscription_platform_fees_minor',
        'payment_processing_fees_minor',
        'subscription_net_payment_minor',
        'subscriber_count',
        'new_subscribers',
        'cancelled_subscribers',
      ],
    ],
    [
      'data/work-sessions.csv',
      sessions.results,
      [
        'id',
        'business_activity_id',
        'activity_name',
        'vehicle_id',
        'vehicle_registration',
        'started_at',
        'ended_at',
        'odometer_start_km',
        'odometer_end_km',
        'distance_km',
        'gross_revenue_minor',
        'currency',
        'notes',
        'tank_full_at_start',
        'no_personal_driving',
        'tank_full_at_end',
        'starting_fuel_expense_id',
        'ending_fuel_expense_id',
        'status',
        'created_at',
        'created_by_email',
        'updated_at',
        'deleted_at',
        'retention_until',
        'purge_eligible_at',
      ],
    ],
    [
      'data/income-reconciliations.csv',
      scopedReconciliations,
      [
        'id',
        'income_id',
        'expected_amount_minor',
        'actual_amount_minor',
        'difference_amount_minor',
        'matched',
        'notes',
        'reconciled_by_email',
        'created_at',
        'updated_at',
      ],
    ],
    [
      'data/comments.csv',
      scopedComments,
      [
        'id',
        'record_type',
        'record_id',
        'author_email',
        'message',
        'created_at',
      ],
    ],
    [
      'data/audit-log.csv',
      audit.results,
      [
        'id',
        'created_at',
        'user_email',
        'action',
        'entity_type',
        'entity_id',
        'business_activity_id',
        'activity_name',
        'summary',
        'changed_fields_json',
      ],
    ],
    [
      'data/attachment-index.csv',
      attachmentIndex,
      [
        'attachment_id',
        'record_type',
        'record_id',
        'version_group_id',
        'version_number',
        'original_filename',
        'mime_type',
        'file_size',
        'sha256',
        'created_at',
        'display_rotation_degrees',
        'archive_path',
      ],
    ],
    [
      'data/business-activities.csv',
      activities.results,
      [
        'id',
        'name',
        'activity_type',
        'active',
        'started_at',
        'ended_at',
        'created_at',
        'updated_at',
      ],
    ],
    [
      'data/vehicles.csv',
      vehicles.results,
      [
        'id',
        'registration',
        'description',
        'active',
        'acquired_at',
        'retired_at',
        'notes',
        'created_at',
        'updated_at',
      ],
    ],
    [
      'data/expense-categories.csv',
      categories.results,
      ['id', 'name', 'active', 'system_key', 'created_at', 'updated_at'],
    ],
    [
      'data/clients.csv',
      clients.results,
      ['id', 'name', 'active', 'notes', 'created_at', 'updated_at'],
    ],
    [
      'data/retention-policy.csv',
      [
        {
          retention_tax_years: settings.retention_tax_years,
          tax_year_end_month: settings.tax_year_end_month,
          tax_year_end_day: settings.tax_year_end_day,
          backup_reminder_days: settings.backup_reminder_days,
        },
      ],
      [
        'retention_tax_years',
        'tax_year_end_month',
        'tax_year_end_day',
        'backup_reminder_days',
      ],
    ],
  ] as const;
  const generatedAt = new Date();
  const exportId = crypto.randomUUID();
  const generatedFiles = await Promise.all(
    csvFiles.map(([path, rows, keys]) =>
      textFile(path, csvDocument(rows, columns([...keys]))),
    ),
  );
  const recordCount = recordKeys.size;
  const summary = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Business records export</title><style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:3rem auto;padding:0 1rem;color:#17232b}dt{font-weight:700}dd{margin:0 0 1rem}</style></head><body><h1>Business records export</h1><p>This is a portable, read-only copy. Monetary values in CSV files are integer minor units.</p><dl><dt>Scope</dt><dd>${html(period.scope)}${period.periodKey ? ` — ${html(period.periodKey)}` : ''}</dd><dt>Period</dt><dd>${html(period.from ?? 'All retained records')} to ${html(period.to ?? 'latest')}</dd><dt>Generated</dt><dd>${html(generatedAt.toISOString())}</dd><dt>Records</dt><dd>${recordCount}</dd><dt>Source attachments</dt><dd>${attachments.length}</dd><dt>Audit events</dt><dd>${audit.results.length}</dd></dl><p>Use <code>manifest.json</code> to verify every included file. See its schema and CSV column names when implementing a future restore.</p></body></html>`;
  const summaryFile = await textFile('summary/summary.html', summary);
  generatedFiles.push(summaryFile);
  const manifest = {
    format: 'business-records-portable-export',
    schemaVersion: 1,
    exportId,
    generatedAt: generatedAt.toISOString(),
    scope: period.scope,
    periodKey: period.periodKey,
    dateFrom: period.from,
    dateTo: period.to,
    counts: {
      expectedRecordCount: recordCount,
      expectedAttachmentCount: attachments.length,
      exportedAttachmentCount: attachmentEntries.length,
      auditEventCount: audit.results.length,
    },
    units: { money: 'integer minor units', fuelPrice: 'millionths per litre' },
    files: [
      ...generatedFiles.map((file) => file.manifest),
      ...attachmentManifest,
    ],
  };
  if (
    manifest.counts.expectedAttachmentCount !==
    manifest.counts.exportedAttachmentCount
  )
    throw new HttpError(500, 'Export attachment count verification failed.');
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestFile = await textFile('manifest.json', manifestText);
  const archiveEntries = [
    ...generatedFiles.map((file) => file.entry),
    ...attachmentEntries,
    manifestFile.entry,
  ];
  const archive = storedZip(archiveEntries, generatedAt);
  await env.DB.prepare(
    `INSERT INTO export_history (id,requested_by,export_scope,period_key,expected_record_count,
      expected_attachment_count,exported_attachment_count,manifest_sha256,completed_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      exportId,
      actor.id,
      period.scope,
      period.periodKey,
      recordCount,
      attachments.length,
      attachmentEntries.length,
      manifestFile.manifest.sha256,
      generatedAt.toISOString(),
    )
    .run();
  await writeAudit(
    env,
    actor,
    'EXPORT_COMPLETED',
    'EXPORT',
    exportId,
    `${period.scope} portable export completed with ${recordCount} records and ${attachments.length} attachments.`,
  );
  const suffix = period.periodKey ?? generatedAt.toISOString().slice(0, 10);
  return new Response(archive, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="business-records-${period.scope.toLowerCase()}-${suffix}.zip"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-export-id': exportId,
      'x-export-record-count': String(recordCount),
      'x-export-attachment-count': String(attachments.length),
    },
  });
}
