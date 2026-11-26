import { applyDemoOverlay } from './demoStore';
import { calculateWorkSessionMetrics } from '../../../worker/services/workSessionService';
import { calculateFuelMetrics } from '../../../worker/services/fuelService';
import {
  camelCaseDemoRow,
  readStaticDemoTable,
  type DemoRow,
} from './staticDemo';

type DetailCollection = 'expenses' | 'income' | 'work-sessions';

async function sessionDetail(
  record: Record<string, unknown>,
  businessId: string,
) {
  const vehicle = readStaticDemoTable('vehicles').find(
    (vehicle) => vehicle.id === record.vehicleId,
  );
  const activity = readStaticDemoTable('business_activities').find(
    (activity) => activity.id === record.businessActivityId,
  );
  const fuel = async (id: unknown) => {
    if (typeof id !== 'string' || !id) {
      return null;
    }
    try {
      const expense = await readStaticDemoDetail(businessId, 'expenses', id);
      return expense.expenseType === 'FUEL' &&
        expense.vehicleId === record.vehicleId
        ? expense
        : null;
    } catch {
      return null;
    }
  };
  const [starting, ending] = await Promise.all([
    fuel(record.startingFuelExpenseId),
    fuel(record.endingFuelExpenseId),
  ]);
  const fullEnding = ending?.fillType === 'FULL';
  const sameCurrency = ending?.currency === record.currency;
  const distanceKm =
    Number(record.odometerEndKm) - Number(record.odometerStartKm);
  const revenue =
    typeof record.grossRevenueMinor === 'number'
      ? record.grossRevenueMinor
      : null;
  return {
    ...record,
    activityName: activity?.name ?? '',
    vehicleRegistration: vehicle?.registration ?? null,
    startingFuelMerchant: starting?.merchantName ?? null,
    endingFuelMerchant: ending?.merchantName ?? null,
    fuelCurrency: ending?.currency ?? null,
    ...calculateWorkSessionMetrics(
      String(record.startedAt),
      String(record.endedAt),
      distanceKm,
      revenue,
    ),
    ...calculateFuelMetrics(
      distanceKm,
      fullEnding && sameCurrency && typeof ending?.fuelLitres === 'number'
        ? ending.fuelLitres
        : null,
      fullEnding && sameCurrency && typeof ending?.totalAmountMinor === 'number'
        ? ending.totalAmountMinor
        : null,
      record.tankFullAtStart === true &&
        record.noPersonalDriving === true &&
        record.tankFullAtEnd === true,
    ),
  };
}

function related(
  table: Parameters<typeof readStaticDemoTable>[0],
  key: string,
  record: DemoRow,
) {
  return readStaticDemoTable(table).find(
    (row) => row[key] === record.id && row.business_id === record.business_id,
  );
}

function expenseDetail(row: DemoRow): Record<string, unknown> {
  const category = readStaticDemoTable('expense_categories').find(
    (category) => category.id === row.expense_category_id,
  );
  const table =
    row.expense_type === 'FUEL'
      ? 'fuel_expense_details'
      : row.expense_type === 'PARKING'
        ? 'parking_expense_details'
        : row.expense_type === 'INSURANCE'
          ? 'insurance_expense_details'
          : null;
  const detail = table ? related(table, 'expense_id', row) : undefined;
  const vehicle = detail
    ? readStaticDemoTable('vehicles').find(
        (vehicle) => vehicle.id === detail.vehicle_id,
      )
    : undefined;
  const result: Record<string, unknown> = {
    ...camelCaseDemoRow(row),
    ...(detail ? camelCaseDemoRow(detail) : {}),
    id: row.id,
    categoryName: category?.name ?? 'Expense',
    vehicleRegistration: vehicle?.registration ?? null,
  };
  if (row.expense_type === 'INSURANCE') {
    const allocation = related('expense_allocations', 'expense_id', row);
    result.premiumMinor = row.total_amount_minor;
    result.allocation = {
      method: allocation?.allocation_method ?? 'UNDETERMINED',
      percentageBasisPoints: allocation?.percentage_basis_points ?? null,
      allocatedAmountMinor: allocation?.allocated_amount_minor ?? null,
      calculationPeriodStart: allocation?.calculation_period_start ?? null,
      calculationPeriodEnd: allocation?.calculation_period_end ?? null,
      notes: allocation?.notes ?? null,
      reviewerEmail:
        allocation?.reviewed_by === 'demo-accountant'
          ? 'demo-accountant@example.invalid'
          : null,
    };
  }
  return result;
}

