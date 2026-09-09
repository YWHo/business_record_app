export interface DashboardSessionInput {
  activityId: string;
  activityName: string;
  durationMinutes: number;
  distanceKm: number;
  grossRevenueMinor: number | null;
  currency: string;
}

export interface DashboardCostInput {
  activityId: string;
  activityName: string;
  expenseType: 'FUEL' | 'PARKING';
  totalAmountMinor: number;
  currency: string;
  fuelLitres: number | null;
}

export interface PlatformMetric {
  activityId: string;
  activityName: string;
  currency: string;
  sessionCount: number;
  revenueSessionCount: number;
  revenueComplete: boolean;
  durationHours: number;
  distanceKm: number;
  sessionRevenueMinor: number | null;
  revenuePerSessionMinor: number | null;
  revenuePerHourMinor: number | null;
  revenuePerKmMinor: number | null;
  fuelSpendingMinor: number;
  fuelLitres: number;
  parkingSpendingMinor: number;
  directOperatingCostMinor: number;
  fuelCostPerKmMinor: number | null;
  directOperatingContributionMinor: number | null;
}

export function platformMetrics(
  sessions: DashboardSessionInput[],
  costs: DashboardCostInput[],
): PlatformMetric[] {
  const groups = new Map<string, PlatformMetric>();
  const group = (
    activityId: string,
    activityName: string,
    currency: string,
  ) => {
    const key = `${activityId}\u0000${currency}`;
    let metric = groups.get(key);
    if (!metric) {
      metric = {
        activityId,
        activityName,
        currency,
        sessionCount: 0,
        revenueSessionCount: 0,
        revenueComplete: true,
        durationHours: 0,
        distanceKm: 0,
        sessionRevenueMinor: 0,
        revenuePerSessionMinor: null,
        revenuePerHourMinor: null,
        revenuePerKmMinor: null,
        fuelSpendingMinor: 0,
        fuelLitres: 0,
        parkingSpendingMinor: 0,
        directOperatingCostMinor: 0,
        fuelCostPerKmMinor: null,
        directOperatingContributionMinor: null,
      };
      groups.set(key, metric);
    }
    return metric;
  };
  for (const session of sessions) {
    const metric = group(
      session.activityId,
      session.activityName,
      session.currency,
    );
    metric.sessionCount += 1;
    metric.durationHours += session.durationMinutes / 60;
    metric.distanceKm += session.distanceKm;
    if (session.grossRevenueMinor === null) metric.revenueComplete = false;
    else {
      metric.revenueSessionCount += 1;
      metric.sessionRevenueMinor =
        (metric.sessionRevenueMinor ?? 0) + session.grossRevenueMinor;
    }
  }
  for (const cost of costs) {
    const metric = group(cost.activityId, cost.activityName, cost.currency);
    if (cost.expenseType === 'FUEL') {
      metric.fuelSpendingMinor += cost.totalAmountMinor;
      metric.fuelLitres += cost.fuelLitres ?? 0;
    } else metric.parkingSpendingMinor += cost.totalAmountMinor;
  }
  return [...groups.values()]
    .map((metric) => {
      metric.durationHours = Math.round(metric.durationHours * 100) / 100;
      metric.distanceKm = Math.round(metric.distanceKm * 1000) / 1000;
      metric.fuelLitres = Math.round(metric.fuelLitres * 1000) / 1000;
      metric.directOperatingCostMinor =
        metric.fuelSpendingMinor + metric.parkingSpendingMinor;
      if (!metric.revenueComplete || metric.sessionCount === 0)
        metric.sessionRevenueMinor = null;
      if (metric.sessionRevenueMinor !== null && metric.sessionCount > 0)
        metric.revenuePerSessionMinor = Math.round(
          metric.sessionRevenueMinor / metric.sessionCount,
        );
      if (metric.sessionRevenueMinor !== null && metric.durationHours > 0)
        metric.revenuePerHourMinor = Math.round(
          metric.sessionRevenueMinor / metric.durationHours,
        );
      if (metric.sessionRevenueMinor !== null && metric.distanceKm > 0)
        metric.revenuePerKmMinor = Math.round(
          metric.sessionRevenueMinor / metric.distanceKm,
        );
      if (metric.distanceKm > 0)
        metric.fuelCostPerKmMinor = Math.round(
          metric.fuelSpendingMinor / metric.distanceKm,
        );
      if (metric.sessionRevenueMinor !== null)
        metric.directOperatingContributionMinor =
          metric.sessionRevenueMinor - metric.directOperatingCostMinor;
      return metric;
    })
    .sort((a, b) =>
      a.activityName === b.activityName
        ? a.currency.localeCompare(b.currency)
        : a.activityName.localeCompare(b.activityName),
    );
}

export function combineFinancialTotals(
  income: Array<{ currency: string; recorded: number; cash: number }>,
  expenses: Array<{ currency: string; total: number }>,
) {
  const currencies = new Set([
    ...income.map((item) => item.currency),
    ...expenses.map((item) => item.currency),
  ]);
  return [...currencies].sort().map((currency) => {
    const recordedRevenueMinor = income
      .filter((item) => item.currency === currency)
      .reduce((total, item) => total + item.recorded, 0);
    const cashReceivedMinor = income
      .filter((item) => item.currency === currency)
      .reduce((total, item) => total + item.cash, 0);
    const recordedExpensesMinor = expenses
      .filter((item) => item.currency === currency)
      .reduce((total, item) => total + item.total, 0);
    return {
      currency,
      recordedRevenueMinor,
      cashReceivedMinor,
      recordedExpensesMinor,
      netCashMovementMinor: cashReceivedMinor - recordedExpensesMinor,
      incomeLessRecordedExpensesMinor:
        recordedRevenueMinor - recordedExpensesMinor,
    };
  });
}
