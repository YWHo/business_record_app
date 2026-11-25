import { beforeEach, expect, it, vi } from 'vitest';
import { readStaticDemoDetail } from './staticDemoDetails';
import { recordDemoMutation, resetDemoData } from './demoStore';

const delivery = 'business-demo-activity-delivery';
const contracting = 'business-demo-activity-contracting';
beforeEach(async () => {
  await resetDemoData();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Network forbidden');
    }),
  );
});

it('joins fuel evidence and vehicle without losing the parent expense identity', async () => {
  expect(
    await readStaticDemoDetail(delivery, 'expenses', 'demo-fuel-1'),
  ).toMatchObject({
    id: 'demo-fuel-1',
    categoryName: 'Fuel',
    totalAmountMinor: 10480,
    fuelLitres: 40,
    vehicleRegistration: 'KORU24',
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps insurance premium separate from the attributed allocation', async () => {
  expect(
    await readStaticDemoDetail(delivery, 'expenses', 'demo-insurance-vehicle'),
  ).toMatchObject({
    premiumMinor: 12400,
    allocation: {
      method: 'BUSINESS_KM_OVER_TOTAL_KM',
      allocatedAmountMinor: 8928,
      percentageBasisPoints: 7200,
    },
  });
});

it('joins platform and contract details and preserves manual reconciliation', async () => {
  expect(
    await readStaticDemoDetail(delivery, 'income', 'demo-platform-1'),
  ).toMatchObject({
    details: { providerName: 'DoorDash' },
    reconciliation: { matched: true },
  });
  expect(
    await readStaticDemoDetail(contracting, 'income', 'demo-contract-paid'),
  ).toMatchObject({
    details: { clientName: 'Harbour Lantern Limited' },
    reconciliation: null,
  });
});

it('denies a valid record ID under another business and unknown identifiers', async () => {
  await expect(
    readStaticDemoDetail(contracting, 'expenses', 'demo-fuel-1'),
  ).rejects.toThrow('not found');
  await expect(
    readStaticDemoDetail(delivery, 'income', 'absent'),
  ).rejects.toThrow('not found');
});

it('can open browser-created records and removes them on reset', async () => {
  const response = (await recordDemoMutation(
    `/api/businesses/${delivery}/expenses`,
    {
      method: 'POST',
      body: JSON.stringify({
        merchantName: 'Local supplier',
        purchaseDatetime: '2026-09-01T00:00:00Z',
        totalAmount: '10.00',
        expenseType: 'GENERAL',
      }),
    },
  )) as { record: { id: string } };
  expect(
    await readStaticDemoDetail(delivery, 'expenses', response.record.id),
  ).toMatchObject({ merchantName: 'Local supplier', totalAmountMinor: 1000 });
  await resetDemoData();
  await expect(
    readStaticDemoDetail(delivery, 'expenses', response.record.id),
  ).rejects.toThrow('not found');
});
