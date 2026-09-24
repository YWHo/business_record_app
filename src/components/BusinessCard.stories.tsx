import type { Meta, StoryObj } from '@storybook/react-vite';
import { BusinessCard } from './BusinessCard';

const meta = {
  title: 'Components/Business card',
  component: BusinessCard,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '34rem' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    business: {
      id: 'business-ride',
      name: 'Uber Ride',
      description: 'Ride-hailing',
      businessType: 'PLATFORM_SERVICES',
      defaultCurrency: 'NZD',
      status: 'ACTIVE',
      legacyBusinessActivityId: 'activity-ride',
      currentLegalEntity: {
        id: 'entity-taxi',
        entityType: 'LIMITED_COMPANY',
        legalName: 'Taxi Limited',
        tradingName: null,
        status: 'ACTIVE',
        attributionReviewRequired: false,
      },
      recordCount: 96,
      lastRecordUpdatedAt: '2026-09-09T00:00:00.000Z',
    },
  },
} satisfies Meta<typeof BusinessCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LimitedCompany: Story = {};

export const SoleTrader: Story = {
  args: {
    business: {
      ...meta.args.business,
      id: 'business-delivery',
      name: 'Uber Eats',
      description: 'Food delivery',
      currentLegalEntity: {
        id: 'entity-owner',
        entityType: 'SOLE_TRADER',
        legalName: 'Brian Ho',
        tradingName: null,
        status: 'ACTIVE',
        attributionReviewRequired: false,
      },
      recordCount: 128,
    },
  },
};

export const NeedsAttention: Story = {
  args: {
    business: {
      ...meta.args.business,
      id: 'business-unconfigured',
      name: 'New business',
      description: null,
      currentLegalEntity: null,
      recordCount: 0,
      lastRecordUpdatedAt: null,
    },
  },
};

export const Phone: Story = {
  ...SoleTrader,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
