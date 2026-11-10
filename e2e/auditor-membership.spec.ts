import { expect, test } from '@playwright/test';
interface InvitationOutbox {
  messages: { recipient_email: string; invitation_url: string }[];
}
interface LoginOutbox {
  messages: { recipient_email: string; action_url: string }[];
}

test('owner manages scoped auditor invitations and ends accepted access', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const email = 'membership-auditor@local.test';
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as local owner' }).click();
  await page.goto('/app/settings/account');
  await page
    .getByRole('link', { name: 'Invite an auditor', exact: true })
    .click();
  await page.getByLabel('Auditor email').fill(email);
  await page
    .getByLabel('Business 1', { exact: true })
    .selectOption({ label: 'IT Contracting' });
  await page.getByLabel('Access expires (local time)').fill('2099-01-01T12:00');
  await page.getByLabel('Record dates from 1 (optional)').fill('2026-04-01');
  await page.getByLabel('Record dates to 1 (optional)').fill('2027-03-31');
  await page
    .getByLabel('Reason or note (optional)')
    .fill('Synthetic independent review');
  await page
    .getByRole('link', { name: 'Back to users and invitations' })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Discard unsaved changes?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Stay on page' }).click();
  await expect(page.getByLabel('Auditor email')).toHaveValue(email);
  await page.getByRole('button', { name: 'Send auditor invitation' }).click();
  await expect(
    page.getByRole('heading', { name: 'Users and invitations' }),
  ).toBeVisible();
  const invitationCard = page.getByRole('article', {
    name: `Invitation ${email}`,
    exact: true,
  });
  await expect(invitationCard).toContainText('PENDING');
  await expect(invitationCard).toContainText('IT Contracting');
  const outbox = (await (
    await page.request.get('/api/dev/invitations/outbox')
  ).json()) as InvitationOutbox;
  const invitation = new URL(
    outbox.messages.find(
      (row: { recipient_email: string }) => row.recipient_email === email,
    )!.invitation_url,
  );
  const recipient = await browser.newContext();
  try {
    const auditor = await recipient.newPage();
    await auditor.goto(invitation.pathname + invitation.search);
    await auditor.getByLabel('Email address').fill(email);
    await auditor.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(auditor.getByRole('status')).toContainText(
      'Invitation accepted',
    );
    expect((await auditor.request.get('/api/auth/me')).status()).toBe(401);
    await auditor.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(
      auditor.getByRole('heading', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await auditor.getByLabel('Email address').fill(email);
    await auditor.getByRole('button', { name: 'Email sign-in link' }).click();
    await expect(auditor.getByRole('status')).toBeVisible();
    const authOutbox = (await (
      await page.request.get('/api/dev/auth/outbox')
    ).json()) as LoginOutbox;
    const login = new URL(
      authOutbox.messages.find(
        (row: { recipient_email: string }) => row.recipient_email === email,
      )!.action_url,
    );
    await auditor.goto(login.pathname + login.search);
    await expect(auditor.getByRole('status')).toContainText('Signed in.');
    await auditor.getByRole('link', { name: 'Continue', exact: true }).click();
    await expect(
      auditor.getByRole('link', { name: 'Open IT Contracting' }),
    ).toBeVisible();
    await expect(auditor.getByRole('link', { name: /^Open / })).toHaveCount(1);
    await expect(
      auditor.getByRole('link', { name: 'Open Delivery Services' }),
    ).toHaveCount(0);
    expect((await auditor.request.get('/api/auditor-access')).status()).toBe(
      403,
    );
    await auditor.goto('/app/settings/account/auditors/new');
    await expect(
      auditor.getByRole('heading', { name: 'My businesses' }),
    ).toBeVisible();
    await expect(auditor.getByLabel('Auditor email')).toHaveCount(0);

    await page.reload();
    const memberCard = page.getByRole('article', {
      name: `Auditor ${email}`,
      exact: true,
    });
    await memberCard.getByRole('link', { name: 'Manage access' }).click();
    await page
      .getByLabel('Business 1', { exact: true })
      .selectOption('business-activity-delivery');
    await page.getByRole('button', { name: 'Save auditor access' }).click();
    await expect(
      page.getByRole('heading', { name: 'Users and invitations' }),
    ).toBeVisible();
    expect((await auditor.request.get('/api/auth/me')).status()).toBe(401);
    await expect(memberCard).toContainText('Delivery');
    await memberCard.getByRole('button', { name: 'Expire access now' }).click();
    await expect(memberCard).toContainText('EXPIRED');
    await memberCard
      .getByRole('button', { name: 'Revoke access', exact: true })
      .click();
    await expect(memberCard).toContainText('DISABLED');
    await memberCard.getByRole('link', { name: 'Manage access' }).click();
    await expect(
      page.getByRole('checkbox', {
        name: 'Restore auditor access with this grant',
      }),
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'Save auditor access' }).click();
    await expect(memberCard).toContainText('DISABLED');

    await page
      .getByRole('link', { name: 'Invite an auditor', exact: true })
      .click();
    await page.getByLabel('Auditor email').fill('cancelled-auditor@local.test');
    await page
      .getByLabel('Business 1', { exact: true })
      .selectOption('business-activity-contracting');
    await page.getByRole('button', { name: 'Send auditor invitation' }).click();
    const pending = page.getByRole('article', {
      name: 'Invitation cancelled-auditor@local.test',
      exact: true,
    });
    await pending.getByRole('button', { name: 'Revoke invitation' }).click();
    await expect(pending).toContainText('REVOKED');
    const cancelledOutbox = (await (
      await page.request.get('/api/dev/invitations/outbox')
    ).json()) as InvitationOutbox;
    const cancelled = new URL(
      cancelledOutbox.messages.find(
        (row: { recipient_email: string }) =>
          row.recipient_email === 'cancelled-auditor@local.test',
      )!.invitation_url,
    );
    expect(
      (
        await auditor.request.post('/api/invitations/accept', {
          data: {
            email: 'cancelled-auditor@local.test',
            token: cancelled.searchParams.get('token'),
          },
        })
      ).status(),
    ).toBe(400);
  } finally {
    await recipient.close();
  }
});
