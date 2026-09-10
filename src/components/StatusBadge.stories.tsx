import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge, type StatusTone } from './StatusBadge';

const meta = {
  title: 'Components/Status badge',
  component: StatusBadge,
  args: { status: 'READY_FOR_REVIEW' },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyForReview: Story = {};

export const MissingInformation: Story = {
  args: { status: 'MISSING_INFORMATION' },
};

export const AllWorkflowStates: Story = {
  render: () => {
    const statuses: StatusTone[] = [
      'ACTIVE',
      'INACTIVE',
      'NEW',
      'MISSING_INFORMATION',
      'READY_FOR_REVIEW',
      'REVIEWED',
      'PROCESSED',
      'VOIDED',
      'TRASHED',
    ];
    return (
      <div className="story-row">
        {statuses.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </div>
    );
  },
};

export const LongCustomLabel: Story = {
  args: {
    status: 'MISSING_INFORMATION',
    children: 'Missing supplier statement and transaction reference',
  },
};
