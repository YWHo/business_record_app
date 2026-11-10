import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuditorAccessNotice } from './AuditorAccessNotice';
const meta = {
  title: 'Access/Auditor notice',
  component: AuditorAccessNotice,
  args: {
    access: {
      accessStartsAt: null,
      accessExpiresAt: '2028-06-30T11:59:00.000Z',
      scopes: [
        {
          scopeType: 'BUSINESS',
          label: 'IT Contracting',
          dateFrom: '2027-04-01',
          dateTo: '2028-03-31',
        },
      ],
    },
  },
} satisfies Meta<typeof AuditorAccessNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BusinessPeriod: Story = {};
export const WholeAccount: Story = {
  args: {
    access: {
      ...meta.args.access,
      scopes: [
        {
          scopeType: 'ACCOUNT',
          label: 'Whole account',
          dateFrom: null,
          dateTo: null,
        },
      ],
    },
  },
};
export const MultipleScopes: Story = {
  args: {
    access: {
      ...meta.args.access,
      scopes: [
        ...meta.args.access.scopes,
        {
          scopeType: 'LEGAL_ENTITY',
          label: 'Example Company Limited',
          dateFrom: '2026-04-01',
          dateTo: '2027-03-31',
        },
      ],
    },
  },
};
export const Phone: Story = {
  ...MultipleScopes,
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};
export const Unavailable: Story = { args: { access: undefined } };
