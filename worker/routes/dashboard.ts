import { requireUser } from '../auth/authorization';
import { HttpError, json } from '../lib/http';
import {
  combineFinancialTotals,
  platformMetrics,
  type DashboardCostInput,
  type DashboardSessionInput,
} from '../services/dashboardService';
import { exportPeriod } from '../services/exportService';
import type { Env } from '../types';

interface SettingsRow {
  tax_year_end_month: number;
  tax_year_end_day: number;
}

function currentTaxYear(month: number, day: number) {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  const year = Number(part('year'));
  const localMonthDay = `${part('month')}-${part('day')}`;
  const yearEnd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return String(localMonthDay <= yearEnd ? year : year + 1);
}

function scopeClause(
  alias: string,
  dateColumn: string,
  from: string,
  to: string,
  activityId: string | null,
) {
  return {
    sql: `substr(${alias}.${dateColumn},1,10) BETWEEN ? AND ?${activityId ? ` AND ${alias}.business_activity_id=?` : ''}`,
    bindings: [from, to, ...(activityId ? [activityId] : [])],
  };
}

export async function dashboard(request: Request, env: Env) {
  await requireUser(request, env);
  const settings = await env.DB.prepare(
    'SELECT tax_year_end_month,tax_year_end_day FROM retention_settings WHERE singleton_id=1',
  ).first<SettingsRow>();
  if (!settings) throw new HttpError(500, 'Tax-year settings are unavailable.');
  const url = new URL(request.url);
  const requestedTaxYear =
    url.searchParams.get('taxYear') ??
    currentTaxYear(settings.tax_year_end_month, settings.tax_year_end_day);
  const period = exportPeriod(
    'TAX_YEAR',
    null,
    requestedTaxYear,
    settings.tax_year_end_month,
    settings.tax_year_end_day,
  );
  const activityValue = url.searchParams.get('activityId')?.trim() ?? '';
  if (activityValue.length > 100)
    throw new HttpError(400, 'Business activity filter is invalid.');
  const activityId = activityValue || null;
  if (activityId) {
    const activity = await env.DB.prepare(
      'SELECT id FROM business_activities WHERE id=?',
    )
      .bind(activityId)
      .first();
    if (!activity)
      throw new HttpError(400, 'Business activity filter is invalid.');
  }
  const incomeScope = scopeClause(
    'income_records',
    'transaction_date',
    period.from!,
    period.to!,
    activityId,
  );
  const expenseScope = scopeClause(
    'expenses',
    'purchase_datetime',
    period.from!,
    period.to!,
    activityId,
  );
  const sessionScope = scopeClause(
    'work_sessions',
    'started_at',
    period.from!,
    period.to!,
    activityId,
  );
  const [
    incomeRows,
    expenseRows,
    sessionRows,
    outstandingRows,
    reviewRows,
    platformIncomeRows,
    insuranceRows,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT income_records.currency,
          SUM(income_records.total_amount_minor) AS recorded,
          SUM(CASE WHEN income_records.income_type='CONTRACT'
            THEN COALESCE(contract_income_details.amount_received_minor,0)
            ELSE income_records.total_amount_minor END) AS cash
         FROM income_records
         LEFT JOIN contract_income_details ON contract_income_details.income_id=income_records.id
         WHERE income_records.deleted_at IS NULL AND income_records.purged_at IS NULL
           AND income_records.status!='VOIDED' AND ${incomeScope.sql}
         GROUP BY income_records.currency ORDER BY income_records.currency`,
    )
      .bind(...incomeScope.bindings)
      .all<{ currency: string; recorded: number; cash: number }>(),
    env.DB.prepare(
      `SELECT expenses.business_activity_id,business_activities.name AS activity_name,
          business_activities.activity_type,expenses.expense_type,expenses.total_amount_minor,
          expenses.currency,fuel_expense_details.fuel_litres
         FROM expenses
         LEFT JOIN business_activities ON business_activities.id=expenses.business_activity_id
         LEFT JOIN fuel_expense_details ON fuel_expense_details.expense_id=expenses.id
         WHERE expenses.deleted_at IS NULL AND expenses.purged_at IS NULL
           AND expenses.status!='VOIDED' AND ${expenseScope.sql}`,
    )
      .bind(...expenseScope.bindings)
      .all<{
        business_activity_id: string | null;
        activity_name: string | null;
        activity_type: string | null;
        expense_type: string;
        total_amount_minor: number;
        currency: string;
        fuel_litres: number | null;
      }>(),
    env.DB.prepare(
      `SELECT work_sessions.business_activity_id,business_activities.name AS activity_name,
          work_sessions.started_at,work_sessions.ended_at,work_sessions.distance_km,
          work_sessions.gross_revenue_minor,work_sessions.currency
         FROM work_sessions JOIN business_activities ON business_activities.id=work_sessions.business_activity_id
         WHERE business_activities.activity_type='PLATFORM_SERVICES'
           AND work_sessions.deleted_at IS NULL AND work_sessions.purged_at IS NULL
           AND work_sessions.status!='VOIDED' AND ${sessionScope.sql}`,
    )
      .bind(...sessionScope.bindings)
      .all<{
        business_activity_id: string;
        activity_name: string;
        started_at: string;
        ended_at: string;
        distance_km: number;
        gross_revenue_minor: number | null;
        currency: string;
      }>(),
    env.DB.prepare(
      `SELECT income_records.currency,COUNT(*) AS invoice_count,
          SUM(contract_income_details.total_minor-COALESCE(contract_income_details.amount_received_minor,0)) AS outstanding_minor
         FROM income_records JOIN contract_income_details ON contract_income_details.income_id=income_records.id
         WHERE income_records.deleted_at IS NULL AND income_records.purged_at IS NULL
           AND income_records.status!='VOIDED'
           AND contract_income_details.payment_status IN ('ISSUED','PARTIALLY_PAID','OVERDUE')
           AND ${incomeScope.sql}
         GROUP BY income_records.currency ORDER BY income_records.currency`,
    )
      .bind(...incomeScope.bindings)
      .all<{
        currency: string;
        invoice_count: number;
        outstanding_minor: number;
      }>(),
    env.DB.prepare(
      `SELECT status FROM (
          SELECT expenses.status FROM expenses WHERE expenses.deleted_at IS NULL AND expenses.purged_at IS NULL AND ${expenseScope.sql}
          UNION ALL SELECT income_records.status FROM income_records WHERE income_records.deleted_at IS NULL AND income_records.purged_at IS NULL AND ${incomeScope.sql}
          UNION ALL SELECT work_sessions.status FROM work_sessions WHERE work_sessions.deleted_at IS NULL AND work_sessions.purged_at IS NULL AND ${sessionScope.sql}
        )`,
    )
      .bind(
        ...expenseScope.bindings,
        ...incomeScope.bindings,
        ...sessionScope.bindings,
      )
      .all<{ status: string }>(),
    env.DB.prepare(
      `SELECT income_records.business_activity_id,business_activities.name AS activity_name,
          income_records.currency,SUM(income_records.total_amount_minor) AS platform_income_minor
         FROM income_records JOIN business_activities ON business_activities.id=income_records.business_activity_id
         WHERE income_records.income_type='PLATFORM' AND income_records.deleted_at IS NULL
           AND income_records.purged_at IS NULL AND income_records.status!='VOIDED'
           AND ${incomeScope.sql}
         GROUP BY income_records.business_activity_id,business_activities.name,income_records.currency`,
    )
      .bind(...incomeScope.bindings)
      .all<{
        business_activity_id: string;
        activity_name: string;
        currency: string;
        platform_income_minor: number;
      }>(),
    env.DB.prepare(
      `SELECT expenses.business_activity_id,business_activities.name AS activity_name,
          expenses.currency,SUM(COALESCE(expense_allocations.allocated_amount_minor,0)) AS allocated_insurance_minor
         FROM expenses JOIN business_activities ON business_activities.id=expenses.business_activity_id
         JOIN expense_allocations ON expense_allocations.expense_id=expenses.id
         WHERE expenses.expense_type='INSURANCE' AND business_activities.activity_type='PLATFORM_SERVICES'
           AND expenses.deleted_at IS NULL AND expenses.purged_at IS NULL AND expenses.status!='VOIDED'
           AND ${expenseScope.sql}
         GROUP BY expenses.business_activity_id,business_activities.name,expenses.currency`,
    )
      .bind(...expenseScope.bindings)
      .all<{
        business_activity_id: string;
        activity_name: string;
        currency: string;
        allocated_insurance_minor: number;
      }>(),
  ]);
  const expensesByCurrency = new Map<string, number>();
  const spending = new Map<
    string,
    { fuel: number; parking: number; fuelLitres: number }
  >();
  const platformCosts: DashboardCostInput[] = [];
  for (const row of expenseRows.results) {
    expensesByCurrency.set(
      row.currency,
      (expensesByCurrency.get(row.currency) ?? 0) + row.total_amount_minor,
    );
    const item = spending.get(row.currency) ?? {
      fuel: 0,
      parking: 0,
      fuelLitres: 0,
    };
    if (row.expense_type === 'FUEL') {
      item.fuel += row.total_amount_minor;
      item.fuelLitres += row.fuel_litres ?? 0;
    }
    if (row.expense_type === 'PARKING') item.parking += row.total_amount_minor;
    spending.set(row.currency, item);
    if (
      row.business_activity_id &&
      row.activity_name &&
      row.activity_type === 'PLATFORM_SERVICES' &&
      (row.expense_type === 'FUEL' || row.expense_type === 'PARKING')
    )
      platformCosts.push({
        activityId: row.business_activity_id,
        activityName: row.activity_name,
        expenseType: row.expense_type,
        totalAmountMinor: row.total_amount_minor,
        currency: row.currency,
        fuelLitres: row.fuel_litres,
      });
  }
  const sessionInputs: DashboardSessionInput[] = sessionRows.results.map(
    (row) => ({
      activityId: row.business_activity_id,
      activityName: row.activity_name,
      durationMinutes: Math.round(
        (Date.parse(row.ended_at) - Date.parse(row.started_at)) / 60_000,
      ),
      distanceKm: row.distance_km,
      grossRevenueMinor: row.gross_revenue_minor,
      currency: row.currency,
    }),
  );
  const operating = platformMetrics(sessionInputs, platformCosts);
  const platformKeys = new Set([
    ...operating.map((item) => `${item.activityId}\u0000${item.currency}`),
    ...platformIncomeRows.results.map(
      (item) => `${item.business_activity_id}\u0000${item.currency}`,
    ),
    ...insuranceRows.results.map(
      (item) => `${item.business_activity_id}\u0000${item.currency}`,
    ),
  ]);
  const platformActivities = [...platformKeys]
    .map((key) => {
      const [id, currency] = key.split('\u0000');
      const metric = operating.find(
        (item) => item.activityId === id && item.currency === currency,
      );
      const income = platformIncomeRows.results.find(
        (item) =>
          item.business_activity_id === id && item.currency === currency,
      );
      const insurance = insuranceRows.results.find(
        (item) =>
          item.business_activity_id === id && item.currency === currency,
      );
      return {
        ...(metric ?? {
          activityId: id,
          activityName:
            income?.activity_name ??
            insurance?.activity_name ??
            'Platform activity',
          currency,
          sessionCount: 0,
          revenueSessionCount: 0,
          revenueComplete: false,
          durationHours: 0,
          distanceKm: 0,
          sessionRevenueMinor: null,
          revenuePerSessionMinor: null,
          revenuePerHourMinor: null,
          revenuePerKmMinor: null,
          fuelSpendingMinor: 0,
          fuelLitres: 0,
          parkingSpendingMinor: 0,
          directOperatingCostMinor: 0,
          fuelCostPerKmMinor: null,
          directOperatingContributionMinor: null,
        }),
        recordedPlatformIncomeMinor: income?.platform_income_minor ?? 0,
        allocatedInsuranceMinor: insurance?.allocated_insurance_minor ?? 0,
      };
    })
    .sort((a, b) => a.activityName.localeCompare(b.activityName));
  return json({
    period: {
      taxYear: requestedTaxYear,
      from: period.from,
      to: period.to,
      activityId,
    },
    financialTotals: combineFinancialTotals(
      incomeRows.results,
      [...expensesByCurrency].map(([currency, total]) => ({ currency, total })),
    ),
    spending: [...spending]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, item]) => ({
        currency,
        fuelSpendingMinor: item.fuel,
        parkingSpendingMinor: item.parking,
        fuelLitres: Math.round(item.fuelLitres * 1000) / 1000,
      })),
    outstandingInvoices: outstandingRows.results.map((row) => ({
      currency: row.currency,
      invoiceCount: row.invoice_count,
      outstandingMinor: row.outstanding_minor,
    })),
    review: {
      totalRecords: reviewRows.results.length,
      unreviewedCount: reviewRows.results.filter(
        (row) => !['REVIEWED', 'PROCESSED', 'VOIDED'].includes(row.status),
      ).length,
      missingInformationCount: reviewRows.results.filter(
        (row) => row.status === 'MISSING_INFORMATION',
      ).length,
      readyForReviewCount: reviewRows.results.filter(
        (row) => row.status === 'READY_FOR_REVIEW',
      ).length,
    },
    platformActivities,
  });
}
