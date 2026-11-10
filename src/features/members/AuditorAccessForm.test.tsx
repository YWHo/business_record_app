import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';
import { AuditorAccessForm } from './AuditorAccessForm';
import type { AuditorMember } from '../../lib/auditorAccess';
const options = {
  businesses: [{ id: 'one', name: 'First business' }],
  entities: [{ id: 'entity', name: 'Example Limited' }],
};
const member: AuditorMember = {
  id: 'auditor',
  email: 'reviewer@example.invalid',
  status: 'DISABLED',
  accessState: 'DISABLED',
  userStatus: 'ACTIVE',
  revision: 1,
  accessStartsAt: null,
  accessExpiresAt: '2099-01-01T00:00:00.000Z',
  note: null,
  scopes: [
    {
      scopeType: 'BUSINESS',
      businessId: 'one',
      legalEntityId: null,
      dateFrom: null,
      dateTo: null,
    },
  ],
};
describe('AuditorAccessForm', () => {
  it('defaults to a narrow scope and submits normalized dates with multiple grants', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);

    render(<AuditorAccessForm {...options} onSubmit={submit} />);
    expect(screen.getByLabelText('Scope type 1')).toHaveValue('BUSINESS');
    fireEvent.change(screen.getByLabelText('Auditor email'), {
      target: { value: member.email },
    });
    fireEvent.change(screen.getByLabelText('Business 1'), {
      target: { value: 'one' },
    });
    fireEvent.change(screen.getByLabelText('Access expires (local time)'), {
      target: { value: '2099-01-01T12:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add scope' }));
    fireEvent.change(screen.getByLabelText('Scope type 2'), {
      target: { value: 'LEGAL_ENTITY' },
    });
    fireEvent.change(screen.getByLabelText('Legal entity 2'), {
      target: { value: 'entity' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Send auditor invitation' }),
    );
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toMatchObject({
      email: member.email,
      accessStartsAt: null,
      accessExpiresAt: new Date('2099-01-01T12:00').toISOString(),
      restoreAccess: false,
      scopes: [
        { businessId: 'one', legalEntityId: null },
        { businessId: null, legalEntityId: 'entity' },
      ],
    });
  });
  it('requires explicit restoration and preserves a revoked status on ordinary edits', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);

    render(
      <AuditorAccessForm {...options} member={member} onSubmit={submit} />,
    );
    expect(screen.getByLabelText('Auditor email')).toHaveAttribute('readonly');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save auditor access' }),
    );
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ restoreAccess: false }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save auditor access' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save auditor access' }),
    );
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ restoreAccess: true }),
    );
  });
  it('rejects an inverted access window before calling the API', async () => {
    const submit = vi.fn();
    render(
      <AuditorAccessForm {...options} member={member} onSubmit={submit} />,
    );
    fireEvent.change(
      screen.getByLabelText('Access starts (local time, optional)'),
      { target: { value: '2099-02-01T12:00' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save auditor access' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a future expiry',
    );
    expect(submit).not.toHaveBeenCalled();
  });
  it('keeps the draft and focuses an actionable server conflict', async () => {
    render(
      <AuditorAccessForm
        {...options}
        member={member}
        onSubmit={() =>
          Promise.reject(new Error('Reload before trying again.'))
        }
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save auditor access' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reload before trying again.',
    );
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(screen.getByLabelText('Auditor email')).toHaveValue(member.email);
  });
  it('does not offer to restore a disabled global identity', () => {
    render(
      <AuditorAccessForm
        {...options}
        member={{ ...member, userStatus: 'DISABLED' }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
