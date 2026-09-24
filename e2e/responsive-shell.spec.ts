import { expect, test } from '@playwright/test';

test('business context remains usable across phone, tablet, and desktop layouts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as local owner' }).click();

  await expect(
    page.getByRole('heading', { name: 'My businesses' }),
  ).toBeVisible();
  const businessCards = page.locator('.business-card');
  await expect(businessCards).toHaveCount(4);
  await expect(
    page.getByRole('article').filter({ hasText: 'IT Contracting' }),
  ).toContainText('Local Sole Trader');
  await expect(
    page.getByRole('article').filter({ hasText: 'IT Contracting' }),
  ).toContainText('Sole trader');

  const firstPhoneCard = await businessCards.nth(0).boundingBox();
  const secondPhoneCard = await businessCards.nth(1).boundingBox();
  expect(firstPhoneCard).not.toBeNull();
  expect(secondPhoneCard).not.toBeNull();
  expect(secondPhoneCard!.y).toBeGreaterThan(firstPhoneCard!.y);

  await page.setViewportSize({ width: 1280, height: 800 });
  const firstDesktopCard = await businessCards.nth(0).boundingBox();
  const secondDesktopCard = await businessCards.nth(1).boundingBox();
  expect(firstDesktopCard).not.toBeNull();
  expect(secondDesktopCard).not.toBeNull();
  expect(Math.abs(secondDesktopCard!.y - firstDesktopCard!.y)).toBeLessThan(2);
  expect(secondDesktopCard!.x).toBeGreaterThan(firstDesktopCard!.x);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Open IT Contracting' }).click();

  await expect(page.getByLabel('Current business')).toHaveValue(
    'business-activity-contracting',
  );
  await expect(
    page.getByRole('heading', { name: 'IT Contracting' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Local Sole Trader \(Sole trader\)/),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Needs attention' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Recent transactions' }),
  ).toBeVisible();
  await expect(page.getByText('Direct operating contribution')).toHaveCount(0);
  const dashboardMetrics = page.locator('.dashboard-metrics .metric-card');
  await expect(dashboardMetrics).toHaveCount(3);
  const firstPhoneMetric = await dashboardMetrics.nth(0).boundingBox();
  const secondPhoneMetric = await dashboardMetrics.nth(1).boundingBox();
  const thirdPhoneMetric = await dashboardMetrics.nth(2).boundingBox();
  expect(firstPhoneMetric).not.toBeNull();
  expect(secondPhoneMetric).not.toBeNull();
  expect(thirdPhoneMetric).not.toBeNull();
  expect(Math.abs(secondPhoneMetric!.y - firstPhoneMetric!.y)).toBeLessThan(2);
  expect(thirdPhoneMetric!.y).toBeGreaterThan(firstPhoneMetric!.y);
  await expect(page.locator('.shell-sidebar')).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation' }),
  ).toBeVisible();
  expect(
    await page.evaluate<boolean>(
      'document.documentElement.scrollWidth <= window.innerWidth',
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator('.shell-sidebar')).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation' }),
  ).toBeHidden();
  await expect(page.getByLabel('Current business')).toBeVisible();
  const tabletMetricBoxes = await Promise.all(
    [0, 1, 2].map((index) => dashboardMetrics.nth(index).boundingBox()),
  );
  tabletMetricBoxes.forEach((box) => expect(box).not.toBeNull());
  expect(
    Math.max(...tabletMetricBoxes.map((box) => box!.y)) -
      Math.min(...tabletMetricBoxes.map((box) => box!.y)),
  ).toBeLessThan(2);
  expect(
    await page.evaluate<boolean>(
      'document.documentElement.scrollWidth <= window.innerWidth',
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByLabel('Current business')
    .selectOption('business-activity-delivery');
  await expect(page).toHaveURL(
    /\/app\/businesses\/business-activity-delivery$/,
  );
  await expect(page.getByLabel('Current business')).toHaveValue(
    'business-activity-delivery',
  );
  await expect(
    page.getByRole('navigation', { name: 'Delivery Platform navigation' }),
  ).toBeVisible();
});
