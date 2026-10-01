import { expect, test, type Page } from '@playwright/test';

async function openOwnerWorkspace(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as local owner' }).click();
  await expect(
    page.getByRole('heading', { name: 'My businesses' }),
  ).toBeVisible();
}

async function capture(page: Page, name: string) {
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    maxDiffPixelRatio: 0.005,
  });
}

async function createVisualExpense(page: Page) {
  await page.getByRole('link', { name: 'Open IT Contracting' }).click();
  await page.getByRole('link', { name: 'Expenses', exact: true }).click();
  await page.getByRole('link', { name: 'Add expense' }).click();
  await page.getByLabel('Merchant').fill('Visual Officeworks');
  await page.getByLabel('Expense category').selectOption({ index: 1 });
  await page.getByLabel('Purchase date and time').fill('2026-09-15T10:00');
  await page.getByLabel('Total amount').fill('89.90');
  await page.getByLabel('GST status').selectOption('NO_GST');
  await page.getByRole('button', { name: 'Save expense' }).click();
  const saveAnyway = page.getByRole('button', { name: 'Save anyway' });
  if (await saveAnyway.isVisible()) await saveAnyway.click();
  await expect(
    page.getByRole('heading', { name: 'Visual Officeworks' }),
  ).toBeVisible();
  await page.goto('/app/businesses');
}

async function discardDraft(page: Page) {
  await page.getByRole('link', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Leave without saving' }).click();
}

test('representative business workspaces retain their responsive layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOwnerWorkspace(page);
  await createVisualExpense(page);
  await capture(page, 'desktop-my-businesses.png');

  await page.getByRole('link', { name: 'Open IT Contracting' }).click();
  await capture(page, 'desktop-business-dashboard.png');

  await page.getByRole('link', { name: 'Expenses', exact: true }).click();
  await capture(page, 'desktop-expenses.png');
  await page.getByRole('link', { name: 'Add expense' }).click();
  await page.getByLabel('Purchase date and time').fill('2026-09-15T10:00');
  await page.getByRole('heading', { name: 'Add expense' }).click();
  await capture(page, 'desktop-add-expense.png');
  await discardDraft(page);

  await page.getByRole('link', { name: 'Business settings' }).click();
  await page.getByRole('link', { name: 'Legal entity' }).click();
  await capture(page, 'desktop-operating-periods.png');

  await page.goto('/app/accountant');
  await expect(
    page.getByRole('heading', { name: 'Accountant view' }),
  ).toBeVisible();
  await capture(page, 'desktop-accountant-view.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/businesses');
  await capture(page, 'phone-my-businesses.png');
  await page.getByRole('link', { name: 'Open IT Contracting' }).click();
  await capture(page, 'phone-business-dashboard.png');
  await page.getByRole('link', { name: 'Expenses', exact: true }).click();
  await page.getByRole('link', { name: 'Add expense' }).click();
  await page.getByLabel('Purchase date and time').fill('2026-09-15T10:00');
  await page.getByRole('heading', { name: 'Add expense' }).click();
  await capture(page, 'phone-add-expense.png');
  await discardDraft(page);

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/app/businesses/business-activity-contracting/expenses');
  await expect(
    page.getByRole('heading', { name: 'Expenses', exact: true }),
  ).toBeVisible();
  await capture(page, 'tablet-portrait-expenses.png');

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/app/accountant');
  await expect(
    page.getByRole('heading', { name: 'Accountant view' }),
  ).toBeVisible();
  await capture(page, 'tablet-landscape-accountant.png');
});
