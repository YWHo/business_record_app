import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { IncomeReconciliationForm } from './IncomeReconciliationForm';

function open(onSubmit = vi.fn(() => Promise.resolve())) {
  render(
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '*',
          element: (
            <IncomeReconciliationForm
              totalAmountMinor={12500}
              onSubmit={onSubmit}
            />
          ),
        },
      ])}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reconcile' }));
  return onSubmit;
}

describe('income reconciliation editor', () => {
  it('submits expected and actual decimal strings without changing the source amount', async () => {
    const submit = open();
    fireEvent.change(screen.getByLabelText('Actual'), {
      target: { value: '120.00' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Bank fee difference.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reconciliation' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Reconcile' }),
    ).toBeVisible();
    expect(submit).toHaveBeenCalledWith({
      expectedAmount: '125.00',
      actualAmount: '120.00',
      notes: 'Bank fee difference.',
    });
  });

  it('keeps the draft on a failed save', async () => {
    open(vi.fn(() => Promise.reject(new Error('Reconciliation unavailable.'))));
    fireEvent.change(screen.getByLabelText('Actual'), {
      target: { value: '120.00' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reconciliation' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reconciliation unavailable.',
    );
    expect(screen.getByLabelText('Actual')).toHaveValue(120);
  });
});
