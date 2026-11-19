import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('accountant retains attributed review, reconciliation, allocation and export access while auditor stays read-only', async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const business = 'business-activity-contracting',
    base = `/app/businesses/${business}`;
  expect(
    (
      await request.post('/api/dev/auth/login', {
        data: { email: 'owner@local.test' },
      })
    ).status(),
  ).toBe(200);
  const policyResponse = await request.post(
    `/api/businesses/${business}/expenses`,
    {
      data: {
        expenseType: 'INSURANCE',
        insuranceType: 'PROFESSIONAL_LIABILITY',
        provider: 'Accountant review policy',
        policyPeriodStart: '2026-04-01',
        policyPeriodEnd: '2027-03-31',
        purchaseDatetime: '2026-09-01T00:00:00.000Z',
        totalAmount: '1200.00',
        currency: 'NZD',
        gstStatus: 'NO_GST',
        allocationMethod: 'MANUAL_PERCENTAGE',
        allocationPercentage: '50',
      },
    },
  );
  expect(policyResponse.status(), await policyResponse.text()).toBe(201);
  const policy = (await policyResponse.json()).insuranceRecord;
  const incomeResponse = await request.post(
    `/api/businesses/${business}/income`,
    {
      data: {
        incomeType: 'GENERAL',
        receivedFrom: 'Accountant review client',
        transactionDate: '2026-09-15',
        totalAmount: '125.00',
        currency: 'NZD',
      },
    },
  );
  expect(incomeResponse.status(), await incomeResponse.text()).toBe(201);
  const income = (await incomeResponse.json()).incomeRecord;
  expect(
    (
      await request.post('/api/attachments', {
        multipart: {
          recordType: 'EXPENSE',
          recordId: policy.id,
          file: {
            name: 'accountant-review-evidence.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from(
              '%PDF-1.4\nSynthetic accountant evidence\n%%EOF',
            ),
          },
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await request.patch('/api/record-status', {
        data: {
          recordType: 'EXPENSE',
          recordId: policy.id,
          businessId: business,
          status: 'READY_FOR_REVIEW',
        },
      })
    ).status(),
  ).toBe(200);

  const context = await browser.newContext({ baseURL });
  context.setDefaultTimeout(15_000);
  try {
    const page = await context.newPage();
    await page.goto('/login');
    await page
      .getByRole('button', { name: 'Continue as local accountant' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'My businesses' }),
    ).toBeVisible();
    await expect(page.getByLabel('Accountant access')).toContainText(
      'Review access',
    );
    await expect(page.getByLabel('Accountant access')).not.toContainText(
      'Read-only',
    );
    await page.goto(`${base}/expenses/${policy.id}`);
    await expect(
      page.getByRole('heading', { name: 'Accountant review policy' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit expense' })).toHaveCount(
      0,
    );
    await expect(page.getByLabel('Take a photo')).toHaveCount(0);
    await page.getByRole('button', { name: 'Adjust allocation' }).click();
    await page.getByLabel('Allocated business amount').fill('720.00');
    await page
      .getByLabel('Adjustment notes')
      .fill('Accountant checked policy evidence.');
    await page.getByRole('button', { name: 'Save adjustment' }).click();
    await expect(page.getByRole('status')).toContainText(
      'reviewer attribution',
    );
    await expect(
      page.getByText('$1,200.00', { exact: true }).last(),
    ).toBeVisible();
    await expect(page.getByText('$720.00', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Last adjusted by accountant@local.test.'),
    ).toBeVisible();
    const evidencePromise = page.waitForEvent('download');
    await page
      .getByRole('link', {
        name: 'accountant-review-evidence.pdf',
        exact: true,
      })
      .click();
    const evidence = await evidencePromise;
    expect(evidence.suggestedFilename()).toBe('accountant-review-evidence.pdf');
    expect(
      (await readFile(await evidence.path(), 'utf8')).startsWith('%PDF-'),
    ).toBe(true);
    await page.goto(`${base}/transactions`);
    await page
      .getByLabel('Search transactions')
      .fill('Accountant review policy');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const recordRow = page
      .getByRole('row')
      .filter({ hasText: 'Accountant review policy' });
    const review = recordRow.locator('.review-panel');
    await review
      .getByRole('button', { name: 'Review and comments', exact: true })
      .click();
    await review
      .getByLabel('Add comment')
      .fill('Accountant evidence review complete.');
    await review
      .getByRole('button', { name: 'Add comment', exact: true })
      .click();
    await expect(
      review.getByText('Accountant evidence review complete.'),
    ).toBeVisible();
    await review.getByLabel('Status').selectOption('REVIEWED');
    await review.getByRole('button', { name: 'Update status' }).click();
    await expect(recordRow.locator('.status-badge')).toHaveText('reviewed');
    await review.getByLabel('Status').selectOption('PROCESSED');
    await review.getByRole('button', { name: 'Update status' }).click();
    await expect(recordRow.locator('.status-badge')).toHaveText('processed');
    await page.goto(`${base}/income/${income.id}`);
    await page.getByRole('button', { name: 'Reconcile', exact: true }).click();
    await page.getByLabel('Actual', { exact: true }).fill('120.00');
    await page
      .getByLabel('Notes', { exact: true })
      .fill('Bank fee difference verified.');
    await page.getByRole('button', { name: 'Save reconciliation' }).click();
    await expect(page.getByText(/Difference:/)).toContainText(
      'accountant@local.test',
    );
    const archiveMetadata = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/exports/status',
    );
    await page.goto(`${base}/reports`);
    expect((await archiveMetadata).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Owner archive history' }),
    ).toBeVisible();
    await page.getByLabel('Export scope').selectOption('FULL');
    await expect(
      page.getByRole('link', { name: 'Download portable ZIP' }),
    ).toHaveCount(0);
    const csvPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download summary CSV' }).click();
    const csv = await csvPromise;
    expect(csv.suggestedFilename()).toBe('business-records-summary.csv');
    const report = await readFile(await csv.path(), 'utf8');
    expect(report).toContain('INSURANCE');
    expect(report).toContain('120000');
    expect(
      (await context.request.get('/api/exports/archive?scope=FULL')).status(),
    ).toBe(403);
    expect(
      (
        await context.request.patch(
          `/api/businesses/${business}/expenses/${policy.id}`,
          { data: { totalAmount: '1.00' } },
        )
      ).status(),
    ).toBe(403);
  } finally {
    await context.close().catch(() => undefined);
  }

  const invitationResponse = await request.post('/api/auditor-invitations', {
    data: {
      email: 'accountant-comparison-auditor@local.test',
      accessExpiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [{ scopeType: 'BUSINESS', businessId: business }],
    },
  });
  expect(invitationResponse.status()).toBe(201);
  const invitation = (await invitationResponse.json()).invitation;
  const auditor = await browser.newContext({ baseURL });
  auditor.setDefaultTimeout(15_000);
  try {
    expect(
      (
        await auditor.request.post('/api/invitations/accept', {
          data: {
            email: invitation.email,
            token: new URL(invitation.invitationUrl).searchParams.get('token'),
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await auditor.request.post('/api/dev/auth/login', {
          data: { email: invitation.email },
        })
      ).status(),
    ).toBe(200);
    const page = await auditor.newPage();
    await page.goto(`${base}/expenses/${policy.id}`);
    await expect(page.getByLabel('Auditor access')).toContainText('Read-only');
    await expect(page.getByText('$720.00', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Last adjusted by accountant@local.test.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Adjust allocation' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', {
        name: 'accountant-review-evidence.pdf',
        exact: true,
      }),
    ).toHaveCount(0);
    await page.goto(`${base}/income/${income.id}`);
    await expect(page.getByText(/Difference:/)).toContainText(
      'accountant@local.test',
    );
    await expect(
      page.getByRole('button', { name: 'Reconcile', exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await auditor.request.patch('/api/insurance-allocations', {
          data: {
            expenseId: policy.id,
            allocatedAmount: '1.00',
            allocationNotes: 'Denied',
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await auditor.request.post('/api/income-reconciliations', {
          data: {
            incomeId: income.id,
            expectedAmount: '125.00',
            actualAmount: '1.00',
          },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await auditor.close().catch(() => undefined);
  }
});
