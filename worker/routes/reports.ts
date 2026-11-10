import { requireUser } from '../auth/authorization';
import { HttpError, json } from '../lib/http';
import { csvDocument, exportPeriod } from '../services/exportService';
import type { Env } from '../types';
import { businessDateBounds } from '../services/accessControlService';

interface ReportRow {
  family: string;
  subtype: string;
  currency: string;
  record_count: number;
  recorded_total_minor: string;
}

async function reportRows(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const settings = await env.DB.prepare(
    'SELECT tax_year_end_month,tax_year_end_day FROM retention_settings WHERE business_account_id=?',
  )
    .bind(actor.businessAccountId)
    .first<{ tax_year_end_month: number; tax_year_end_day: number }>();
  if (!settings) throw new HttpError(503, 'Report settings are unavailable.');
  const url = new URL(request.url);
  const period = exportPeriod(
    url.searchParams.get('scope') ?? 'FULL',
    url.searchParams.get('month'),
    url.searchParams.get('taxYear'),
    settings.tax_year_end_month,
    settings.tax_year_end_day,
  );
  const business = url.searchParams.get('businessId')?.trim() || null;
  const entities = url.searchParams.get('legalEntityId')?.trim() || null;
  const bounds = businessDateBounds(period.from, period.to);
  const condition = (
    table: string,
    date: string,
    instant = false,
  ) => `${table}.business_account_id=? AND ${table}.purged_at IS NULL AND ${table}.deleted_at IS NULL
    AND ${table}.status<>'VOIDED' AND (? IS NULL OR ${instant ? `julianday(${table}.${date})>=julianday(?)` : `${table}.${date}>=?`}) AND (? IS NULL OR ${instant ? `julianday(${table}.${date})<julianday(?)` : `${table}.${date}<=?`})
    AND (? IS NULL OR ${table}.business_id=?) AND (? IS NULL OR ${table}.legal_entity_id=?)`;
  const values = [
    actor.businessAccountId,
    period.from,
    period.from,
    period.to,
    period.to,
    business,
    business,
    entities,
    entities,
  ];
  const instantValues = [
    actor.businessAccountId,
    bounds.fromInstant,
    bounds.fromInstant,
    bounds.toInstant,
    bounds.toInstant,
    business,
    business,
    entities,
    entities,
  ];
  const result = await env.DB.prepare(
    `SELECT 'EXPENSE' AS family,expense_type AS subtype,currency,COUNT(*) AS record_count,CAST(SUM(total_amount_minor) AS TEXT) AS recorded_total_minor
    FROM expenses WHERE ${condition('expenses', 'purchase_datetime', true)} GROUP BY expense_type,currency
    UNION ALL SELECT 'INCOME',income_type,currency,COUNT(*),CAST(SUM(total_amount_minor) AS TEXT)
    FROM income_records WHERE ${condition('income_records', 'transaction_date')} GROUP BY income_type,currency
    ORDER BY family,subtype,currency LIMIT 101`,
  )
    .bind(...instantValues, ...values)
    .all<ReportRow>();
  if (result.results.length > 100)
    throw new HttpError(422, 'Narrow the report period or business filter.');
  const rows = result.results.map((row) => ({
    ...row,
    recorded_total_minor: Number(row.recorded_total_minor),
  }));
  if (
    rows.some(
      (row) =>
        !Number.isSafeInteger(row.recorded_total_minor) ||
        !Number.isSafeInteger(row.record_count),
    )
  ) {
    throw new HttpError(
      422,
      'Report totals exceed the supported range. Narrow the period or business filter.',
    );
  }
  return {
    period,
    rows,
    note: 'Recorded source totals by family and currency; not cash flow, profit, or final tax treatment. Insurance amounts are full premiums.',
  };
}

export async function viewReport(request: Request, env: Env) {
  return json(await reportRows(request, env));
}

export async function exportReport(request: Request, env: Env) {
  if (env.APP_ENV === 'demo')
    throw new HttpError(
      403,
      'Report downloads are unavailable in the public demo.',
    );
  const report = await reportRows(request, env);
  return new Response(
    csvDocument(
      report.rows.map((row) => ({ ...row })),
      [
        { key: 'family' },
        { key: 'subtype' },
        { key: 'currency' },
        { key: 'record_count' },
        { key: 'recorded_total_minor' },
      ],
    ),
    {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition':
          'attachment; filename="business-records-summary.csv"',
        'cache-control': 'private, no-store',
      },
    },
  );
}
