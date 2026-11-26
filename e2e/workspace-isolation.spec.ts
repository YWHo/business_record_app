import { expect, test } from '@playwright/test';

for (const environment of ['production', 'staging'] as const) {
  test(`${environment} private sessions survive demo navigation and demo edits stay separate from private records`, async ({
    page,
    context,
  }) => {
    const privateRequests: string[] = [];
    const unexpected: string[] = [];
    let logoutCount = 0;
    await context.addCookies([
      {
        name: 'br_session',
        value: 'opaque-private-test-session',
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      privateRequests.push(`${request.method()} ${path}`);
      const authenticated = (await request.allHeaders()).cookie?.includes(
        'br_session=opaque-private-test-session',
      );
      if (path === '/api/auth/config') {
        await route.fulfill({
          json: {
            environment,
            demoHelper: false,
            localHelper: false,
            turnstileRequired: false,
            turnstileSiteKey: null,
          },
        });
      } else if (path === '/api/auth/me') {
        await route.fulfill({
          status: authenticated ? 200 : 401,
          json: authenticated
            ? {
                user: {
                  id: 'private-owner',
                  role: 'OWNER',
                  email: 'private-owner@example.invalid',
                  status: 'ACTIVE',
                },
              }
            : { error: 'Authentication required.' },
        });
      } else if (path === '/api/businesses' && authenticated) {
        await route.fulfill({
          json: {
            businesses: [
              {
                id: 'private-only-business',
                name: 'Private example business',
                description: 'Server-owned test fixture',
                businessType: 'OTHER',
                defaultCurrency: 'NZD',
                status: 'ACTIVE',
                legacyBusinessActivityId: null,
                currentLegalEntity: null,
                recordCount: 0,
                awaitingReviewCount: 0,
                missingReceiptCount: 0,
                lastRecordUpdatedAt: null,
              },
            ],
          },
        });
      } else if (path === '/api/auth/logout') {
        logoutCount += 1;
        await route.fulfill({
          headers: {
            'set-cookie':
              'br_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
          },
          json: { success: true },
        });
      } else {
        unexpected.push(`${request.method()} ${path}`);
        await route.abort();
      }
    });

    await page.goto('/app/businesses');
    await expect(
      page.getByRole('link', { name: 'Open Private example business' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Explore the public demo' }).click();
    await expect(page).toHaveURL(/\/demo$/);
    const requestsBeforeDemo = privateRequests.length;
    await page.getByRole('button', { name: 'Continue as Demo Owner' }).click();
    await expect(
      page.getByRole('link', { name: 'Open Private example business' }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Open DoorDash' }).click();
    await page.getByRole('link', { name: 'Business settings' }).click();
    await page.getByRole('link', { name: 'Clients', exact: true }).click();
    const clients = page.getByRole('region', { name: 'Clients', exact: true });
    await clients.getByLabel('Name').fill('Demo browser client');
    await clients.getByRole('button', { name: 'Add client' }).click();
    await expect(
      clients.getByRole('heading', { name: 'Demo browser client' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      clients.getByRole('heading', { name: 'Demo browser client' }),
    ).toBeVisible();
    expect(privateRequests).toHaveLength(requestsBeforeDemo);
    expect(
      (await context.cookies()).find((cookie) => cookie.name === 'br_session')
        ?.value,
    ).toBe('opaque-private-test-session');

    await page.getByRole('link', { name: 'Leave demo' }).click();
    await expect(page).toHaveURL(/\/app\/businesses$/);
    await expect(
      page.getByRole('link', { name: 'Open Private example business' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open DoorDash' })).toHaveCount(
      0,
    );
    expect(logoutCount).toBe(0);
    await page.getByRole('link', { name: 'Explore the public demo' }).click();
    await expect(page).toHaveURL(/\/demo\/businesses$/);
    await page.locator('summary[aria-label="Open account menu"]').click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/demo$/);
    expect(logoutCount).toBe(0);
    expect(
      (await context.cookies()).find((cookie) => cookie.name === 'br_session')
        ?.value,
    ).toBe('opaque-private-test-session');
    await page.getByRole('link', { name: 'Sign in to your workspace' }).click();
    await expect(
      page.getByRole('link', { name: 'Open Private example business' }),
    ).toBeVisible();
    await page.locator('summary[aria-label="Open account menu"]').click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Email sign-in link' }),
    ).toBeVisible();
    expect(logoutCount).toBe(1);
    expect(
      (await context.cookies()).find((cookie) => cookie.name === 'br_session'),
    ).toBeUndefined();
    await page.getByRole('link', { name: 'Explore the public demo' }).click();
    await page.getByRole('button', { name: 'Continue as Demo Owner' }).click();
    await page.goto(
      '/demo/businesses/business-demo-activity-delivery/settings/clients',
    );
    await expect(
      clients.getByRole('heading', { name: 'Demo browser client' }),
    ).toBeVisible();
    expect(unexpected).toEqual([]);
  });
}
