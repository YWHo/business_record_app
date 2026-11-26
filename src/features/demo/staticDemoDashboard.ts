import { exportPeriod } from '../../../worker/services/exportService';
import {
  combineFinancialTotals,
  platformMetrics,
  type DashboardCostInput,
  type DashboardSessionInput,
} from '../../../worker/services/dashboardService';
import { readStaticDemoDetailCollection } from './staticDemoDetails';
import { readStaticDemoTable } from './staticDemo';
import { applyDemoOverlay } from './demoStore';

type Row = Record<string, unknown>;
function withBusinessDefaults(row: Row, business: Row): Row {
  return {
    ...row,
    businessActivityId:
      row.businessActivityId ?? business.legacy_business_activity_id,
    currency: row.currency ?? business.default_currency,
  };
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function detail(value: unknown): Row {
  return value && typeof value === 'object' ? (value as Row) : {};
}
function currentTaxYear() {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return String(Number(date.slice(0, 4)) + (date.slice(5) > '03-31' ? 1 : 0));
}
function safeTotals(value: unknown): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key.endsWith('Minor') && item !== null && !Number.isSafeInteger(item)) {
      throw new Error('Dashboard totals exceed the supported range.');
    }
    safeTotals(item);
  }
}

export async function readStaticDemoDashboard(
  businessId?: string,
  query = new URLSearchParams(),
) {
  const taxYear = query.get('taxYear') ?? currentTaxYear();
  const period = exportPeriod('TAX_YEAR', null, taxYear, 3, 31);
  const activityId = businessId
    ? null
    : query.get('activityId')?.trim() || null;
  const activities = readStaticDemoTable('business_activities');
  const clients = readStaticDemoTable('clients');
  if (
    activityId &&
    (activityId.length > 100 ||
      !activities.some((row) => row.id === activityId))
  ) {
    throw new Error('Invalid business activity filter.');
  }
  const businesses = readStaticDemoTable('businesses').filter(
    (row) => !businessId || row.id === businessId,
  );
  if (businessId && !businesses.length) {
    throw new Error('Demo business not found.');
  }
  const sources = await Promise.all(
    businesses.map(async (business) => {
      const id = String(business.id);
      const [expenses, income, sessions, documents] = await Promise.all([
        readStaticDemoDetailCollection(id, 'expenses'),
        readStaticDemoDetailCollection(id, 'income'),
        readStaticDemoDetailCollection(id, 'work-sessions'),
        applyDemoOverlay(
          { documents: [] as Row[] },
          `/api/businesses/${id}/documents`,
        ),
      ]);
      return [
        ...expenses.map((row) => ({
          row,
          type: 'EXPENSE',
          date: 'purchaseDatetime',
        })),
        ...income.map((row) => ({
          row,
          type: 'INCOME',
          date: 'transactionDate',
        })),
        ...sessions.map((row) => ({
          row,
          type: 'WORK_SESSION',
          date: 'startedAt',
        })),
      ].map(({ row, type, date }) => ({
        row: withBusinessDefaults(row, business),
        type,
        date: text(row[date]).slice(0, 10),
        attachmentCount: documents.documents.filter(
          (doc) =>
            doc.recordId === row.id &&
            doc.recordType === type &&
            doc.isCurrent !== false,
        ).length,
      }));
    }),
  );
  // Retain the current Worker's UTC substring dates for dashboard parity.
  const records = sources
    .flat()
    .filter(
      ({ row, date }) =>
        date >= period.from! &&
        date <= period.to! &&
        (!activityId || row.businessActivityId === activityId),
    );
  const active = records.filter(({ row }) => row.status !== 'VOIDED');
  const income = active
    .filter(({ type }) => type === 'INCOME')
    .map(({ row }) => row);
  const expenses = active
    .filter(({ type }) => type === 'EXPENSE')
    .map(({ row }) => row);
  const sessions = active
    .filter(({ type }) => type === 'WORK_SESSION')
    .map(({ row }) => row);
  const spending = new Map<
    string,
    {
      fuelSpendingMinor: number;
      parkingSpendingMinor: number;
      fuelLitres: number;
    }
  >();
  const costs: DashboardCostInput[] = [];
  const sessionInputs: DashboardSessionInput[] = [];
  for (const row of expenses) {
    const currency = text(row.currency);
    const group = spending.get(currency) ?? {
      fuelSpendingMinor: 0,
      parkingSpendingMinor: 0,
      fuelLitres: 0,
    };
    const activity = activities.find(
      (activity) => activity.id === row.businessActivityId,
    );
    if (row.expenseType === 'FUEL') {
      group.fuelSpendingMinor += Number(row.totalAmountMinor);
      group.fuelLitres += Number(row.fuelLitres ?? 0);
    }
    if (row.expenseType === 'PARKING') {
      group.parkingSpendingMinor += Number(row.totalAmountMinor);
    }
    spending.set(currency, group);
    if (
      activity?.activity_type === 'PLATFORM_SERVICES' &&
      (row.expenseType === 'FUEL' || row.expenseType === 'PARKING')
    ) {
      costs.push({
        activityId: text(row.businessActivityId),
        activityName: text(activity.name),
        currency,
        expenseType: row.expenseType,
        totalAmountMinor: Number(row.totalAmountMinor),
        fuelLitres: typeof row.fuelLitres === 'number' ? row.fuelLitres : null,
      });
    }
  }
  for (const row of sessions) {
    const activity = activities.find(
      (activity) => activity.id === row.businessActivityId,
    );
    if (activity?.activity_type === 'PLATFORM_SERVICES') {
      sessionInputs.push({
        activityId: text(row.businessActivityId),
        activityName: text(activity.name),
        durationMinutes: Math.round(
          (Date.parse(text(row.endedAt)) - Date.parse(text(row.startedAt))) /
            60000,
        ),
        distanceKm: Number(row.odometerEndKm) - Number(row.odometerStartKm),
        grossRevenueMinor:
          typeof row.grossRevenueMinor === 'number'
            ? row.grossRevenueMinor
            : null,
        currency: text(row.currency),
      });
    }
  }
  const operating = platformMetrics(sessionInputs, costs);
  const keys = new Set(
    operating.map((row) => `${row.activityId}\0${row.currency}`),
  );
  const platformIncome = income.filter((row) => row.incomeType === 'PLATFORM');
  const insurance = expenses.filter(
    (row) =>
      row.expenseType === 'INSURANCE' &&
      detail(row.allocation).method !== 'UNDETERMINED' &&
      activities.some(
        (activity) =>
          activity.id === row.businessActivityId &&
          activity.activity_type === 'PLATFORM_SERVICES',
      ),
  );
  for (const row of [...platformIncome, ...insurance]) {
    keys.add(`${text(row.businessActivityId)}\0${text(row.currency)}`);
  }
  const platformActivities = [...keys]
    .map((key) => {
      const [id, currency] = key.split('\0');
      const metric = operating.find(
        (row) => row.activityId === id && row.currency === currency,
      );
      return {
        ...(metric ?? {
          activityId: id,
          activityName:
            text(activities.find((row) => row.id === id)?.name) ||
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
        recordedPlatformIncomeMinor: platformIncome
          .filter(
            (row) => row.businessActivityId === id && row.currency === currency,
          )
          .reduce((sum, row) => sum + Number(row.totalAmountMinor), 0),
        allocatedInsuranceMinor: insurance
          .filter(
            (row) => row.businessActivityId === id && row.currency === currency,
          )
          .reduce(
            (sum, row) =>
              sum + Number(detail(row.allocation).allocatedAmountMinor ?? 0),
            0,
          ),
      };
    })
    .sort((a, b) => a.activityName.localeCompare(b.activityName));
  const invoices = new Map<
    string,
    { currency: string; invoiceCount: number; outstandingMinor: number }
  >();
  for (const row of income) {
    const data = detail(row.details);
    if (
      row.incomeType === 'CONTRACT' &&
      ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(text(data.paymentStatus))
    ) {
      const currency = text(row.currency);
      const group = invoices.get(currency) ?? {
        currency,
        invoiceCount: 0,
        outstandingMinor: 0,
      };
      group.invoiceCount += 1;
      group.outstandingMinor +=
        Number(data.totalMinor) - Number(data.amountReceivedMinor ?? 0);
      invoices.set(currency, group);
    }
  }
  const unreviewedCount = records.filter(
    ({ row }) =>
      !['REVIEWED', 'PROCESSED', 'VOIDED'].includes(text(row.status)),
  ).length;
  const result = {
    period: { taxYear, from: period.from, to: period.to, activityId },
    financialTotals: combineFinancialTotals(
      income.map((row) => ({
        currency: text(row.currency),
        recorded: Number(row.totalAmountMinor),
        cash:
          row.incomeType === 'CONTRACT'
            ? Number(detail(row.details).amountReceivedMinor ?? 0)
            : Number(row.totalAmountMinor),
      })),
      expenses.map((row) => ({
        currency: text(row.currency),
        total: Number(row.totalAmountMinor),
      })),
    ),
    spending: [...spending]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, row]) => ({
        currency,
        ...row,
        fuelLitres: Math.round(row.fuelLitres * 1000) / 1000,
      })),
    outstandingInvoices: [...invoices.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
    review: {
      totalRecords: records.length,
      unreviewedCount,
      missingInformationCount: records.filter(
        ({ row }) => row.status === 'MISSING_INFORMATION',
      ).length,
      readyForReviewCount: records.filter(
        ({ row }) => row.status === 'READY_FOR_REVIEW',
      ).length,
    },
    attention: {
      missingReceiptCount: active.filter(
        (row) => row.type === 'EXPENSE' && row.attachmentCount === 0,
      ).length,
      itemsToReviewCount: unreviewedCount,
      outstandingInvoiceCount: [...invoices.values()].reduce(
        (sum, row) => sum + row.invoiceCount,
        0,
      ),
    },
    recentTransactions: active
      .filter(({ type }) => type !== 'WORK_SESSION')
      .map(({ row, type, date }) => ({
        id: text(row.id),
        businessId: text(row.businessId),
        recordType: type,
        subtype: row.expenseType ?? row.incomeType,
        transactionDate: date,
        counterparty:
          text(row.merchantName) ||
          text(row.receivedFrom) ||
          text(detail(row.details).clientName) ||
          text(
            clients.find(
              (client) =>
                client.id === detail(row.details).clientId &&
                client.business_id === row.businessId,
            )?.name,
          ) ||
          text(row.description) ||
          (type === 'EXPENSE' ? 'Expense' : 'Income'),
        totalAmountMinor: Number(row.totalAmountMinor),
        currency: row.currency,
        status: row.status,
      }))
      .sort(
        (a, b) =>
          b.transactionDate.localeCompare(a.transactionDate) ||
          b.id.localeCompare(a.id),
      )
      .slice(0, 6),
    platformActivities,
  };
  safeTotals(result);
  return result;
}
