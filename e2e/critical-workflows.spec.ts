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
    page.getByRole('heading', { name: 'My businesses' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open IT Contracting' }).click();
  await expect(
    page.getByRole('heading', { name: 'IT Contracting' }),
  ).toBeVisible();
}

function cardWith(page: Page, content: string): Locator {
  return page.locator('article, tr').filter({ hasText: content }).first();
}

function formControl(form: Locator, label: string): Locator {
  const exactLabel = new RegExp(
    `^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  );
  const adjacentControl = form
    .locator('label')
    .filter({ hasText: exactLabel })
    .locator(
      'xpath=following-sibling::*[self::input or self::select or self::textarea][1]',
    );
  return form.getByLabel(label, { exact: true }).or(adjacentControl).first();
}

test.describe.serial('critical business workflows', () => {
  test('owner and accountant authentication enforce authorization', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await ownerPage.goto(
      '/app/businesses/business-activity-contracting/settings',
    );
    await expect(ownerPage).toHaveURL(/\/login$/);
    await login(ownerPage, 'owner');
    await expect(
      ownerPage.getByRole('link', { name: 'Account settings' }),
    ).toBeVisible();
    await ownerContext.close();

    const accountantContext = await browser.newContext();
    const accountantPage = await accountantContext.newPage();
    await login(accountantPage, 'accountant');
    await expect(
      accountantPage.getByRole('link', { name: 'Account settings' }),
    ).toHaveCount(0);
    await accountantPage
      .getByRole('link', { name: 'Business settings' })
      .click();
    await expect(
      accountantPage.getByText(
        'Accountants can view these business settings. Only the owner can change them.',
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
    await page.getByRole('link', { name: 'Business settings' }).click();
    await page.getByRole('link', { name: 'Activities', exact: true }).click();

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

    await page.getByRole('link', { name: 'Vehicles', exact: true }).click();
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
    await page.getByRole('link', { name: 'Add work session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Add work session' }),
    ).toBeVisible();
    await expect(page.getByLabel('Business activity')).toHaveCount(0);
    await page.getByLabel('Vehicle', { exact: true }).selectOption({
      label: vehicleRegistration,
    });
    await page.getByLabel('Start', { exact: true }).fill('2026-09-01T09:00');
    await page.getByLabel('End', { exact: true }).fill('2026-09-01T11:00');
    await page.getByLabel('Starting odometer (km)').fill('12000');
    await page.getByLabel('Ending odometer (km)').fill('12042');
    await page.getByLabel('Gross revenue (optional)').fill('126.00');
    await page.getByLabel('Notes (optional)').fill('E2E work session');
    await page.getByRole('button', { name: 'Save work session' }).click();
    await expect(
      page.getByRole('heading', {
        name: `${vehicleRegistration} · 42 km`,
      }),
    ).toBeVisible();
    await expect(page.getByText('E2E work session')).toBeVisible();

    await page.getByRole('link', { name: 'Expenses', exact: true }).click();
    await page.getByRole('link', { name: 'Add expense' }).click();
    await expect(
      page.getByRole('heading', { name: 'Add expense' }),
    ).toBeVisible();
    await page.getByLabel('Expense type').selectOption('FUEL');
    const fuelForm = page.locator('form');
    await formControl(fuelForm, 'Vehicle').selectOption({
      label: vehicleRegistration,
    });
    await formControl(fuelForm, 'Merchant').fill('E2E Fuel Stop');
    await formControl(fuelForm, 'Purchase date and time').fill(
      '2026-09-01T12:00',
    );
    await formControl(fuelForm, 'Total amount').fill('100.00');
    await formControl(fuelForm, 'GST amount (optional)').fill('13.04');
    await formControl(fuelForm, 'GST status').selectOption('GST_INCLUDED');
    await formControl(fuelForm, 'Fuel station (optional)').fill(
      'E2E Fuel Stop',
    );
    await formControl(fuelForm, 'Price per litre (optional)').fill('2.50');
    await formControl(fuelForm, 'Litres (optional)').fill('40');
    await formControl(fuelForm, 'Odometer (km, optional)').fill('12042');
    await fuelForm.getByRole('button', { name: 'Save expense' }).click();
    await expect(
      page.getByRole('heading', { name: 'E2E Fuel Stop' }),
    ).toBeVisible();
    await expect(page.getByText('$100.00')).toBeVisible();

    await page.getByRole('link', { name: 'Expenses', exact: true }).click();
    await page.getByRole('link', { name: 'Add expense' }).click();
    await expect(
      page.getByRole('heading', { name: 'Add expense' }),
    ).toBeVisible();
    await page.getByLabel('Expense type').selectOption('PARKING');
    const parkingForm = page.locator('form');
    await formControl(parkingForm, 'Provider (optional)').fill(parkingProvider);
    await formControl(parkingForm, 'Location').fill('E2E Waterfront Garage');
    await formControl(parkingForm, 'Purchase date and time').fill(
      '2026-09-01T13:00',
    );
    await formControl(parkingForm, 'Total amount').fill('18.00');
    await parkingForm.locator('select').nth(0).selectOption('GST_INCLUDED');
    await parkingForm.locator('select').nth(2).selectOption({
      label: vehicleRegistration,
    });
    await formControl(parkingForm, 'Reference / ticket number (optional)').fill(
      'E2E-PARK-001',
    );
    await parkingForm.getByRole('button', { name: 'Save expense' }).click();
    await expect(
      page.getByRole('heading', { name: parkingProvider }),
    ).toBeVisible();
    await expect(page.getByText('E2E Waterfront Garage')).toBeVisible();
    await page.getByLabel('Choose existing photo or PDF').setInputFiles({
      name: 'e2e-receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%%EOF\n'),
    });
    await page.getByRole('button', { name: 'Upload document' }).click();
    await expect(
      page.getByRole('link', { name: 'e2e-receipt.pdf' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Documents' }).click();
    await expect(
      page.getByRole('heading', { name: 'Documents' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'e2e-receipt.pdf' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /missing attachments/i }),
    ).toBeVisible();
  });

  test('owner records platform, IT invoice, and SaaS income', async ({
    page,
  }) => {
    await login(page, 'owner');
    await page.getByLabel('Current business').selectOption({
      label: 'Delivery Platform',
    });
    await expect(page).toHaveURL(/business-activity-delivery$/);
    await page.getByRole('link', { name: 'Income', exact: true }).click();
    await page.getByRole('link', { name: 'Add income' }).click();
    let form = page.locator('form');
    await form.getByLabel('Provider').fill(platformProvider);
    await form.getByLabel('Payment date').fill('2026-09-02');
    await form.getByLabel('Earning period start').fill('2026-09-01');
    await form.getByLabel('Earning period end').fill('2026-09-02');
    await form.getByLabel('Gross earnings').fill('150.00');
    await form.getByLabel('Platform fees').fill('20.00');
    await form.getByLabel('Net payment received').fill('130.00');
    await form.getByRole('button', { name: 'Save income' }).click();
    await expect(
      page.getByRole('heading', { name: platformProvider }),
    ).toBeVisible();
    await expect(page.getByText('$130.00').first()).toBeVisible();

    await page.getByLabel('Current business').selectOption({
      label: 'IT Contracting',
    });
    await expect(page).toHaveURL(/business-activity-contracting$/);
    await page.getByRole('link', { name: 'Income', exact: true }).click();
    await page.getByRole('link', { name: 'Add income' }).click();
    form = page.locator('form');
    await form.getByLabel('Income type').selectOption('CONTRACT');
    await form.getByLabel('Client').selectOption({
      label: contractClient,
    });
    await form.getByLabel('Invoice number').fill(contractInvoice);
    await form.getByLabel('Invoice date').fill('2026-09-03');
    await form.getByLabel('Subtotal').fill('1000.00');
    await form.getByLabel('GST').fill('150.00');
    await form.getByLabel('Invoice total').fill('1150.00');
    await form.getByLabel('Payment status').selectOption('ISSUED');
    await form.getByRole('button', { name: 'Save income' }).click();
    await expect(
      page.getByRole('heading', { name: new RegExp(contractInvoice) }),
    ).toBeVisible();
    await expect(page.getByText('$1,150.00').first()).toBeVisible();

    await page.getByLabel('Current business').selectOption({
      label: 'SaaS Business',
    });
    await expect(page).toHaveURL(/business-activity-saas$/);
    await page.getByRole('link', { name: 'Income', exact: true }).click();
    await page.getByRole('link', { name: 'Add income' }).click();
    form = page.locator('form');
    await form.getByLabel('Income type').selectOption('SUBSCRIPTION');
    await form.getByLabel('Summary period start').fill('2026-09-01');
    await form.getByLabel('Summary period end').fill('2026-09-30');
    await form.getByLabel('Gross revenue').fill('600.00');
    await form.getByLabel('Refunds').fill('25.00');
    await form.getByLabel('Platform fees').fill('50.00');
    await form.getByLabel('Payment processing fees').fill('15.00');
    await form.getByLabel('Net payment received').fill('510.00');
    await form.getByLabel('Subscriber count').fill('42');
    await form.getByLabel('Notes').fill(subscriptionNotes);
    await form.getByRole('button', { name: 'Save income' }).click();
    await expect(page.getByText(subscriptionNotes)).toBeVisible();
    await expect(page.getByText('$510.00').first()).toBeVisible();
  });

  test('accountant reviews records and edits permitted accounting fields', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await login(ownerPage, 'owner');
    await ownerPage.getByRole('link', { name: 'Transactions' }).click();
    await ownerPage.getByLabel('Search transactions').fill(contractClient);
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
    await accountantPage.getByLabel('Search transactions').fill(contractClient);
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

    await accountantPage.getByLabel('Current business').selectOption({
      label: 'Delivery Platform',
    });
    await expect(accountantPage).toHaveURL(
      /business-activity-delivery(?:\/|$)/,
    );
    await accountantPage
      .getByRole('link', { name: 'Income', exact: true })
      .click();
    await expect(
      accountantPage.getByRole('link', { name: 'Add income' }),
    ).toHaveCount(0);
    await accountantPage.getByRole('link', { name: platformProvider }).click();
    await accountantPage.getByRole('button', { name: 'Reconcile' }).click();
    await accountantPage.getByLabel('Actual').fill('129.50');
    await accountantPage.getByLabel('Notes').fill('E2E bank reconciliation');
    await accountantPage
      .getByRole('button', { name: 'Save reconciliation' })
      .click();
    await expect(accountantPage.getByText('Difference:')).toBeVisible();
    await accountantContext.close();
  });

  test('search, filters, export, invitations, trash, and retention work', async ({
    page,
  }) => {
    await login(page, 'owner');
    await page.getByRole('link', { name: 'Transactions' }).click();
    await page.getByLabel('Search transactions').fill(parkingProvider);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(cardWith(page, parkingProvider)).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByLabel('Income or expense').selectOption('INCOME');
    await page.getByText('More filters').click();
    await page.getByLabel('Record type').selectOption('CONTRACT');
    await page.getByLabel('Status').selectOption('REVIEWED');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(cardWith(page, contractClient)).toBeVisible();
    await expect(cardWith(page, parkingProvider)).toHaveCount(0);

    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await page.getByLabel('Export scope').selectOption('FULL');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download portable ZIP' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    expect(await download.failure()).toBeNull();

    await page.getByRole('link', { name: 'Account settings' }).click();
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

    await page.getByLabel('Open account menu').click();
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
    await page.getByLabel('Search transactions').fill(parkingProvider);
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
    await page.getByLabel('Search transactions').fill(parkingProvider);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(cardWith(page, parkingProvider)).toBeVisible();
  });

  test('owner creates a legal-entity boundary without rewriting history', async ({
    page,
  }) => {
    await login(page, 'owner');
    await page
      .getByLabel('Current business')
      .selectOption('business-activity-delivery');
    const transactionsPath =
      '/api/businesses/business-activity-delivery/transactions?dateFrom=2026-01-01&dateTo=2026-12-31';
    const beforeResponse = await page.request.get(transactionsPath);
    expect(beforeResponse.ok()).toBeTruthy();
    const before = (await beforeResponse.json()) as {
      transactions: Array<{ id: string; legalEntityId: string }>;
    };
    const historical = before.transactions[0];
    expect(historical).toBeTruthy();

    await page.getByRole('link', { name: 'Business settings' }).click();
    await page.getByRole('link', { name: 'Legal entity' }).click();
    await page.getByRole('link', { name: 'Add new period' }).click();
    await page
      .getByLabel('New legal entity')
      .selectOption('dev-entity-taxi-limited');
    await page.getByLabel('Effective from').fill('2027-04-01');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page
      .getByLabel('Notes (optional)')
      .fill('E2E structural accounting boundary.');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByText('Local Taxi Limited — Limited company'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Confirm change' }).click();

    await expect(
      page.getByText('Legal-entity operating period added.'),
    ).toBeVisible();
    await expect(page.getByText('Local Taxi Limited')).toBeVisible();
    await expect(page.getByText('31 Mar 2027')).toBeVisible();
    const afterResponse = await page.request.get(transactionsPath);
    const after = (await afterResponse.json()) as {
      transactions: Array<{ id: string; legalEntityId: string }>;
    };
    expect(
      after.transactions.find((record) => record.id === historical.id)
        ?.legalEntityId,
    ).toBe(historical.legalEntityId);
  });
});
