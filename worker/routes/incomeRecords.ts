import { requireRole, requireUser } from '../auth/authorization';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { writeAudit } from '../services/auditService';
import {
  incomeValues,
  reconciliationValues,
  type ContractValues,
  type IncomeType,
  type IncomeValues,
  type PlatformValues,
  type SubscriptionValues,
} from '../services/incomeService';
import { calculateRetentionDate } from '../services/workSessionService';
import type { Env } from '../types';

interface IncomeRow {
  id: string;
  business_activity_id: string;
  activity_name: string;
  income_type: IncomeType;
  received_from: string | null;
  transaction_date: string;
  total_amount_minor: number;
  currency: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  provider_name: string | null;
  platform_period_start: string | null;
  platform_period_end: string | null;
  payment_date: string | null;
  gross_earnings_minor: number | null;
  tips_minor: number | null;
  bonuses_promotions_minor: number | null;
  flat_rate_credit_minor: number | null;
  platform_fees_minor: number | null;
  other_adjustments_minor: number | null;
  platform_net_minor: number | null;
  client_id: string | null;
  client_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  service_period_start: string | null;
  service_period_end: string | null;
  subtotal_minor: number | null;
  contract_gst_minor: number | null;
  contract_total_minor: number | null;
  due_date: string | null;
  payment_received_date: string | null;
  amount_received_minor: number | null;
  payment_status: ContractValues['paymentStatus'] | null;
  subscription_period_start: string | null;
  subscription_period_end: string | null;
  gross_subscription_revenue_minor: number | null;
  refunds_minor: number | null;
  subscription_platform_fees_minor: number | null;
  payment_processing_fees_minor: number | null;
  subscription_net_minor: number | null;
  subscriber_count: number | null;
  new_subscribers: number | null;
  cancelled_subscribers: number | null;
  reconciliation_id: string | null;
  expected_amount_minor: number | null;
  actual_amount_minor: number | null;
  difference_amount_minor: number | null;
  matched: number | null;
  reconciliation_notes: string | null;
  reconciler_email: string | null;
}
interface Settings {
  retention_tax_years: number;
  tax_year_end_month: number;
  tax_year_end_day: number;
}

const select = `SELECT income_records.id, income_records.business_activity_id,
  business_activities.name AS activity_name, income_records.income_type,
  income_records.received_from, income_records.transaction_date,
  income_records.total_amount_minor, income_records.currency, income_records.status,
  income_records.notes, income_records.created_at, income_records.updated_at,
  platform_income_details.provider_name, platform_income_details.period_start AS platform_period_start,
  platform_income_details.period_end AS platform_period_end, platform_income_details.payment_date,
  platform_income_details.gross_earnings_minor, platform_income_details.tips_minor,
  platform_income_details.bonuses_promotions_minor, platform_income_details.flat_rate_credit_minor,
  platform_income_details.platform_fees_minor, platform_income_details.other_adjustments_minor,
  platform_income_details.net_payment_received_minor AS platform_net_minor,
  contract_income_details.client_id, clients.name AS client_name, contract_income_details.invoice_number,
  contract_income_details.invoice_date, contract_income_details.service_period_start,
  contract_income_details.service_period_end, contract_income_details.subtotal_minor,
  contract_income_details.gst_amount_minor AS contract_gst_minor,
  contract_income_details.total_minor AS contract_total_minor, contract_income_details.due_date,
  contract_income_details.payment_received_date, contract_income_details.amount_received_minor,
  contract_income_details.payment_status,
  subscription_income_details.period_start AS subscription_period_start,
  subscription_income_details.period_end AS subscription_period_end,
  subscription_income_details.gross_subscription_revenue_minor,
  subscription_income_details.refunds_minor,
  subscription_income_details.platform_fees_minor AS subscription_platform_fees_minor,
  subscription_income_details.payment_processing_fees_minor,
  subscription_income_details.net_payment_received_minor AS subscription_net_minor,
  subscription_income_details.subscriber_count, subscription_income_details.new_subscribers,
  subscription_income_details.cancelled_subscribers,
  income_reconciliations.id AS reconciliation_id, income_reconciliations.expected_amount_minor,
  income_reconciliations.actual_amount_minor, income_reconciliations.difference_amount_minor,
  income_reconciliations.matched, income_reconciliations.notes AS reconciliation_notes,
  reconcilers.email AS reconciler_email
  FROM income_records
  JOIN business_activities ON business_activities.id = income_records.business_activity_id
  LEFT JOIN platform_income_details ON platform_income_details.income_id = income_records.id
  LEFT JOIN contract_income_details ON contract_income_details.income_id = income_records.id
  LEFT JOIN clients ON clients.id = contract_income_details.client_id
  LEFT JOIN subscription_income_details ON subscription_income_details.income_id = income_records.id
  LEFT JOIN income_reconciliations ON income_reconciliations.id = (
    SELECT latest.id FROM income_reconciliations AS latest
    WHERE latest.income_id = income_records.id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1)
  LEFT JOIN users AS reconcilers ON reconcilers.id = income_reconciliations.reconciled_by`;

