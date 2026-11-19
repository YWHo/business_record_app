import type { Meta, StoryObj } from '@storybook/react-vite';
import { InsuranceAllocationPanel } from './InsuranceAllocationPanel';

const meta = {
  title: 'Accounting/Insurance allocation',
  component: InsuranceAllocationPanel,
  args: {
    role: 'ACCOUNTANT',
    expense: {
      id: 'synthetic-policy',
      totalAmountMinor: 120000,
      currency: 'NZD',
      allocation: {
        method: 'MANUAL_PERCENTAGE',
        allocatedAmountMinor: 60000,
        percentageBasisPoints: 5000,
        calculationPeriodStart: '2026-04-01',
        calculationPeriodEnd: '2027-03-31',
        notes: 'Synthetic business allocation estimate.',
        reviewerEmail: null,
      },
    },
    onAdjust: () => Promise.resolve(),
  },
} satisfies Meta<typeof InsuranceAllocationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Accountant: Story = {};

export const AccountantEditor: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Adjust allocation' }),
    );
  },
};

export const Auditor: Story = { args: { role: 'AUDITOR' } };

export const Owner: Story = { args: { role: 'OWNER' } };

export const AttributedAdjustment: Story = {
  args: {
    expense: {
      ...meta.args.expense,
      allocation: {
        ...meta.args.expense.allocation,
        method: 'ACCOUNTANT_ADJUSTMENT',
        reviewerEmail: 'accountant@example.invalid',
      },
    },
  },
};

export const SaveFailure: Story = {
  ...AccountantEditor,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Adjust allocation' }),
    );
    await userEvent.click(
      canvas.getByRole('button', { name: 'Save adjustment' }),
    );
    await canvas.findByRole('alert');
  },
  args: {
    onAdjust: () =>
      Promise.reject(new Error('Unable to save adjustment. Please try again.')),
  },
};