function incomeDetail(row: DemoRow): Record<string, unknown> {
  const table =
    row.income_type === 'PLATFORM'
      ? 'platform_income_details'
      : row.income_type === 'CONTRACT'
        ? 'contract_income_details'
        : row.income_type === 'SUBSCRIPTION'
          ? 'subscription_income_details'
          : null;
  const detail = table ? related(table, 'income_id', row) : undefined;
  const reconciliation = related('income_reconciliations', 'income_id', row);
  const activity = readStaticDemoTable('business_activities').find(
    (activity) => activity.id === row.business_activity_id,
  );
  const client = detail
    ? readStaticDemoTable('clients').find(
        (client) => client.id === detail.client_id,
      )
    : undefined;
  return {
    ...camelCaseDemoRow(row),
    activityName: activity?.name ?? '',
    details: detail
      ? {
          ...camelCaseDemoRow(detail),
          ...(client ? { clientName: client.name } : {}),
        }
      : null,
    reconciliation: reconciliation
      ? {
          ...camelCaseDemoRow(reconciliation),
          matched: reconciliation.difference_amount_minor === 0,
          reconcilerEmail:
            reconciliation.reconciled_by === 'demo-accountant'
              ? 'demo-accountant@example.invalid'
              : null,
        }
      : null,
  };
}

// Apply the overlay to the complete scoped collection before selecting a record.
// This handles browser creates, deletes, restore and nested review adjustments
// with exactly the same overlay machinery as collection reads, without a fetch.
export async function readStaticDemoDetailCollection(
  businessId: string,
  collection: DetailCollection,
): Promise<Record<string, unknown>[]> {
  if (
    !readStaticDemoTable('businesses').some(
      (business) => business.id === businessId,
    )
  ) {
    throw new Error('Demo business not found.');
  }
  const table =
    collection === 'expenses'
      ? 'expenses'
      : collection === 'income'
        ? 'income_records'
        : 'work_sessions';
  const property =
    collection === 'expenses'
      ? 'expenses'
      : collection === 'income'
        ? 'incomeRecords'
        : 'sessions';
  const rows = readStaticDemoTable(table)
    .filter(
      (row) =>
        row.business_id === businessId && !row.deleted_at && !row.purged_at,
    )
    .map(
      collection === 'expenses'
        ? expenseDetail
        : collection === 'income'
          ? incomeDetail
          : (row) => ({
              ...camelCaseDemoRow(row),
              tankFullAtStart:
                row.tank_full_at_start === null
                  ? null
                  : row.tank_full_at_start === 1,
              noPersonalDriving:
                row.no_personal_driving === null
                  ? null
                  : row.no_personal_driving === 1,
              tankFullAtEnd:
                row.tank_full_at_end === null
                  ? null
                  : row.tank_full_at_end === 1,
            }),
    );
  const payload = await applyDemoOverlay(
    { [property]: rows },
    `/api/businesses/${encodeURIComponent(businessId)}/${collection}`,
  );
  return payload[property].filter(
    (record) =>
      record.businessId === businessId && !record.deletedAt && !record.purgedAt,
  );
}

export async function readStaticDemoDetail(
  businessId: string,
  collection: DetailCollection,
  recordId: string,
): Promise<Record<string, unknown>> {
  const record = (
    await readStaticDemoDetailCollection(businessId, collection)
  ).find((record) => record.id === recordId);
  if (!record) {
    throw new Error('Demo record not found.');
  }
  return collection === 'work-sessions'
    ? sessionDetail(record, businessId)
    : record;
}
