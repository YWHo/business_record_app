import { expect, test, type Locator, type Page } from '@playwright/test';

const activityName = 'E2E Courier Services';
const vehicleRegistration = 'E2E123';
const platformProvider = 'E2E Delivery Network';
const contractInvoice = 'E2E-INV-001';
const contractClient = 'Harbour Digital Limited';
const subscriptionNotes = 'E2E SaaS monthly summary';
const parkingProvider = 'E2E City Parking';
const inviteeEmail = 'e2e-accountant@local.test';

async function login(page: Page, role: 'owner' | 'accountant') {
  await page.goto('/login');
  await page.getByRole('button', { name: `Continue as local ${role}` }).click();
  await expect(
    page.getByRole('heading', { name: 'Your business at a glance' }),
  ).toBeVisible();
}

function cardWith(page: Page, content: string): Locator {
  return page.locator('article').filter({ hasText: content }).first();
}

test.describe.serial('critical business workflows', () => {
  test('owner and accountant authentication enforce authorization', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await ownerPage.goto('/setup');
    await expect(ownerPage).toHaveURL(/\/login$/);
    await login(ownerPage, 'owner');
    await expect(ownerPage.getByRole('link', { name: 'Users' })).toBeVisible();
    await ownerContext.close();

    const accountantContext = await browser.newContext();
    const accountantPage = await accountantContext.newPage();
    await login(accountantPage, 'accountant');
    await expect(
      accountantPage.getByRole('link', { name: 'Users' }),
    ).toHaveCount(0);
    await accountantPage.getByRole('link', { name: 'Setup' }).click();
    await expect(
      accountantPage.getByText(
        'Accountants can view this setup. Only the owner can change it.',
      ),
    ).toBeVisible();
    await expect(
      accountantPage.getByRole('button', { name: 'Add activity' }),
    ).toHaveCount(0);

    const forbidden = await accountantPage.request.post(
      '/api/business-activities',
      {
        data: {
          name: 'Forbidden activity',
          activityType: 'PROFESSIONAL_SERVICES',
          startedAt: '2026-09-01',
        },
      },
    );
    expect(forbidden.status()).toBe(403);
    await accountantContext.close();
  });

  test('owner creates reference data, mileage, fuel, parking, and a receipt', async ({
    page,
  }) => {
    await login(page, 'owner');
    await page.getByRole('link', { name: 'Setup' }).click();

    const activityRegion = page.getByRole('region', {
      name: 'Business activities',
    });
    await activityRegion.getByLabel('Name', { exact: true }).fill(activityName);
    await activityRegion
      .getByLabel('Type', { exact: true })
      .fill('PLATFORM_SERVICES');
    await activityRegion
      .getByLabel('Start date', { exact: true })
      .fill('2026-09-01');
    await activityRegion.getByRole('button', { name: 'Add activity' }).click();
    await expect(page.getByText('Business activity added.')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: activityName }),
    ).toBeVisible();

    const vehicleRegion = page.getByRole('region', { name: 'Vehicles' });
    await vehicleRegion
      .getByLabel('Registration', { exact: true })
      .fill(vehicleRegistration);
    await vehicleRegion
      .getByLabel('Description', { exact: true })
      .fill('E2E test vehicle');
    await vehicleRegion
      .getByLabel('Acquired date', { exact: true })
      .fill('2026-09-01');
    await vehicleRegion.getByRole('button', { name: 'Add vehicle' }).click();
    await expect(page.getByText('Vehicle added.')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: vehicleRegistration }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Mileage' }).click();
    await page.getByLabel('Business activity', { exact: true }).selectOption({
      label: activityName,
    });
    await page.getByLabel('Vehicle', { exact: true }).selectOption({
      label: vehicleRegistration,
    });
    await page.getByLabel('Start', { exact: true }).fill('2026-09-01T09:00');
    await page.getByLabel('End', { exact: true }).fill('2026-09-01T11:00');
    await page.getByLabel('Starting odometer (km)').fill('12000');
    await page.getByLabel('Ending odometer (km)').fill('12042');
    await page.getByLabel('Gross revenue (optional)').fill('126.00');
    await page.getByLabel('Notes (optional)').fill('E2E work session');
    await page.getByRole('button', { name: 'Add session' }).click();
    await expect(page.getByText(/Work session added/)).toBeVisible();
    await expect(cardWith(page, 'E2E work session')).toContainText('42 km');

    await page.getByRole('link', { name: 'Fuel' }).click();
    const fuelForm = page
      .getByRole('heading', { name: 'Add fuel expense' })
      .locator('..');
    await fuelForm
      .locator('select')
      .nth(0)
      .selectOption({ label: activityName });
    await fuelForm.locator('select').nth(1).selectOption({
      label: vehicleRegistration,
    });
    await fuelForm.locator('input').nth(0).fill('E2E Fuel Stop');
    await fuelForm.locator('input').nth(1).fill('2026-09-01T12:00');
    await fuelForm.locator('input').nth(2).fill('100.00');
    await fuelForm.locator('input').nth(3).fill('13.04');
    await fuelForm.locator('select').nth(2).selectOption('GST_INCLUDED');
    await fuelForm.locator('input').nth(4).fill('E2E Fuel Stop');
    await fuelForm.locator('input').nth(5).fill('2.50');
    await fuelForm.locator('input').nth(6).fill('40');
    await fuelForm.locator('input').nth(7).fill('12042');
    await fuelForm.getByRole('button', { name: 'Add fuel expense' }).click();
    await expect(page.getByText('Fuel expense added.')).toBeVisible();
    await expect(cardWith(page, 'E2E Fuel Stop')).toContainText('$100.00');

    await page.getByRole('link', { name: 'Records' }).click();
    const parkingForm = page
      .getByRole('heading', { name: 'Add parking' })
      .locator('..');
    await parkingForm.getByLabel('Provider (optional)').fill(parkingProvider);
    await parkingForm.getByLabel('Location').fill('E2E Waterfront Garage');
    await parkingForm
      .getByLabel('Business activity (optional)')
      .selectOption({ label: activityName });
    await parkingForm
      .getByLabel('Purchase date and time')
      .fill('2026-09-01T13:00');
    await parkingForm.getByLabel('Total amount').fill('18.00');
    await parkingForm.getByLabel('GST status').selectOption('GST_INCLUDED');
    await parkingForm.getByLabel('Vehicle (optional)').selectOption({
      label: vehicleRegistration,
    });
    await parkingForm
      .getByLabel('Reference / ticket number (optional)')
      .fill('E2E-PARK-001');
    await parkingForm
      .getByRole('button', { name: 'Add parking expense' })
      .click();
    await expect(page.getByText('Expense added.')).toBeVisible();

    const parkingCard = cardWith(page, parkingProvider);
    await expect(parkingCard).toContainText('E2E Waterfront Garage');
    await parkingCard.getByLabel('Choose existing photo or PDF').setInputFiles({
      name: 'e2e-receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%%EOF\n'),
    });
    await parkingCard.getByRole('button', { name: 'Upload document' }).click();
    await expect(
      parkingCard.getByRole('link', { name: 'e2e-receipt.pdf' }),
    ).toBeVisible();
  });

  test('owner records platform, IT invoice, and SaaS income', async ({
    page,
  }) => {
    await login(page, 'owner');
    await page.getByRole('link', { name: 'Income' }).click();
    const form = page
      .getByRole('heading', { name: 'Add income' })
      .locator('..');

    await form.getByLabel('Business activity').selectOption({
      label: 'Delivery Platform',
    });
    await form.getByLabel('Provider').fill(platformProvider);
    await form.getByLabel('Payment date').fill('2026-09-02');
    await form.getByLabel('Earning period start').fill('2026-09-01');
    await form.getByLabel('Earning period end').fill('2026-09-02');
    await form.getByLabel('Gross earnings').fill('150.00');
    await form.getByLabel('Platform fees').fill('20.00');
    await form.getByLabel('Net payment received').fill('130.00');
    await form.getByRole('button', { name: 'Add income' }).click();
    await expect(cardWith(page, platformProvider)).toContainText('$130.00');

    await form.getByLabel('Income type').selectOption('CONTRACT');
    await form.getByLabel('Business activity').selectOption({
      label: 'IT Contracting',
    });
    await form.getByLabel('Client').selectOption({
      label: contractClient,
    });
    await form.getByLabel('Invoice number').fill(contractInvoice);
    await form.getByLabel('Invoice date').fill('2026-09-03');
    await form.getByLabel('Subtotal').fill('1000.00');
    await form.getByLabel('GST').fill('150.00');
    await form.getByLabel('Invoice total').fill('1150.00');
    await form.getByLabel('Payment status').selectOption('ISSUED');
    await form.getByRole('button', { name: 'Add income' }).click();
    await expect(cardWith(page, contractInvoice)).toContainText('$1,150.00');

    await form.getByLabel('Income type').selectOption('SUBSCRIPTION');
    await form.getByLabel('Business activity').selectOption({
      label: 'SaaS Business',
    });
    await form.getByLabel('Summary period start').fill('2026-09-01');
    await form.getByLabel('Summary period end').fill('2026-09-30');
    await form.getByLabel('Gross revenue').fill('600.00');
    await form.getByLabel('Refunds').fill('25.00');
    await form.getByLabel('Platform fees').fill('50.00');
    await form.getByLabel('Payment processing fees').fill('15.00');
    await form.getByLabel('Net payment received').fill('510.00');
    await form.getByLabel('Subscriber count').fill('42');
    await form.getByLabel('Notes').fill(subscriptionNotes);
    await form.getByRole('button', { name: 'Add income' }).click();
    await expect(cardWith(page, subscriptionNotes)).toContainText('$510.00');
  });

  test('accountant reviews records and edits permitted accounting fields', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await login(ownerPage, 'owner');
    await ownerPage.getByRole('link', { name: 'Transactions' }).click();
    await ownerPage
      .getByLabel('Search merchant, client, or type')
      .fill(contractClient);
    await ownerPage
      .getByRole('button', { name: 'Search', exact: true })
      .click();
    const ownerCard = cardWith(ownerPage, contractClient);
    await ownerCard
      .getByRole('button', { name: 'Review and comments' })
      .click();
    await ownerCard.getByLabel('Status').selectOption('READY_FOR_REVIEW');
    await ownerCard.getByRole('button', { name: 'Update status' }).click();
    await expect(ownerCard.locator('.status-badge')).toHaveText(
      'ready for review',
    );
    await ownerContext.close();

    const accountantContext = await browser.newContext();
    const accountantPage = await accountantContext.newPage();
    await login(accountantPage, 'accountant');
    await accountantPage.getByRole('link', { name: 'Transactions' }).click();
    await accountantPage
      .getByLabel('Search merchant, client, or type')
      .fill(contractClient);
    await accountantPage
      .getByRole('button', { name: 'Search', exact: true })
      .click();
    const accountantCard = cardWith(accountantPage, contractClient);
    await accountantCard
      .getByRole('button', { name: 'Review and comments' })
      .click();
    await accountantCard.getByLabel('Status').selectOption('REVIEWED');
    await accountantCard
      .getByLabel('Add comment')
      .fill('E2E accountant reviewed evidence.');
    await accountantCard.getByRole('button', { name: 'Add comment' }).click();
    await expect(
      accountantCard.getByText('E2E accountant reviewed evidence.'),
    ).toBeVisible();
    await accountantCard.getByRole('button', { name: 'Update status' }).click();
    await expect(accountantCard.locator('.status-badge')).toHaveText(
      'reviewed',
    );

    await accountantPage.getByRole('link', { name: 'Income' }).click();
    await expect(
      accountantPage.getByRole('button', { name: 'Add income' }),
    ).toHaveCount(0);
    const platformCard = cardWith(accountantPage, platformProvider);
    await platformCard.getByRole('button', { name: 'Reconcile' }).click();
    await platformCard.getByLabel('Actual').fill('129.50');
    await platformCard.getByLabel('Notes').fill('E2E bank reconciliation');
    await platformCard
      .getByRole('button', { name: 'Save reconciliation' })
      .click();
    await expect(platformCard.getByText('Difference:')).toBeVisible();
    await accountantContext.close();
  });

  test('search, filters, export, invitations, trash, and retention work', async ({
    page,
  }) => {
    await login(page, 'owner');
    await page.getByRole('link', { name: 'Transactions' }).click();
    await page
      .getByLabel('Search merchant, client, or type')
      .fill(parkingProvider);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(cardWith(page, parkingProvider)).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByLabel('Income or expense').selectOption('INCOME');
    await page.getByLabel('Record type').selectOption('CONTRACT');
    await page.getByLabel('Status').selectOption('REVIEWED');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(cardWith(page, contractClient)).toBeVisible();
    await expect(cardWith(page, parkingProvider)).toHaveCount(0);

    await page.getByRole('link', { name: 'Exports' }).click();
    await page.getByLabel('Export scope').selectOption('FULL');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download portable ZIP' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    expect(await download.failure()).toBeNull();

    await page.getByRole('link', { name: 'Users' }).click();
    await page.getByLabel('Email address').fill(inviteeEmail);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(
      page.getByText('Invitation created and queued for delivery.'),
    ).toBeVisible();
    const outboxResponse = await page.request.get(
      '/api/dev/invitations/outbox',
    );
    expect(outboxResponse.ok()).toBeTruthy();
    const outbox = (await outboxResponse.json()) as {
      messages: Array<{
        recipient_email: string;
        invitation_url: string;
      }>;
    };
    const invitation = outbox.messages.find(
      (message) => message.recipient_email === inviteeEmail,
    );
    expect(invitation).toBeTruthy();
    if (!invitation)
      throw new Error('Invitation was not written to the outbox.');
    const invitationUrl = new URL(invitation.invitation_url);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto(`${invitationUrl.pathname}${invitationUrl.search}`);
    await page.getByLabel('Email address').fill(inviteeEmail);
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page.getByText(/Invitation accepted/)).toBeVisible();

    await page.goto('/accept-invitation?token=expired-local-invite');
    await page.getByLabel('Email address').fill('expired-invitee@local.test');
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page.getByRole('alert')).toContainText('expired');

    await login(page, 'owner');
    await page.getByRole('link', { name: 'Transactions' }).click();
    await page
      .getByLabel('Search merchant, client, or type')
      .fill(parkingProvider);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const trashCard = cardWith(page, parkingProvider);
    page.once('dialog', (dialog) => dialog.accept());
    await trashCard.getByRole('button', { name: 'Move to trash' }).click();
    await expect(page.getByText('Record moved to trash.')).toBeVisible();

    await page.getByRole('link', { name: 'Governance' }).click();
    const governanceCard = cardWith(page, parkingProvider);
    await expect(
      governanceCard.getByRole('button', { name: 'Permanently purge' }),
    ).toBeDisabled();
    await governanceCard.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Record restored.')).toBeVisible();
    await expect(cardWith(page, parkingProvider)).toHaveCount(0);

    await page.getByRole('link', { name: 'Transactions' }).click();
    await page
      .getByLabel('Search merchant, client, or type')
      .fill(parkingProvider);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(cardWith(page, parkingProvider)).toBeVisible();
  });
});
