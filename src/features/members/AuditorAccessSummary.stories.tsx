import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuditorAccessSummary } from './AuditorAccessSummary';
const meta = {
  title: 'Members/Auditor grant summary',
  component: AuditorAccessSummary,
  args: {
    businesses: [{ id: 'business-one', name: 'IT Contracting' }],
    entities: [{ id: 'entity-one', name: 'Example Company Limited' }],
    grant: {
      accessStartsAt: null,
      accessExpiresAt: '2099-01-01T00:00:00.000Z',
      note: null,
      scopes: [
        {
          scopeType: 'BUSINESS',
          businessId: 'business-one',
          legalEntityId: null,
          dateFrom: '2026-04-01',
          dateTo: '2027-03-31',
        },
      ],
    },
  },
} satisfies Meta<typeof AuditorAccessSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BusinessPeriod: Story = {};
export const ScheduledEntity: Story = {
  args: {
    grant: {
      ...meta.args.grant,
      accessStartsAt: '2098-01-01T00:00:00.000Z',
      scopes: [
        {
          scopeType: 'LEGAL_ENTITY',
          businessId: null,
          legalEntityId: 'entity-one',
          dateFrom: null,
          dateTo: null,
        },
      ],
    },
  },
};
export const WholeAccount: Story = {
  args: {
    grant: {
      ...meta.args.grant,
      scopes: [
        {
          scopeType: 'ACCOUNT',
          businessId: null,
          legalEntityId: null,
          dateFrom: null,
          dateTo: null,
        },
      ],
    },
  },
};
