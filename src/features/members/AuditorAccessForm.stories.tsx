import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuditorAccessForm } from './AuditorAccessForm';
const meta = {
  title: 'Members/Auditor access form',
  component: AuditorAccessForm,
  args: {
    businesses: [
      { id: 'business-one', name: 'IT Contracting' },
      { id: 'business-two', name: 'Delivery Services' },
    ],
    entities: [{ id: 'entity-one', name: 'Example Company Limited' }],
    onSubmit: () => Promise.resolve(),
  },
} satisfies Meta<typeof AuditorAccessForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Invite: Story = {};
const member = {
  id: 'synthetic-auditor',
  email: 'reviewer@example.invalid',
  status: 'ACTIVE',
  accessState: 'ACTIVE',
  userStatus: 'ACTIVE',
  revision: 1,
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
} as const;
export const EditBusiness: Story = {
  args: { member: { ...member, scopes: [...member.scopes] } },
};
export const MultipleScopes: Story = {
  args: {
    member: {
      ...member,
      scopes: [
        ...member.scopes,
        {
          scopeType: 'LEGAL_ENTITY',
          businessId: null,
          legalEntityId: 'entity-one',
          dateFrom: '2025-04-01',
          dateTo: '2026-03-31',
        },
      ],
    },
  },
};
export const RestoreRevoked: Story = {
  args: {
    member: {
      ...member,
      status: 'DISABLED',
      accessState: 'DISABLED',
      scopes: [...member.scopes],
    },
  },
};
export const DisabledIdentity: Story = {
  args: {
    member: {
      ...member,
      userStatus: 'DISABLED',
      accessState: 'DISABLED',
      scopes: [...member.scopes],
    },
  },
};
export const SaveFailure: Story = {
  args: {
    onSubmit: () =>
      Promise.reject(
        new Error(
          'Access changed or is unavailable. Reload before trying again.',
        ),
      ),
  },
};
