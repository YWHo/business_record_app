import type { Meta, StoryObj } from '@storybook/react-vite';
import { DashboardMetricCard } from './DashboardMetricCard';

const meta = {
  title: 'Components/Dashboard metric card',
  component: DashboardMetricCard,
  decorators: [
    (Story) => (
      <div className="metric-grid story-metric-grid">
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Net cash movement',
    value: '$4,250.50',
    note: 'Cash received less recorded expenses',
  },
} satisfies Meta<typeof DashboardMetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Unavailable: Story = {
  args: {
    label: 'Revenue per kilometre',
    value: 'Unavailable',
    note: 'Add session revenue evidence to calculate this indicator',
  },
};

export const LongText: Story = {
  args: {
    label: 'Income less recorded expenses for a long activity name',
    value: 'NZD $123,456,789.00',
    note: 'Operational indicator only—not taxable or final accounting profit',
  },
};
