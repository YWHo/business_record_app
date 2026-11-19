import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccountantAccessNotice } from './AccountantAccessNotice';
import { AuditorAccessNotice } from './AuditorAccessNotice';
const meta = {
  title: 'Access/Review and audit distinction',
  component: AccountantAccessNotice,
} satisfies Meta<typeof AccountantAccessNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Accountant: Story = {};
export const DemoAccountant: Story = { args: { demo: true } };
export const AccountantPhone: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};
export const AuditorComparison: Story = {
  render: () => (
    <AuditorAccessNotice
      access={{
        accessStartsAt: null,
        accessExpiresAt: '2099-01-01T00:00:00.000Z',
        scopes: [
          {
            scopeType: 'ACCOUNT',
            label: 'Whole account',
            dateFrom: null,
            dateTo: null,
          },
        ],
      }}
    />
  ),
};
