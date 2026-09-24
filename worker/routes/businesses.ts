import { requireUser } from '../auth/authorization';
import { HttpError, json, readJsonObject } from '../lib/http';
import type { RouteParameters } from '../lib/router';
import { listBusinesses } from '../repositories/businessRepository';
import { listBusinessEntityPeriods } from '../repositories/businessEntityPeriodRepository';
import { listLegalEntities } from '../repositories/legalEntityRepository';
import {
  loadAndValidateBusinessEntityPeriods,
  requireBusinessAccess,
} from '../services/businessContextService';
import type { Env } from '../types';
import { dashboard } from './dashboard';
import { createGeneralExpense, createParkingRecord } from './expenseRecords';
import { createFuelRecord } from './fuelRecords';
import { createInsuranceRecord } from './insuranceRecords';

interface BusinessExpenseRow {
  id: string;
  business_id: string;
  legal_entity_id: string;
  expense_type: string;
  expense_category_id: string;
  category_name: string;
  merchant_name: string;
  purchase_datetime: string;
  total_amount_minor: number;
  currency: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountRow {
  id: string;
  display_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function businessId(params: RouteParameters): string {
  const value = params.businessId;
  if (!value) throw new HttpError(400, 'Business is required.');
  return value;
}

export async function listBusinessRecords(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const businesses = await listBusinesses(env.DB, actor.businessAccountId);
  return json({ businesses });
}

export async function accountDetails(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const account = await env.DB.prepare(
    `SELECT id, display_name, status, created_at, updated_at
       FROM business_accounts
      WHERE id = ?`,
  )
    .bind(actor.businessAccountId)
    .first<AccountRow>();
  if (!account) throw new HttpError(404, 'Business account not found.');
  return json({
    account: {
      id: account.id,
      displayName: account.display_name,
      status: account.status,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    },
    membership: { role: actor.role, status: actor.status },
  });
}

export async function listLegalEntityRecords(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const legalEntities = await listLegalEntities(
    env.DB,
    actor.businessAccountId,
  );
  return json({ legalEntities });
}

export async function businessDetails(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const actor = await requireUser(request, env);
  const business = await requireBusinessAccess(
    env.DB,
    actor,
    businessId(params),
  );
  const periods = await loadAndValidateBusinessEntityPeriods(
    env.DB,
    actor,
    business.id,
  );
  const legalEntities = await listLegalEntities(
    env.DB,
    actor.businessAccountId,
  );
  const entitiesById = new Map(
    legalEntities.map((legalEntity) => [legalEntity.id, legalEntity]),
  );
  const operatingPeriods = periods.map((period) => ({
    ...period,
    legalEntity: entitiesById.get(period.legalEntityId) ?? null,
  }));
  const currentPeriod = operatingPeriods.find(
    (period) => period.effectiveTo === null,
  );
  return json({
    business,
    operatingPeriods,
    currentLegalEntity: currentPeriod?.legalEntity ?? null,
  });
}

export async function businessDashboard(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  return dashboard(request, env, params);
}

export async function listBusinessExpenses(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const actor = await requireUser(request, env);
  const business = await requireBusinessAccess(
    env.DB,
    actor,
    businessId(params),
  );
  const result = await env.DB.prepare(
    `SELECT expenses.id, expenses.business_id, expenses.legal_entity_id,
            expenses.expense_type, expenses.expense_category_id,
            expense_categories.name AS category_name, expenses.merchant_name,
            expenses.purchase_datetime, expenses.total_amount_minor,
            expenses.currency, expenses.status, expenses.description,
            expenses.created_at, expenses.updated_at
       FROM expenses
       JOIN expense_categories
         ON expense_categories.id = expenses.expense_category_id
        AND expense_categories.business_account_id = expenses.business_account_id
      WHERE expenses.business_account_id = ?
        AND expenses.business_id = ?
        AND expenses.deleted_at IS NULL
      ORDER BY expenses.purchase_datetime DESC, expenses.id DESC
      LIMIT 200`,
  )
    .bind(actor.businessAccountId, business.id)
    .all<BusinessExpenseRow>();
  return json({
    expenses: result.results.map((row) => ({
      id: row.id,
      businessId: row.business_id,
      legalEntityId: row.legal_entity_id,
      expenseType: row.expense_type,
      expenseCategoryId: row.expense_category_id,
      categoryName: row.category_name,
      merchantName: row.merchant_name,
      purchaseDatetime: row.purchase_datetime,
      totalAmountMinor: row.total_amount_minor,
      currency: row.currency,
      status: row.status,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}

export async function createBusinessExpense(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const body = await readJsonObject(request.clone() as unknown as Request);
  const expenseType = body.expenseType ?? 'GENERAL';
  switch (expenseType) {
    case 'GENERAL':
      return createGeneralExpense(request, env, params);
    case 'PARKING':
      return createParkingRecord(request, env, params);
    case 'FUEL':
      return createFuelRecord(request, env, params);
    case 'INSURANCE':
      return createInsuranceRecord(request, env, params);
    default:
      throw new HttpError(400, 'Expense type is invalid.');
  }
}

export async function listBusinessPeriods(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const actor = await requireUser(request, env);
  const business = await requireBusinessAccess(
    env.DB,
    actor,
    businessId(params),
  );
  const operatingPeriods = await listBusinessEntityPeriods(
    env.DB,
    actor.businessAccountId,
    business.id,
  );
  return json({ operatingPeriods });
}
