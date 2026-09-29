import { requireRole, requireUser } from '../auth/authorization';
import { HttpError, json, readJsonObject } from '../lib/http';
import type { RouteParameters } from '../lib/router';
import {
  listBusinessOverviews,
  updateBusinessDetails as persistBusinessDetails,
} from '../repositories/businessRepository';
import { listBusinessEntityPeriods } from '../repositories/businessEntityPeriodRepository';
import { listLegalEntities } from '../repositories/legalEntityRepository';
import {
  loadAndValidateBusinessEntityPeriods,
  requireBusinessAccess,
  requireBusinessScopedRecord,
  requireBusinessScopedReference,
  requiresLegalEntityChangeConfirmation,
  resolveLegalEntityForBusinessDate,
} from '../services/businessContextService';
import type { Env } from '../types';
import { writeAudit } from '../services/auditService';
import { dashboard } from './dashboard';
import {
  createGeneralExpense,
  createParkingRecord,
  updateGeneralExpense,
  updateParkingRecord,
} from './expenseRecords';
import { createFuelRecord, updateFuelRecord } from './fuelRecords';
import {
  createInsuranceRecord,
  updateInsuranceRecord,
} from './insuranceRecords';

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
  gst_amount_minor?: number | null;
  gst_status?: string;
  recurrence_type?: string;
  vehicle_id?: string | null;
  vehicle_registration?: string | null;
  parking_provider?: string | null;
  parking_location?: string | null;
  parking_start_datetime?: string | null;
  parking_end_datetime?: string | null;
  parking_reference?: string | null;
  fuel_station?: string | null;
  fuel_price_micros_per_litre?: number | null;
  fuel_litres?: number | null;
  odometer_km?: number | null;
  fill_type?: string | null;
  fuel_notes?: string | null;
  insurance_type?: string | null;
  provider?: string | null;
  policy_number?: string | null;
  policy_period_start?: string | null;
  policy_period_end?: string | null;
  allocation_method?: string | null;
  percentage_basis_points?: number | null;
  allocated_amount_minor?: number | null;
  calculation_period_start?: string | null;
  calculation_period_end?: string | null;
  allocation_notes?: string | null;
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

function expenseId(params: RouteParameters): string {
  const value = params.expenseId;
  if (!value) throw new HttpError(400, 'Expense is required.');
  return value;
}