function serialize(row: IncomeRow) {
  const common = {
    id: row.id,
    businessActivityId: row.business_activity_id,
    activityName: row.activity_name,
    incomeType: row.income_type,
    receivedFrom: row.received_from,
    transactionDate: row.transaction_date,
    totalAmountMinor: row.total_amount_minor,
    currency: row.currency,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reconciliation: row.reconciliation_id
      ? {
          id: row.reconciliation_id,
          expectedAmountMinor: row.expected_amount_minor,
          actualAmountMinor: row.actual_amount_minor,
          differenceAmountMinor: row.difference_amount_minor,
          matched: row.matched === 1,
          notes: row.reconciliation_notes,
          reconcilerEmail: row.reconciler_email,
        }
      : null,
  };
  if (row.income_type === 'PLATFORM')
    return {
      ...common,
      details: {
        providerName: row.provider_name,
        periodStart: row.platform_period_start,
        periodEnd: row.platform_period_end,
        paymentDate: row.payment_date,
        grossEarningsMinor: row.gross_earnings_minor,
        tipsMinor: row.tips_minor,
        bonusesPromotionsMinor: row.bonuses_promotions_minor,
        flatRateCreditMinor: row.flat_rate_credit_minor,
        platformFeesMinor: row.platform_fees_minor,
        otherAdjustmentsMinor: row.other_adjustments_minor,
        netPaymentReceivedMinor: row.platform_net_minor,
      },
    };
  if (row.income_type === 'CONTRACT')
    return {
      ...common,
      details: {
        clientId: row.client_id,
        clientName: row.client_name,
        invoiceNumber: row.invoice_number,
        invoiceDate: row.invoice_date,
        servicePeriodStart: row.service_period_start,
        servicePeriodEnd: row.service_period_end,
        subtotalMinor: row.subtotal_minor,
        gstAmountMinor: row.contract_gst_minor,
        totalMinor: row.contract_total_minor,
        dueDate: row.due_date,
        paymentReceivedDate: row.payment_received_date,
        amountReceivedMinor: row.amount_received_minor,
        paymentStatus: row.payment_status,
        outstandingAmountMinor:
          (row.contract_total_minor ?? 0) - (row.amount_received_minor ?? 0),
      },
    };
  if (row.income_type === 'SUBSCRIPTION')
    return {
      ...common,
      details: {
        periodStart: row.subscription_period_start,
        periodEnd: row.subscription_period_end,
        grossSubscriptionRevenueMinor: row.gross_subscription_revenue_minor,
        refundsMinor: row.refunds_minor,
        platformFeesMinor: row.subscription_platform_fees_minor,
        paymentProcessingFeesMinor: row.payment_processing_fees_minor,
        netPaymentReceivedMinor: row.subscription_net_minor,
        subscriberCount: row.subscriber_count,
        newSubscribers: row.new_subscribers,
        cancelledSubscribers: row.cancelled_subscribers,
      },
    };
  return { ...common, details: null };
}

