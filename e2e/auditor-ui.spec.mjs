/* global document, window */
import { expect, test } from '@playwright/test';

test('auditor inspects scoped records, previews, reports and history across screen sizes', async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const business = 'business-activity-contracting';
  const base = `/app/businesses/${business}`;
  const email = 'ui-auditor@local.test';
  expect(
    (
      await request.post('/api/dev/auth/login', {
        data: { email: 'owner@local.test' },
      })
    ).status(),
  ).toBe(200);
  const created = await request.post(`/api/businesses/${business}/expenses`, {
    data: {
      businessId: business,
      businessActivityId: 'activity-contracting',
      expenseCategoryId: 'category-general',
      merchantName: 'Auditor UI permitted receipt',
      purchaseDatetime: '2026-09-15T00:00:00.000Z',
      totalAmount: '45.00',
      currency: 'NZD',
      gstStatus: 'NO_GST',
      recurrenceType: 'ONE_OFF',
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const expense = (await created.json()).generalExpense.id;
  const upload = await request.post('/api/attachments', {
    multipart: {
      recordType: 'EXPENSE',
      recordId: expense,
      file: {
        name: 'auditor-ui-receipt.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          'base64',
        ),
      },
    },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  expect(
    (
      await request.post('/api/comments', {
        data: {
          recordType: 'EXPENSE',
          recordId: expense,
          businessId: business,
          message: 'Existing owner evidence note.',
        },
      })
    ).status(),
  ).toBe(201);
  const invitationResponse = await request.post('/api/auditor-invitations', {
    data: {
      email,
      accessExpiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [
        {
          scopeType: 'BUSINESS',
          businessId: business,
          dateFrom: '2026-04-01',
          dateTo: '2027-03-31',
        },
      ],
    },
  });
  expect(invitationResponse.status(), await invitationResponse.text()).toBe(
    201,
  );
  const invitation = (await invitationResponse.json()).invitation;
  const context = await browser.newContext({ baseURL });
  context.setDefaultTimeout(15_000);
  try {
    expect(
      (
        await context.request.post('/api/invitations/accept', {
          data: {
            email,
            token: new URL(invitation.invitationUrl).searchParams.get('token'),
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await context.request.post('/api/auth/login', { data: { email } })
      ).status(),
    ).toBe(200);
    const outbox = await (await request.get('/api/dev/auth/outbox')).json();
    const loginToken = new URL(
      outbox.messages.find((message) => message.recipient_email === email)
        .action_url,
    ).searchParams.get('token');
    expect(
      (
        await context.request.post('/api/auth/verify', {
          data: { token: loginToken },
        })
      ).status(),
    ).toBe(200);
    const page = await context.newPage();
    const rejected = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400)
        rejected.push(`${response.status()} ${response.url()}`);
    });
    await page.goto('/app/businesses');
    const notice = page.getByLabel('Auditor access', { exact: true });
    await expect(notice).toContainText('Read-only');
    await expect(notice).toContainText('IT Contracting');
    await expect(notice).toContainText('Access expires');
    await expect(
      page.getByRole('link', { name: 'Accountant view', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Open IT Contracting' }).click();
    await expect(
      page.getByRole('heading', { name: 'IT Contracting', exact: true }),
    ).toBeVisible();
    for (const size of [
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(size);
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('31 Mar 2027');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
    }
    await expect(
      page.getByRole('link', { name: 'Business settings', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Governance', exact: true }),
    ).toHaveCount(0);
    await page.goto(`${base}/expenses`);
    await expect(
      page.getByRole('link', { name: 'Add expense', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('link', { name: 'Auditor UI permitted receipt', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Auditor UI permitted receipt' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit expense' })).toHaveCount(
      0,
    );
    await expect(page.getByLabel('Take a photo')).toHaveCount(0);
    await expect(page.locator('a[href*="/api/attachments/file"]')).toHaveCount(
      0,
    );
    await page
      .getByRole('button', { name: 'Preview auditor-ui-receipt.png' })
      .click();
    const image = page.getByAltText('Preview of auditor-ui-receipt.png');
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate(
          (element) => element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await page.goto(`${base}/documents`);
    await expect(
      page.getByRole('button', { name: 'Preview auditor-ui-receipt.png' }),
    ).toBeVisible();
    await expect(page.locator('a[href*="/api/attachments/file"]')).toHaveCount(
      0,
    );
    await page.goto('/app/transactions');
    await expect(
      page.getByRole('heading', { name: 'Transactions and receipts' }),
    ).toBeVisible();
    await page
      .getByLabel('Search merchant, client, or type')
      .fill('Auditor UI permitted receipt');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Save filter', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'View comments', exact: true })
      .click();
    await expect(page.getByText('Existing owner evidence note.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add comment', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Update status', exact: true }),
    ).toHaveCount(0);
    await page.goto(`${base}/reports`);
    await expect(
      page.getByRole('cell', { name: '$45.00', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Download/ })).toHaveCount(0);
    await expect(page.getByText('Successful exports')).toHaveCount(0);
    await page.goto(`${base}/audit-trail`);
    await expect(
      page.getByRole('heading', { name: 'Audit events', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Retention settings', { exact: true }),
    ).toHaveCount(0);
    await page.goto(`${base}/more`);
    await expect(
      page.getByRole('link', { name: /Business settings|Governance|Members/ }),
    ).toHaveCount(0);
    for (const [path, destination] of [
      [`${base}/expenses/new`, `${base}/expenses`],
      [`${base}/expenses/${expense}/edit`, `${base}/expenses`],
      [`${base}/settings`, `${base}/audit-trail`],
      ['/app/accountant', '/app/transactions'],
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(destination + '$'));
    }
    expect(rejected).toEqual([]);
    const directory = await (await request.get('/api/auditor-access')).json();
    const member = directory.members.find((member) => member.email === email);
    expect(
      (
        await request.post(`/api/auditor-access/${member.id}/revoke`, {
          data: { revision: member.revision },
        })
      ).status(),
    ).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByRole('heading', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      'Your session or access is unavailable',
    );
  } finally {
    await context.close().catch(() => undefined);
  }
});
