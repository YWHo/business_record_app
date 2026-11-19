import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { InsuranceAllocationPanel } from './InsuranceAllocationPanel';

const expense = {
  id: 'policy',
  totalAmountMinor: 120000,
  currency: 'NZD',
  allocation: {
    method: 'MANUAL_PERCENTAGE',
    allocatedAmountMinor: 60000,
    percentageBasisPoints: 5000,
    calculationPeriodStart: null,
    calculationPeriodEnd: null,
    notes: null,
    reviewerEmail: 'reviewer@example.invalid',
  },
};

function open(role: string, onAdjust = vi.fn(() => Promise.resolve())) {
  render(
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '*',
          element: (
            <InsuranceAllocationPanel
              expense={expense}
              role={role}
              onAdjust={onAdjust}
            />
          ),
        },
      ])}
    />,
  );
  return onAdjust;
}

describe('insurance allocation review access', () => {
  it('lets an accountant submit an attributed adjustment separately from the full premium', async () => {
    const onAdjust = open('ACCOUNTANT');
    expect(screen.getByText('$1,200.00')).toBeVisible();
    expect(screen.getByText('$600.00')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust allocation' }));
    fireEvent.change(screen.getByLabelText('Allocated business amount'), {
      target: { value: '720.00' },
    });
    fireEvent.change(screen.getByLabelText('Adjustment notes'), {
      target: { value: 'Evidence reviewed.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'reviewer attribution',
    );
    expect(onAdjust).toHaveBeenCalledWith(
      '720.00',
      'Evidence reviewed.',
      '',
      '',
    );
    expect(screen.getByText('$1,200.00')).toBeVisible();
  });

  it.each(['OWNER', 'AUDITOR', 'UNKNOWN'])(
    'shows allocation and attribution without the accountant-only editor for %s',
    (role) => {
      open(role);
      expect(
        screen.getByText(/Last adjusted by reviewer@example.invalid/),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Adjust allocation' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    },
  );

  it('preserves the adjustment draft and focuses a server error', async () => {
    const reject = vi.fn(() =>
      Promise.reject(new Error('Adjustment unavailable.')),
    );
    open('ACCOUNTANT', reject);
    fireEvent.click(screen.getByRole('button', { name: 'Adjust allocation' }));
    fireEvent.change(screen.getByLabelText('Adjustment notes'), {
      target: { value: 'Keep this draft.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Adjustment unavailable.',
    );
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(screen.getByLabelText('Adjustment notes')).toHaveValue(
      'Keep this draft.',
    );
  });
});
