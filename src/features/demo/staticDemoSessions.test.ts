import { beforeEach, expect, it, vi } from 'vitest';
import { readStaticDemoDetail } from './staticDemoDetails';
import { recordDemoMutation, resetDemoData } from './demoStore';

const business = 'business-demo-activity-delivery';
const path = `/api/businesses/${business}/work-sessions/demo-session-1`;
beforeEach(async () => {
  await resetDemoData();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Network forbidden');
    }),
  );
});
async function configure(endingFuelExpenseId: string, flags = true) {
  await readStaticDemoDetail(business, 'work-sessions', 'demo-session-1');
  await recordDemoMutation(`${path}/fuel-workflow`, {
    method: 'PATCH',
    body: JSON.stringify({
      endingFuelExpenseId,
      tankFullAtStart: flags,
      noPersonalDriving: flags,
      tankFullAtEnd: flags,
    }),
  });
  return readStaticDemoDetail(business, 'work-sessions', 'demo-session-1');
}
it('derives duration, distance and revenue rates from the original evidence', async () => {
  expect(
    await readStaticDemoDetail(business, 'work-sessions', 'demo-session-1'),
  ).toMatchObject({
    distanceKm: 88,
    durationMinutes: 225,
    revenuePerHourMinor: 5720,
    revenuePerKmMinor: 244,
    vehicleRegistration: 'KORU24',
    fuelCalculationStatus: 'UNAVAILABLE',
  });
  expect(fetch).not.toHaveBeenCalled();
});
it('does not invent revenue when the statement is missing', async () => {
  expect(
    await readStaticDemoDetail(
      'business-demo-activity-rideshare',
      'work-sessions',
      'demo-session-5',
    ),
  ).toMatchObject({
    grossRevenueMinor: null,
    revenuePerHourMinor: null,
    revenuePerKmMinor: null,
  });
});
it('requires actual ending evidence even when every confirmation is true', async () => {
  expect(await configure('absent')).toMatchObject({
    fuelCalculationStatus: 'UNAVAILABLE',
  });
  expect(await configure('demo-fuel-2')).toMatchObject({
    fuelCalculationStatus: 'UNAVAILABLE',
  });
});
it('requires confirmations before marking full-fill calculations exact', async () => {
  expect(await configure('demo-fuel-3', false)).toMatchObject({
    fuelCalculationStatus: 'ESTIMATE',
    fuelCostMinor: 10125,
  });
  expect(await configure('demo-fuel-3')).toMatchObject({
    fuelCalculationStatus: 'EXACT',
    fuelLitresUsed: 40.5,
    fuelCostPerKmMinor: 115,
  });
});
it('recalculates changed odometers instead of trusting a submitted distance', async () => {
  await recordDemoMutation(path, {
    method: 'PATCH',
    body: JSON.stringify({
      startedAt: '2026-08-03T05:30:00Z',
      endedAt: '2026-08-03T06:30:00Z',
      odometerStartKm: 100,
      odometerEndKm: 110,
      grossRevenue: '25.00',
      distanceKm: 999,
    }),
  });
  expect(
    await readStaticDemoDetail(business, 'work-sessions', 'demo-session-1'),
  ).toMatchObject({
    distanceKm: 10,
    revenuePerHourMinor: 2500,
    revenuePerKmMinor: 250,
  });
});
