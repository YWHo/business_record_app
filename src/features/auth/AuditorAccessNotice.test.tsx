import { render, screen } from '@testing-library/react';
import { AuditorAccessNotice } from './AuditorAccessNotice';
describe('AuditorAccessNotice', () => {
  it('shows each additive scope, record period and an explicit NZ expiry without editing controls', () => {
    render(
      <AuditorAccessNotice
        access={{
          accessStartsAt: null,
          accessExpiresAt: '2028-06-30T11:59:00.000Z',
          scopes: [
            {
              scopeType: 'BUSINESS',
              label: 'IT Contracting',
              dateFrom: '2027-04-01',
              dateTo: '2028-03-31',
            },
            {
              scopeType: 'LEGAL_ENTITY',
              label: 'Example Limited',
              dateFrom: null,
              dateTo: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByLabelText('Auditor access')).toHaveTextContent(
      'Read-only',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('IT Contracting')).toBeVisible();
    expect(screen.getByText(/New Zealand time/)).toBeVisible();
    expect(document.querySelector('time')).toHaveAttribute(
      'datetime',
      '2028-06-30T11:59:00.000Z',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('does not imply account-wide access when scope details are missing', () => {
    render(<AuditorAccessNotice />);
    expect(screen.getByText(/Scope details are unavailable/)).toBeVisible();
    expect(screen.queryByText('Whole account')).not.toBeInTheDocument();
  });
});