export async function listBusinessRecords(request: Request, env: Env) {
  const actor = await requireUser(request, env);
  const businesses = await listBusinessOverviews(
    env.DB,
    actor.businessAccountId,
  );
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

function optionalBusinessDescription(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string')
    throw new HttpError(400, 'Description must be text.');
  const description = value.trim();
  if (description.length > 500)
    throw new HttpError(400, 'Description must be 500 characters or fewer.');
  return description || null;
}

export async function updateBusinessDetails(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const owner = await requireUser(request, env);
  requireRole(owner, ['OWNER']);
  const business = await requireBusinessAccess(
    env.DB,
    owner,
    businessId(params),
  );
  const body = await readJsonObject(request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new HttpError(400, 'Business name is required.');
  if (name.length > 100)
    throw new HttpError(400, 'Business name must be 100 characters or fewer.');
  const defaultCurrency =
    typeof body.defaultCurrency === 'string'
      ? body.defaultCurrency.trim().toUpperCase()
      : '';
  if (!/^[A-Z]{3}$/.test(defaultCurrency))
    throw new HttpError(400, 'Default currency must be a three-letter code.');
  const description = optionalBusinessDescription(body.description);
  const duplicate = await env.DB.prepare(
    `SELECT id FROM businesses
      WHERE business_account_id = ? AND name = ? COLLATE NOCASE AND id != ?`,
  )
    .bind(owner.businessAccountId, name, business.id)
    .first();
  if (duplicate)
    throw new HttpError(409, 'A business with this name already exists.');
  const updated = await persistBusinessDetails(
    env.DB,
    owner.businessAccountId,
    business.id,
    { name, description, defaultCurrency },
    new Date().toISOString(),
  );
  if (!updated) throw new HttpError(404, 'Business not found.');
  await writeAudit(
    env,
    owner,
    'BUSINESS_UPDATED',
    'BUSINESS',
    business.id,
    'Business details updated.',
    business.legacyBusinessActivityId,
    {
      name: { from: business.name, to: name },
      description: { from: business.description, to: description },
      defaultCurrency: {
        from: business.defaultCurrency,
        to: defaultCurrency,
      },
    },
    { businessId: business.id },
  );
  return json({ business: updated });
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

export async function getBusinessExpense(
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
  const row = await env.DB.prepare(
    `SELECT expenses.id,expenses.business_id,expenses.legal_entity_id,
            expenses.expense_type,expenses.expense_category_id,
            expense_categories.name AS category_name,expenses.merchant_name,
            expenses.purchase_datetime,expenses.total_amount_minor,
            expenses.currency,expenses.gst_amount_minor,expenses.gst_status,
            expenses.description,expenses.recurrence_type,expenses.status,
            expenses.created_at,expenses.updated_at,
            COALESCE(parking_expense_details.vehicle_id,
              fuel_expense_details.vehicle_id,
              insurance_expense_details.vehicle_id) AS vehicle_id,
            vehicles.registration AS vehicle_registration,
            parking_expense_details.parking_provider,
            parking_expense_details.parking_location,
            parking_expense_details.parking_start_datetime,
            parking_expense_details.parking_end_datetime,
            parking_expense_details.parking_reference,
            fuel_expense_details.fuel_station,
            fuel_expense_details.fuel_price_micros_per_litre,
            fuel_expense_details.fuel_litres,
            fuel_expense_details.odometer_km,fuel_expense_details.fill_type,
            fuel_expense_details.notes AS fuel_notes,
            insurance_expense_details.insurance_type,
            insurance_expense_details.provider,
            insurance_expense_details.policy_number,
            insurance_expense_details.policy_period_start,
            insurance_expense_details.policy_period_end,
            expense_allocations.allocation_method,
            expense_allocations.percentage_basis_points,
            expense_allocations.allocated_amount_minor,
            expense_allocations.calculation_period_start,
            expense_allocations.calculation_period_end,
            expense_allocations.notes AS allocation_notes
       FROM expenses
       JOIN expense_categories
         ON expense_categories.id=expenses.expense_category_id
        AND expense_categories.business_account_id=expenses.business_account_id
       LEFT JOIN parking_expense_details
         ON parking_expense_details.expense_id=expenses.id
        AND parking_expense_details.business_account_id=expenses.business_account_id
       LEFT JOIN fuel_expense_details
         ON fuel_expense_details.expense_id=expenses.id
        AND fuel_expense_details.business_account_id=expenses.business_account_id
       LEFT JOIN insurance_expense_details
         ON insurance_expense_details.expense_id=expenses.id
        AND insurance_expense_details.business_account_id=expenses.business_account_id
       LEFT JOIN expense_allocations
         ON expense_allocations.expense_id=expenses.id
        AND expense_allocations.business_account_id=expenses.business_account_id
       LEFT JOIN vehicles
         ON vehicles.id=COALESCE(parking_expense_details.vehicle_id,
           fuel_expense_details.vehicle_id,insurance_expense_details.vehicle_id)
        AND vehicles.business_account_id=expenses.business_account_id
      WHERE expenses.business_account_id=? AND expenses.business_id=?
        AND expenses.id=? AND expenses.deleted_at IS NULL`,
  )
    .bind(actor.businessAccountId, business.id, expenseId(params))
    .first<BusinessExpenseRow>();
  if (!row) throw new HttpError(404, 'Expense not found.');
  return json({ expense: serializeBusinessExpenseDetail(row) });
}

function serializeBusinessExpenseDetail(row: BusinessExpenseRow) {
  const common = {
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
    gstAmountMinor: row.gst_amount_minor ?? null,
    gstStatus: row.gst_status ?? 'UNKNOWN',
    description: row.description,
    recurrenceType: row.recurrence_type ?? 'ONE_OFF',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.expense_type === 'PARKING')
    return {
      ...common,
      vehicleId: row.vehicle_id ?? null,
      vehicleRegistration: row.vehicle_registration ?? null,
      parkingProvider: row.parking_provider ?? null,
      parkingLocation: row.parking_location ?? '',
      parkingStartDatetime: row.parking_start_datetime ?? null,
      parkingEndDatetime: row.parking_end_datetime ?? null,
      parkingReference: row.parking_reference ?? null,
    };
  if (row.expense_type === 'FUEL')
    return {
      ...common,
      vehicleId: row.vehicle_id ?? '',
      vehicleRegistration: row.vehicle_registration ?? '',
      fuelStation: row.fuel_station ?? null,
      fuelPriceMicrosPerLitre: row.fuel_price_micros_per_litre ?? null,
      fuelLitres: row.fuel_litres ?? null,
      odometerKm: row.odometer_km ?? null,
      fillType: row.fill_type ?? 'UNKNOWN',
      notes: row.fuel_notes ?? null,
    };
  if (row.expense_type === 'INSURANCE')
    return {
      ...common,
      provider: row.provider ?? row.merchant_name,
      premiumMinor: row.total_amount_minor,
      insuranceType: row.insurance_type ?? 'OTHER',
      policyNumber: row.policy_number ?? null,
      policyPeriodStart: row.policy_period_start ?? '',
      policyPeriodEnd: row.policy_period_end ?? '',
      vehicleId: row.vehicle_id ?? null,
      vehicleRegistration: row.vehicle_registration ?? null,
      allocation: {
        method: row.allocation_method ?? 'UNDETERMINED',
        percentageBasisPoints: row.percentage_basis_points ?? null,
        allocatedAmountMinor: row.allocated_amount_minor ?? null,
        calculationPeriodStart: row.calculation_period_start ?? null,
        calculationPeriodEnd: row.calculation_period_end ?? null,
        notes: row.allocation_notes ?? null,
        reviewerEmail: null,
      },
    };
  return common;
}

export async function updateBusinessExpense(
  request: Request,
  env: Env,
  params: RouteParameters,
) {
  const actor = await requireUser(request, env);
  const selectedBusinessId = businessId(params);
  const selectedExpenseId = expenseId(params);
  const business = await requireBusinessAccess(
    env.DB,
    actor,
    selectedBusinessId,
    { forWrite: true },
  );
  await requireBusinessScopedRecord(
    env.DB,
    actor,
    'expenses',
    business.id,
    selectedExpenseId,
  );
  const row = await env.DB.prepare(
    `SELECT expense_type,legal_entity_id,purchase_datetime FROM expenses
      WHERE business_account_id=? AND business_id=? AND id=?`,
  )
    .bind(actor.businessAccountId, business.id, selectedExpenseId)
    .first<{
      expense_type: string;
      legal_entity_id: string;
      purchase_datetime: string;
    }>();
  if (!row) throw new HttpError(404, 'Expense not found.');
  const body = await readJsonObject(request);
  if (
    row.expense_type === 'GENERAL' &&
    typeof body.expenseCategoryId === 'string'
  ) {
    await requireBusinessScopedReference(
      env.DB,
      actor,
      'expense_categories',
      business.id,
      body.expenseCategoryId,
    );
  }
  if (
    ['PARKING', 'FUEL', 'INSURANCE'].includes(row.expense_type) &&
    typeof body.vehicleId === 'string' &&
    body.vehicleId
  ) {
    await requireBusinessScopedReference(
      env.DB,
      actor,
      'vehicles',
      business.id,
      body.vehicleId,
    );
  }
  const attribution = await resolveLegalEntityForBusinessDate(
    env.DB,
    actor,
    business.id,
    typeof body.purchaseDatetime === 'string'
      ? body.purchaseDatetime
      : row.purchase_datetime,
    { forWrite: true },
  );
  const confirmedWarnings = new Set(
    Array.isArray(body.confirmedWarnings)
      ? body.confirmedWarnings.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  );
  const attributionWarning = requiresLegalEntityChangeConfirmation(
    row.legal_entity_id,
    attribution,
    confirmedWarnings,
  );
  if (attributionWarning) {
    return json(
      {
        error: 'Review the legal-entity change before saving.',
        warnings: [attributionWarning],
      },
      { status: 409 },
    );
  }
  const delegatedRequest = new Request(request.url, {
    method: 'PATCH',
    headers: request.headers,
    body: JSON.stringify({
      ...body,
      id: selectedExpenseId,
      businessActivityId: business.legacyBusinessActivityId,
    }),
  });
  let response: Response;
  switch (row.expense_type) {
    case 'GENERAL':
      response = await updateGeneralExpense(delegatedRequest, env);
      break;
    case 'PARKING':
      response = await updateParkingRecord(delegatedRequest, env);
      break;
    case 'FUEL':
      response = await updateFuelRecord(delegatedRequest, env);
      break;
    case 'INSURANCE':
      response = await updateInsuranceRecord(delegatedRequest, env);
      break;
    default:
      throw new HttpError(400, 'Expense type is invalid.');
  }
  if (!response.ok || attribution.legalEntity.id === row.legal_entity_id) {
    return response;
  }
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE expenses SET legal_entity_id=?
        WHERE business_account_id=? AND business_id=? AND id=?`,
    ).bind(
      attribution.legalEntity.id,
      actor.businessAccountId,
      business.id,
      selectedExpenseId,
    ),
    env.DB.prepare(
      `UPDATE parking_expense_details SET legal_entity_id=?
        WHERE business_account_id=? AND business_id=? AND expense_id=?`,
    ).bind(
      attribution.legalEntity.id,
      actor.businessAccountId,
      business.id,
      selectedExpenseId,
    ),
    env.DB.prepare(
      `UPDATE fuel_expense_details SET legal_entity_id=?
        WHERE business_account_id=? AND business_id=? AND expense_id=?`,
    ).bind(
      attribution.legalEntity.id,
      actor.businessAccountId,
      business.id,
      selectedExpenseId,
    ),
    env.DB.prepare(
      `UPDATE insurance_expense_details SET legal_entity_id=?
        WHERE business_account_id=? AND business_id=? AND expense_id=?`,
    ).bind(
      attribution.legalEntity.id,
      actor.businessAccountId,
      business.id,
      selectedExpenseId,
    ),
    env.DB.prepare(
      `UPDATE expense_allocations SET legal_entity_id=?
        WHERE business_account_id=? AND business_id=? AND expense_id=?`,
    ).bind(
      attribution.legalEntity.id,
      actor.businessAccountId,
      business.id,
      selectedExpenseId,
    ),
  ]);
  const payload: Record<string, unknown> = await response.json();
  for (const value of Object.values(payload)) {
    if (value && typeof value === 'object' && 'legalEntityId' in value) {
      (value as Record<string, unknown>).legalEntityId =
        attribution.legalEntity.id;
    }
  }
  return json(payload, { status: response.status });
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
