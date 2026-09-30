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
  const phoneNavigation = page.getByRole('navigation', {
    name: 'Mobile navigation',
  });
  await expect(phoneNavigation.getByRole('link')).toHaveCount(4);
  await expect(
    phoneNavigation.getByRole('link', { name: 'More' }),
  ).toBeVisible();
  expect(
    await page.evaluate<boolean>(
      'document.documentElement.scrollWidth <= window.innerWidth',
    ),
  ).toBe(true);

  await phoneNavigation.getByRole('link', { name: 'More' }).click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Documents/ })).toBeVisible();
  await phoneNavigation.getByRole('link', { name: 'Expenses' }).click();
  await page.getByRole('link', { name: 'Add expense' }).click();
  await expect(
    page.getByRole('heading', { name: 'Add expense' }),
  ).toBeVisible();
  const phoneDate = await page
    .getByLabel('Purchase date and time')
    .boundingBox();
  const phoneAmount = await page.getByLabel('Total amount').boundingBox();
  expect(phoneDate).not.toBeNull();
  expect(phoneAmount).not.toBeNull();
  expect(phoneAmount!.y).toBeGreaterThan(phoneDate!.y);
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
  const tabletDate = await page
    .getByLabel('Purchase date and time')
    .boundingBox();
  const tabletAmount = await page.getByLabel('Total amount').boundingBox();
  expect(tabletDate).not.toBeNull();
  expect(tabletAmount).not.toBeNull();
  expect(tabletAmount!.y).toBeGreaterThan(tabletDate!.y);
  expect(
    await page.evaluate<boolean>(
      'document.documentElement.scrollWidth <= window.innerWidth',
    ),
  ).toBe(true);

  await page.getByRole('link', { name: 'Expenses' }).click();
  await expect(page.locator('.responsive-table-wrap')).toBeVisible();
  await expect(page.locator('.responsive-record-table thead')).toBeVisible();
  expect(
    await page.evaluate<boolean>(
      'document.documentElement.scrollWidth <= window.innerWidth',
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('link', { name: 'My businesses' }).click();
  await page.getByRole('link', { name: 'Accountant view' }).click();
  await expect(
    page.getByRole('heading', { name: 'Accountant view' }),
  ).toBeVisible();
  const accountantGroups = page.locator('.accountant-group');
  await expect(accountantGroups.first()).toBeVisible();
  const firstLandscapeGroup = await accountantGroups.nth(0).boundingBox();
  const secondLandscapeGroup = await accountantGroups.nth(1).boundingBox();
  expect(firstLandscapeGroup).not.toBeNull();
  expect(secondLandscapeGroup).not.toBeNull();
  expect(
    Math.abs(secondLandscapeGroup!.y - firstLandscapeGroup!.y),
  ).toBeLessThan(2);
  expect(
    await page.evaluate<boolean>(
      'document.documentElement.scrollWidth <= window.innerWidth',
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('link', { name: 'My businesses' }).click();
  await page.getByRole('link', { name: 'Open IT Contracting' }).click();
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
