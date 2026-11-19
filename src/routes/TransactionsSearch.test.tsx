import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { TransactionsPage } from './TransactionsPage';
import { apiRequest } from '../features/auth/AuthContext';

vi.mock('../features/auth/AuthContext', () => ({
  apiRequest: vi.fn(),
  useAuth: () => ({
    user: { role: 'ACCOUNTANT' },
    configuration: { environment: 'local' },
  }),
}));

vi.mock('../features/business/BusinessDirectoryContext', () => ({
  useBusinessDirectory: () => ({ businesses: [] }),
}));

function result(id: string, counterparty: string) {
  return {
    transactions: [
      {
        id,
        businessId: 'business',
        legalEntityId: 'entity',
        recordType: 'EXPENSE',
        subtype: 'GENERAL',
        transactionDate: '2026-09-01',
        counterparty,
        totalAmountMinor: 12500,
        currency: 'NZD',
        status: 'READY_FOR_REVIEW',
        attachmentCount: 0,
        reviewerEmail: null,
      },
    ],
    summary: { resultCount: 1, missingAttachmentCount: 0, unreviewedCount: 1 },
    page: { number: 1, size: 50, hasNext: false },
  };
}

it('keeps the latest review search when an older response arrives afterwards', async () => {
  let finishInitial!: (value: ReturnType<typeof result>) => void;
  const initial = new Promise<ReturnType<typeof result>>((resolve) => {
    finishInitial = resolve;
  });

  vi.mocked(apiRequest).mockImplementation((path) =>
    path.startsWith('/api/expense-categories')
      ? Promise.resolve({ categories: [] })
      : path.includes('q=latest')
        ? Promise.resolve(result('new', 'Latest review result'))
        : initial,
  );

  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: '/businesses/:businessId/transactions',
            element: <TransactionsPage />,
          },
        ],
        { initialEntries: ['/businesses/business/transactions'] },
      )}
    />,
  );

  fireEvent.change(screen.getByLabelText('Search transactions'), {
    target: { value: 'latest' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('Latest review result')).toBeVisible();
  await act(async () => {
    finishInitial(result('old', 'Obsolete review result'));
    await initial;
  });
  expect(screen.queryByText('Obsolete review result')).not.toBeInTheDocument();
  expect(screen.getByText('Latest review result')).toBeVisible();
});
