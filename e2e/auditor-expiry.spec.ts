import { expect, test } from '@playwright/test';

test('an open auditor workspace expires without user navigation or focus', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(45000);
  const owner = await browser.newContext({ baseURL });
  const auditor = await browser.newContext({ baseURL });
  const email = 'expiry-browser-auditor@local.test';
  try {
    expect(
      (
        await owner.request.post('/api/dev/auth/login', {
          data: { email: 'owner@local.test' },
        })
      ).status(),
    ).toBe(200);
    const expiry = new Date(Date.now() + 12000).toISOString();
    const invited = await owner.request.post('/api/auditor-invitations', {
      data: {
        email,
        accessExpiresAt: expiry,
        scopes: [
          {
            scopeType: 'BUSINESS',
            businessId: 'business-activity-contracting',
          },
        ],
      },
    });
    expect(invited.status(), await invited.text()).toBe(201);
    const { invitation } = (await invited.json()) as {
      invitation: { invitationUrl: string };
    };
    const token = new URL(invitation.invitationUrl).searchParams.get('token');
    expect(
      (
        await auditor.request.post('/api/invitations/accept', {
          data: { email, token },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await auditor.request.post('/api/dev/auth/login', { data: { email } })
      ).status(),
    ).toBe(200);
    const page = await auditor.newPage();
    await page.goto('/app/businesses');
    const notice = page.getByLabel('Auditor access', { exact: true });
    await expect(notice).toContainText('IT Contracting');
    await expect(notice.locator('time')).toHaveAttribute('datetime', expiry);
    await expect(
      page.getByRole('link', { name: 'Open IT Contracting' }),
    ).toBeVisible();
    // Leave the workspace untouched. Its expiry timer, rather than a focus,
    // navigation or refresh action, must close it.
    await expect(
      page.getByRole('heading', { name: 'Sign in', exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('status')).toContainText(
      'Your session or access is unavailable',
    );
    await expect(notice).toHaveCount(0);
    const expired = await auditor.request.get('/api/businesses');
    expect(expired.status()).toBe(403);
    expect((await owner.request.get('/api/businesses')).status()).toBe(200);
  } finally {
    await auditor.close();
    await owner.close();
  }
});
