import { expect, test } from '@playwright/test';

for (const role of ['OWNER', 'ACCOUNTANT', 'AUDITOR'] as const) {
  test(`staging ${role} signs in through a challenged password form`, async ({
    page,
    context,
  }) => {
    let signedIn = false;
    let attempts = 0;
    const unexpected: string[] = [];
    const submitted: Record<string, unknown>[] = [];
    // Only the external challenge is substituted. The real application form,
    // request client, session refresh, routing and role presentation run here.
    await page.addInitScript(() => {
      let sequence = 0;
      const runtime = globalThis as unknown as {
        turnstile: {
          render: (
            target: string,
            options: { callback: (token: string) => void },
          ) => string;
          remove: () => void;
        };
      };
      runtime.turnstile = {
        render: (_target, options) => {
          const token = `browser-test-challenge-${++sequence}`;
          queueMicrotask(() => options.callback(token));
          return token;
        },
        remove: () => {},
      };
    });
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/auth/config') {
        await route.fulfill({
          json: {
            environment: 'staging',
            demoHelper: false,
            localHelper: false,
            turnstileRequired: true,
            turnstileSiteKey: 'fictional-browser-test-site-key',
          },
        });
      } else if (path === '/api/auth/me') {
        await route.fulfill({
          status: signedIn ? 200 : 401,
          json: signedIn
            ? {
                user: {
                  id: `staging-${role.toLowerCase()}`,
                  email: `${role.toLowerCase()}@example.invalid`,
                  role,
                  status: 'ACTIVE',
                  ...(role === 'AUDITOR'
                    ? {
                        access: {
                          accessStartsAt: null,
                          accessExpiresAt: '2099-01-01T00:00:00.000Z',
                          scopes: [
                            {
                              scopeType: 'BUSINESS',
                              label: 'Staging example',
                              dateFrom: null,
                              dateTo: null,
                            },
                          ],
                        },
                      }
                    : {}),
                },
              }
            : { error: 'Authentication required.' },
        });
      } else if (
        path === '/api/auth/staging-login' &&
        request.method() === 'POST'
      ) {
        submitted.push(request.postDataJSON() as Record<string, unknown>);
        attempts += 1;
        if (role === 'OWNER' && attempts === 1) {
          await route.fulfill({
            status: 401,
            json: { error: 'Unable to sign in with those details.' },
          });
        } else {
          signedIn = true;
          await route.fulfill({
            headers: {
              'set-cookie':
                'br_session=opaque-browser-test-session; Path=/; HttpOnly; SameSite=Strict',
            },
            json: { success: true },
          });
        }
      } else if (path === '/api/businesses' && signedIn) {
        await route.fulfill({
          json: {
            businesses: [
              {
                id: 'staging-example',
                name: 'Staging example',
                description: 'Disposable browser fixture',
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
      } else {
        unexpected.push(`${request.method()} ${path}`);
        await route.abort();
      }
    });
    await page.goto('/login');
    await expect(
      page.getByRole('button', { name: 'Sign in to staging' }),
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Email sign-in link' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Continue as local/ }),
    ).toHaveCount(0);
    await page
      .getByLabel('Email address')
      .fill(`${role.toLowerCase()}@example.invalid`);
    await page
      .getByLabel('Password', { exact: true })
      .fill('fictional-test-password-2026');
    await page.getByRole('button', { name: 'Sign in to staging' }).click();
    if (role === 'OWNER') {
      await expect(page.getByRole('alert')).toHaveText(
        'Unable to sign in with those details.',
      );
      await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
        '',
      );
      await expect(
        page.getByRole('button', { name: 'Sign in to staging' }),
      ).toBeEnabled();
      await page
        .getByLabel('Password', { exact: true })
        .fill('fictional-test-password-2026');
      await page.getByRole('button', { name: 'Sign in to staging' }).click();
      expect(submitted[1].turnstileToken).not.toBe(submitted[0].turnstileToken);
    }
    await expect(page).toHaveURL(/\/app\/businesses$/);
    await expect(
      page.getByRole('link', { name: 'Open Staging example' }),
    ).toBeVisible();
    for (const payload of submitted) {
      expect(payload).toEqual({
        email: `${role.toLowerCase()}@example.invalid`,
        password: 'fictional-test-password-2026',
        turnstileToken: expect.stringMatching(/^browser-test-challenge-/),
      });
    }
    expect(
      (await context.cookies()).find((cookie) => cookie.name === 'br_session')
        ?.httpOnly,
    ).toBe(true);
    if (role === 'AUDITOR') {
      await expect(
        page.getByLabel('Auditor access', { exact: true }),
      ).toContainText('Staging example');
      await expect(
        page.getByRole('link', { name: 'Add business' }),
      ).toHaveCount(0);
    }
    expect(unexpected).toEqual([]);
  });
}
