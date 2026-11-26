import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { IncomeDetailPage } from './IncomeDetailPage';
import { ExportsPage } from './ExportsPage';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { AccountantAccessNotice } from '../features/auth/AccountantAccessNotice';

vi.mock('../features/auth/AuthContext', () => ({
  apiRequest: vi.fn(),
  useApiRequest: () => apiRequest,
  useAuth: vi.fn(),
}));

function role(value: string) {
  vi.mocked(useAuth).mockReturnValue({
    user: { role: value },
    configuration: { environment: 'local' },
  } as ReturnType<typeof useAuth>);
}

function open(element: React.ReactElement, path: string) {
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/businesses/:businessId/income/:incomeId', element },
          { path: '/businesses/:businessId/reports', element },
        ],
        { initialEntries: [path] },
      )}
    />,
  );
}

describe('accountant access distinction', () => {
  it('explains the public demo download restriction without labelling review access read-only', () => {
    render(<AccountantAccessNotice demo />);
    expect(screen.getByLabelText('Accountant access')).toHaveTextContent(
      'Server downloads and exports are disabled.',
    );
    expect(screen.getByLabelText('Accountant access')).not.toHaveTextContent(
      'CSV reports are available',
    );
    expect(screen.getByLabelText('Accountant access')).toHaveTextContent(
      'Review access',
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('describes the professional review role without labelling it read-only', () => {
    render(<AccountantAccessNotice />);
    expect(screen.getByLabelText('Accountant access')).toHaveTextContent(
      'Accountant · Review access',
    );
    expect(screen.getByLabelText('Accountant access')).not.toHaveTextContent(
      /read.only/i,
    );
    expect(screen.getByLabelText('Accountant access')).toHaveTextContent(
      'reconcile income',
    );
  });

  it.each(['OWNER', 'ACCOUNTANT', 'AUDITOR'])(
    'keeps reconciliation history visible and gates its editor for %s',
    async (value) => {
      role(value);
      vi.mocked(apiRequest).mockImplementation((path) =>
        Promise.resolve(
          path.startsWith('/api/attachments')
            ? { attachments: [] }
            : {
                incomeRecord: {
                  id: 'income',
                  businessId: 'business',
                  incomeType: 'GENERAL',
                  transactionDate: '2026-09-01',
                  totalAmountMinor: 12500,
                  currency: 'NZD',
                  status: 'NEW',
                  receivedFrom: 'Synthetic client',
                  notes: null,
                  details: {},
                  reconciliation: {
                    matched: false,
                    differenceAmountMinor: -500,
                    reconcilerEmail: 'accountant@example.invalid',
                  },
                },
              },
        ),
      );
      open(<IncomeDetailPage />, '/businesses/business/income/income');
      expect(
        await screen.findByRole('heading', { name: 'Synthetic client' }),
      ).toBeVisible();
      expect(screen.getByText(/accountant@example.invalid/)).toBeVisible();
      if (value === 'AUDITOR') {
        expect(
          screen.queryByRole('button', { name: 'Reconcile' }),
        ).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole('button', { name: 'Reconcile' })).toBeVisible();
      }
    },
  );

  it('offers CSV reports and permitted owner archive metadata without a full-archive download action', () => {
    role('ACCOUNTANT');
    vi.mocked(apiRequest).mockResolvedValue({ exports: [] });
    open(<ExportsPage />, '/businesses/business/reports');
    expect(
      screen.getByRole('link', { name: 'Download summary CSV' }),
    ).toHaveAttribute('href', expect.stringContaining('/api/reports/export?'));
    expect(screen.queryByRole('link', { name: /ZIP/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Successful exports')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Owner archive history' }),
    ).toBeVisible();
    expect(apiRequest).toHaveBeenCalledWith('/api/exports/status');
  });
});
