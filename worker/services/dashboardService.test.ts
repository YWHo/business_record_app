import { describe, expect, it } from 'vitest';
import { combineFinancialTotals, platformMetrics } from './dashboardService';

describe('dashboard analytics', () => {
  it('keeps invoiced revenue distinct from received cash', () => {
    expect(
      combineFinancialTotals(
        [{ currency: 'NZD', recorded: 100_000, cash: 40_000 }],
        [{ currency: 'NZD', total: 10_000 }],
      ),
    ).toEqual([
      {
        currency: 'NZD',
        recordedRevenueMinor: 100_000,
        cashReceivedMinor: 40_000,
        recordedExpensesMinor: 10_000,
        netCashMovementMinor: 30_000,
        incomeLessRecordedExpensesMinor: 90_000,
      },
    ]);
  });

  it('derives platform rates and direct contribution from complete sessions', () => {
    const result = platformMetrics(
      [
        {
          activityId: 'delivery',
          activityName: 'Delivery',
          durationMinutes: 120,
          distanceKm: 50,
          grossRevenueMinor: 10_000,
          currency: 'NZD',
        },
      ],
      [
        {
          activityId: 'delivery',
          activityName: 'Delivery',
          expenseType: 'FUEL',
          totalAmountMinor: 2_000,
          currency: 'NZD',
          fuelLitres: 8,
        },
        {
          activityId: 'delivery',
          activityName: 'Delivery',
          expenseType: 'PARKING',
          totalAmountMinor: 500,
          currency: 'NZD',
          fuelLitres: null,
        },
      ],
    )[0];
    expect(result).toMatchObject({
      revenuePerSessionMinor: 10_000,
      revenuePerHourMinor: 5_000,
      revenuePerKmMinor: 200,
      fuelCostPerKmMinor: 40,
      directOperatingCostMinor: 2_500,
      directOperatingContributionMinor: 7_500,
    });
  });

  it('suppresses revenue-derived claims when any session lacks revenue', () => {
    const result = platformMetrics(
      [
        {
          activityId: 'rides',
          activityName: 'Ride-Hailing',
          durationMinutes: 60,
          distanceKm: 20,
          grossRevenueMinor: null,
          currency: 'NZD',
        },
      ],
      [],
    )[0];
    expect(result).toMatchObject({
      revenueComplete: false,
      sessionRevenueMinor: null,
      revenuePerHourMinor: null,
      directOperatingContributionMinor: null,
    });
  });
});
