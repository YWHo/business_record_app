import type { Meta, StoryObj } from '@storybook/react-vite';
import { IncomeReconciliationForm } from './IncomeReconciliationForm';

const meta = {
  title: 'Accounting/Income reconciliation',
  component: IncomeReconciliationForm,
  args: { totalAmountMinor: 12500, onSubmit: () => Promise.resolve() },
} satisfies Meta<typeof IncomeReconciliationForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {};

export const Editing: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Reconcile' }));
  },
};

export const SaveFailure: Story = {
  ...Editing,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Reconcile' }));
    await userEvent.click(
      canvas.getByRole('button', { name: 'Save reconciliation' }),
    );
    await canvas.findByRole('alert');
  },
  args: {
    onSubmit: () =>
      Promise.reject(
        new Error('Unable to save reconciliation. Your draft is still here.'),
      ),
  },
};