function current(row: IncomeRow): IncomeValues {
  const common = {
    businessActivityId: row.business_activity_id,
    incomeType: row.income_type,
    receivedFrom: row.received_from,
    transactionDate: row.transaction_date,
    totalAmountMinor: row.total_amount_minor,
    currency: row.currency,
    notes: row.notes,
  };
  if (row.income_type === 'PLATFORM')
    return {
      ...common,
      providerName: row.provider_name!,
      periodStart: row.platform_period_start!,
      periodEnd: row.platform_period_end!,
      paymentDate: row.payment_date!,
      grossEarningsMinor: row.gross_earnings_minor!,
      tipsMinor: row.tips_minor!,
      bonusesPromotionsMinor: row.bonuses_promotions_minor!,
      flatRateCreditMinor: row.flat_rate_credit_minor!,
      platformFeesMinor: row.platform_fees_minor!,
      otherAdjustmentsMinor: row.other_adjustments_minor!,
      netPaymentReceivedMinor: row.platform_net_minor!,
    };
  if (row.income_type === 'CONTRACT')
    return {
      ...common,
      clientId: row.client_id!,
      invoiceNumber: row.invoice_number!,
      invoiceDate: row.invoice_date!,
      servicePeriodStart: row.service_period_start,
      servicePeriodEnd: row.service_period_end,
      subtotalMinor: row.subtotal_minor!,
      gstAmountMinor: row.contract_gst_minor,
      totalMinor: row.contract_total_minor!,
      dueDate: row.due_date,
      paymentReceivedDate: row.payment_received_date,
      amountReceivedMinor: row.amount_received_minor,
      paymentStatus: row.payment_status!,
    };
  if (row.income_type === 'SUBSCRIPTION')
    return {
      ...common,
      periodStart: row.subscription_period_start!,
      periodEnd: row.subscription_period_end!,
      grossSubscriptionRevenueMinor: row.gross_subscription_revenue_minor!,
      refundsMinor: row.refunds_minor!,
      platformFeesMinor: row.subscription_platform_fees_minor!,
      paymentProcessingFeesMinor: row.payment_processing_fees_minor!,
      netPaymentReceivedMinor: row.subscription_net_minor!,
      subscriberCount: row.subscriber_count,
      newSubscribers: row.new_subscribers,
      cancelledSubscribers: row.cancelled_subscribers,
    };
  return common;
}
async function retention(env: Env, date: string) {
  const row = await env.DB.prepare(
    'SELECT retention_tax_years, tax_year_end_month, tax_year_end_day FROM retention_settings WHERE singleton_id = 1',
  ).first<Settings>();
  if (!row) throw new HttpError(503, 'Retention settings are unavailable.');
  return calculateRetentionDate(
    `${date}T12:00:00.000+12:00`,
    row.retention_tax_years,
    row.tax_year_end_month,
    row.tax_year_end_day,
  );
}
async function references(env: Env, values: IncomeValues, prior?: IncomeRow) {
  const activity = await env.DB.prepare(
    'SELECT active FROM business_activities WHERE id = ?',
  )
    .bind(values.businessActivityId)
    .first<{ active: number }>();
  if (
    !activity ||
    (!activity.active &&
      prior?.business_activity_id !== values.businessActivityId)
  )
    throw new HttpError(400, 'Select an active business activity.');
  if (values.incomeType === 'CONTRACT') {
    const client = await env.DB.prepare(
      'SELECT active FROM clients WHERE id = ?',
    )
      .bind((values as ContractValues).clientId)
      .first<{ active: number }>();
    if (
      !client ||
      (!client.active &&
        prior?.client_id !== (values as ContractValues).clientId)
    )
      throw new HttpError(400, 'Select an active client.');
  }
}
function baseInsert(
  env: Env,
  id: string,
  values: IncomeValues,
  creator: string,
  now: string,
  until: string,
) {
  return env.DB.prepare(
    `INSERT INTO income_records (id, business_activity_id, income_type, received_from, transaction_date, total_amount_minor, currency, status, notes, created_by, created_at, updated_at, retention_until, purge_eligible_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    values.businessActivityId,
    values.incomeType,
    values.receivedFrom,
    values.transactionDate,
    values.totalAmountMinor,
    values.currency,
    values.notes,
    creator,
    now,
    now,
    until,
    until,
  );
}
function detailInsert(env: Env, id: string, values: IncomeValues) {
  if (values.incomeType === 'PLATFORM') {
    const v = values as PlatformValues;
    return env.DB.prepare(
      'INSERT INTO platform_income_details (income_id, provider_name, period_start, period_end, payment_date, gross_earnings_minor, tips_minor, bonuses_promotions_minor, flat_rate_credit_minor, platform_fees_minor, other_adjustments_minor, net_payment_received_minor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      id,
      v.providerName,
      v.periodStart,
      v.periodEnd,
      v.paymentDate,
      v.grossEarningsMinor,
      v.tipsMinor,
      v.bonusesPromotionsMinor,
      v.flatRateCreditMinor,
      v.platformFeesMinor,
      v.otherAdjustmentsMinor,
      v.netPaymentReceivedMinor,
    );
  }
  if (values.incomeType === 'CONTRACT') {
    const v = values as ContractValues;
    return env.DB.prepare(
      'INSERT INTO contract_income_details (income_id, client_id, invoice_number, invoice_date, service_period_start, service_period_end, subtotal_minor, gst_amount_minor, total_minor, due_date, payment_received_date, amount_received_minor, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      id,
      v.clientId,
      v.invoiceNumber,
      v.invoiceDate,
      v.servicePeriodStart,
      v.servicePeriodEnd,
      v.subtotalMinor,
      v.gstAmountMinor,
      v.totalMinor,
      v.dueDate,
      v.paymentReceivedDate,
      v.amountReceivedMinor,
      v.paymentStatus,
    );
  }
  if (values.incomeType === 'SUBSCRIPTION') {
    const v = values as SubscriptionValues;
    return env.DB.prepare(
      'INSERT INTO subscription_income_details (income_id, period_start, period_end, gross_subscription_revenue_minor, refunds_minor, platform_fees_minor, payment_processing_fees_minor, net_payment_received_minor, subscriber_count, new_subscribers, cancelled_subscribers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      id,
      v.periodStart,
      v.periodEnd,
      v.grossSubscriptionRevenueMinor,
      v.refundsMinor,
      v.platformFeesMinor,
      v.paymentProcessingFeesMinor,
      v.netPaymentReceivedMinor,
      v.subscriberCount,
      v.newSubscribers,
      v.cancelledSubscribers,
    );
  }
  return null;
}
function detailUpdate(env: Env, id: string, values: IncomeValues) {
  if (values.incomeType === 'PLATFORM') {
    const v = values as PlatformValues;
    return env.DB.prepare(
      'UPDATE platform_income_details SET provider_name=?, period_start=?, period_end=?, payment_date=?, gross_earnings_minor=?, tips_minor=?, bonuses_promotions_minor=?, flat_rate_credit_minor=?, platform_fees_minor=?, other_adjustments_minor=?, net_payment_received_minor=? WHERE income_id=?',
    ).bind(
      v.providerName,
      v.periodStart,
      v.periodEnd,
      v.paymentDate,
      v.grossEarningsMinor,
      v.tipsMinor,
      v.bonusesPromotionsMinor,
      v.flatRateCreditMinor,
      v.platformFeesMinor,
      v.otherAdjustmentsMinor,
      v.netPaymentReceivedMinor,
      id,
    );
  }
  if (values.incomeType === 'CONTRACT') {
    const v = values as ContractValues;
    return env.DB.prepare(
      'UPDATE contract_income_details SET client_id=?, invoice_number=?, invoice_date=?, service_period_start=?, service_period_end=?, subtotal_minor=?, gst_amount_minor=?, total_minor=?, due_date=?, payment_received_date=?, amount_received_minor=?, payment_status=? WHERE income_id=?',
    ).bind(
      v.clientId,
      v.invoiceNumber,
      v.invoiceDate,
      v.servicePeriodStart,
      v.servicePeriodEnd,
      v.subtotalMinor,
      v.gstAmountMinor,
      v.totalMinor,
      v.dueDate,
      v.paymentReceivedDate,
      v.amountReceivedMinor,
      v.paymentStatus,
      id,
    );
  }
  if (values.incomeType === 'SUBSCRIPTION') {
    const v = values as SubscriptionValues;
    return env.DB.prepare(
      'UPDATE subscription_income_details SET period_start=?, period_end=?, gross_subscription_revenue_minor=?, refunds_minor=?, platform_fees_minor=?, payment_processing_fees_minor=?, net_payment_received_minor=?, subscriber_count=?, new_subscribers=?, cancelled_subscribers=? WHERE income_id=?',
    ).bind(
      v.periodStart,
      v.periodEnd,
      v.grossSubscriptionRevenueMinor,
      v.refundsMinor,
      v.platformFeesMinor,
      v.paymentProcessingFeesMinor,
      v.netPaymentReceivedMinor,
      v.subscriberCount,
      v.newSubscribers,
      v.cancelledSubscribers,
      id,
    );
  }
  return null;
}

export async function listIncomeRecords(request: Request, env: Env) {
  await requireUser(request, env);
  const rows = await env.DB.prepare(
    `${select} WHERE income_records.deleted_at IS NULL ORDER BY income_records.transaction_date DESC, income_records.created_at DESC`,
  ).all<IncomeRow>();
  const totals = new Map<string, number>();
  for (const row of rows.results)
    totals.set(
      row.currency,
      (totals.get(row.currency) ?? 0) + row.total_amount_minor,
    );
  return json({
    incomeRecords: rows.results.map(serialize),
    summary: {
      recordCount: rows.results.length,
      totalsByCurrency: [...totals].map(([currency, totalAmountMinor]) => ({
        currency,
        totalAmountMinor,
      })),
    },
  });
}
export async function createIncomeRecord(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const values = incomeValues(body);
  await references(env, values);
  if (values.incomeType === 'CONTRACT') {
    const duplicate = await env.DB.prepare(
      'SELECT income_id FROM contract_income_details WHERE client_id=? AND invoice_number=?',
    )
      .bind(
        (values as ContractValues).clientId,
        (values as ContractValues).invoiceNumber,
      )
      .first();
    if (duplicate)
      throw new HttpError(
        409,
        'This client already has an invoice with that number.',
      );
  }
  const id = crypto.randomUUID(),
    now = new Date().toISOString(),
    until = await retention(env, values.transactionDate);
  const detail = detailInsert(env, id, values);
  const statements = [
    baseInsert(env, id, values, owner.id, now, until),
    ...(detail ? [detail] : []),
  ];
  await env.DB.batch(statements);
  await writeAudit(
    env,
    owner,
    'INCOME_CREATED',
    'INCOME',
    id,
    `${values.incomeType} income created.`,
    values.businessActivityId,
  );
  const row = await env.DB.prepare(`${select} WHERE income_records.id=?`)
    .bind(id)
    .first<IncomeRow>();
  if (!row) throw new HttpError(500, 'Income record could not be loaded.');
  return json({ incomeRecord: serialize(row) }, { status: 201 });
}
export async function updateIncomeRecord(request: Request, env: Env) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const body = await readJsonObject(request);
  const id = getRequiredString(body, 'id');
  const row = await env.DB.prepare(`${select} WHERE income_records.id=?`)
    .bind(id)
    .first<IncomeRow>();
  if (!row) throw new HttpError(404, 'Income record not found.');
  const values = incomeValues(body, current(row));
  await references(env, values, row);
  if (values.incomeType === 'CONTRACT') {
    const v = values as ContractValues;
    const duplicate = await env.DB.prepare(
      'SELECT income_id FROM contract_income_details WHERE client_id=? AND invoice_number=? AND income_id != ?',
    )
      .bind(v.clientId, v.invoiceNumber, id)
      .first();
    if (duplicate)
      throw new HttpError(
        409,
        'This client already has an invoice with that number.',
      );
  }
  const now = new Date().toISOString(),
    until = await retention(env, values.transactionDate);
  const detail = detailUpdate(env, id, values);
  const statements = [
    env.DB.prepare(
      'UPDATE income_records SET business_activity_id=?, received_from=?, transaction_date=?, total_amount_minor=?, currency=?, notes=?, updated_at=?, retention_until=?, purge_eligible_at=? WHERE id=?',
    ).bind(
      values.businessActivityId,
      values.receivedFrom,
      values.transactionDate,
      values.totalAmountMinor,
      values.currency,
      values.notes,
      now,
      until,
      until,
      id,
    ),
    ...(detail ? [detail] : []),
  ];
  await env.DB.batch(statements);
  await writeAudit(
    env,
    owner,
    'INCOME_UPDATED',
    'INCOME',
    id,
    `${values.incomeType} income updated.`,
    values.businessActivityId,
  );
  const updated = await env.DB.prepare(`${select} WHERE income_records.id=?`)
    .bind(id)
    .first<IncomeRow>();
  if (!updated) throw new HttpError(500, 'Income record could not be loaded.');
  return json({ incomeRecord: serialize(updated) });
}
export async function reconcileIncome(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  requireRole(actor, ['OWNER', 'ACCOUNTANT']);
  const body = await readJsonObject(request);
  const incomeId = getRequiredString(body, 'incomeId');
  const row = await env.DB.prepare(
    'SELECT id,business_activity_id FROM income_records WHERE id=? AND deleted_at IS NULL',
  )
    .bind(incomeId)
    .first<{ id: string; business_activity_id: string }>();
  if (!row) throw new HttpError(404, 'Income record not found.');
  const values = reconciliationValues(body);
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO income_reconciliations (id,income_id,expected_amount_minor,actual_amount_minor,matched,notes,reconciled_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      id,
      incomeId,
      values.expectedAmountMinor,
      values.actualAmountMinor,
      values.matched ? 1 : 0,
      values.notes,
      actor.id,
      now,
      now,
    )
    .run();
  await writeAudit(
    env,
    actor,
    'INCOME_RECONCILED',
    'INCOME',
    incomeId,
    `Reconciled expected ${values.expectedAmountMinor} against actual ${values.actualAmountMinor} minor units.`,
    row.business_activity_id,
  );
  const updated = await env.DB.prepare(`${select} WHERE income_records.id=?`)
    .bind(incomeId)
    .first<IncomeRow>();
  if (!updated) throw new HttpError(500, 'Income record could not be loaded.');
  return json({ incomeRecord: serialize(updated) });
}
