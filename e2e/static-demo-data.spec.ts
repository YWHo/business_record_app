import { expect, test } from '@playwright/test';

test('static demo reads and overlay changes need no backend requests', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  await page.route('**/api/**', async (route) => {
    apiRequests.push(route.request().url());
    await route.abort();
  });
  // Empty same-origin harness: do not mount the legacy authenticated app here.
  await page.route('**/static-demo-harness', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<main>Static demo data harness</main>',
    }),
  );
  await page.goto('/static-demo-harness');
  const result = await page.evaluate(`(async () => {
    const { readStaticDemoBusinesses, readStaticDemoRecords } = await import('/src/features/demo/staticDemoClient.ts');
    const { recordDemoMutation, resetDemoData } = await import('/src/features/demo/demoStore.ts');
    await resetDemoData();
    const names = (await readStaticDemoBusinesses()).businesses.map((business) => business.name);
    const businessId = 'business-demo-activity-rideshare';
    await recordDemoMutation('/api/businesses/' + businessId + '/expenses', {
      method: 'POST', body: JSON.stringify({ expenseType: 'GENERAL', merchantName: 'Offline browser example', purchaseDatetime: '2026-09-20T00:00:00Z', totalAmount: '12.34' }),
    });
    const { readStaticDemoDetail } = await import('/src/features/demo/staticDemoDetails.ts');
    const fuel = await readStaticDemoDetail('business-demo-activity-delivery', 'expenses', 'demo-fuel-1');
    if (fuel.fuelLitres !== 40 || fuel.vehicleRegistration !== 'KORU24') throw new Error('Static fuel detail missing');
    const beforeReload = await readStaticDemoRecords(businessId, 'expenses', { search: 'Offline browser example' });
    const created = await readStaticDemoDetail(businessId, 'expenses', beforeReload.records[0].id);
    if (created.totalAmountMinor !== 1234) throw new Error('Browser-created detail missing');
    return { names, count: beforeReload.resultCount };
  })()`);
  expect(result).toEqual({
    names: ['DoorDash', 'Uber', 'IT Contracting', 'Music Streaming'],
    count: 1,
  });
  await page.reload();
  const persisted = await page.evaluate(`(async () => {
    const { readStaticDemoRecords } = await import('/src/features/demo/staticDemoClient.ts');
    const { resetDemoData } = await import('/src/features/demo/demoStore.ts');
    const query = { search: 'Offline browser example' };
    const saved = await readStaticDemoRecords('business-demo-activity-rideshare', 'expenses', query);
    await resetDemoData();
    const reset = await readStaticDemoRecords('business-demo-activity-rideshare', 'expenses', query);
    return { saved: saved.resultCount, reset: reset.resultCount };
  })()`);
  expect(persisted).toEqual({ saved: 1, reset: 0 });
  expect(apiRequests).toEqual([]);
});
