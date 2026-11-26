import { exportPeriod } from '../../../worker/services/exportService';
import { combineFinancialTotals } from '../../../worker/services/dashboardService';
import { readStaticDemoDetailCollection } from './staticDemoDetails';
import { readStaticDemoTable } from './staticDemo';

const businessDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Pacific/Auckland',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function withCurrency(
  record: Record<string, unknown>,
  fallback: unknown,
): Record<string, unknown> {
  const currency = record.currency ?? fallback;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Invalid report currency.');
  }
  return { ...record, currency };
}

function safeAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Report totals exceed the supported range.');
  }
  return value;
}

async function reportSource(query: URLSearchParams) {
  // These are the fiscal settings of the fixed fictional baseline, not settings
  // read from a private account or the host deployment.
  const period = exportPeriod(
    query.get('scope') ?? 'FULL',
    query.get('month'),
    query.get('taxYear'),
    3,
    31,
  );
  const businessId = query.get('businessId')?.trim();
  const entityId = query.get('legalEntityId')?.trim();
  const businesses = readStaticDemoTable('businesses').filter(
    (row) => !businessId || row.id === businessId,
  );
  const records = (
    await Promise.all(
      businesses.map(async (business) => {
        const id = String(business.id);
        const [expenses, income] = await Promise.all([
          readStaticDemoDetailCollection(id, 'expenses'),
          readStaticDemoDetailCollection(id, 'income'),
        ]);
        return [
          ...expenses.map((record) => ({
            record: withCurrency(record, business.default_currency),
            family: 'EXPENSE',
          })),
          ...income.map((record) => ({
            record: withCurrency(record, business.default_currency),
            family: 'INCOME',
          })),
        ];
      }),
    )
  )
    .flat()
    .filter(({ record, family }) => {
      if (
        record.status === 'VOIDED' ||
        (entityId && record.legalEntityId !== entityId)
      ) {
        return false;
      }
      const date =
        family === 'INCOME'
          ? String(record.transactionDate)
          : businessDate.format(new Date(String(record.purchaseDatetime)));
      return (
        !(period.from && date < period.from) && !(period.to && date > period.to)
      );
    });
  return { period, records };
}

export async function readStaticDemoReport(query = new URLSearchParams()) {
  const { period, records } = await reportSource(query);
  const groups = new Map<
    string,
    {
      family: string;
      subtype: string;
      currency: string;
      record_count: number;
      recorded_total_minor: number;
    }
  >();
  for (const { record, family } of records) {
    const subtype = String(record.expenseType ?? record.incomeType);
    const currency = String(record.currency);
    const key = `${family}\0${subtype}\0${currency}`;
    const group = groups.get(key) ?? {
      family,
      subtype,
      currency,
      record_count: 0,
      recorded_total_minor: 0,
    };
    group.record_count += 1;
    group.recorded_total_minor = safeAmount(
      group.recorded_total_minor + safeAmount(record.totalAmountMinor),
    );
    groups.set(key, group);
  }
  if (groups.size > 100) {
    throw new Error('Narrow the report period or business filter.');
  }
  return {
    period,
    rows: [...groups]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, row]) => row),
    note: 'Recorded source totals by family and currency; not cash flow, profit, or final tax treatment. Insurance amounts are full premiums.',
  };
}

export async function readStaticDemoFinancialTotals(
  query = new URLSearchParams(),
) {
  const { period, records } = await reportSource(query);
  const income: { currency: string; recorded: number; cash: number }[] = [];
  const expenses: { currency: string; total: number }[] = [];
  for (const { record, family } of records) {
    const currency = String(record.currency);
    const amount = safeAmount(record.totalAmountMinor);
    if (family === 'EXPENSE') {
      expenses.push({ currency, total: amount });
    } else {
      const detail = record.details as Record<string, unknown> | null;
      income.push({
        currency,
        recorded: amount,
        cash:
          record.incomeType === 'CONTRACT'
            ? safeAmount(detail?.amountReceivedMinor ?? 0)
            : amount,
      });
    }
  }
  const financialTotals = combineFinancialTotals(income, expenses);
  for (const row of financialTotals) {
    for (const [key, value] of Object.entries(row)) {
      if (key !== 'currency') {
        safeAmount(value);
      }
    }
  }
  return { period, financialTotals };
}
