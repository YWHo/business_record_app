import type { Meta, StoryObj } from '@storybook/react-vite';
import { BusinessCard } from '../../components/BusinessCard';
import { staticDemoBusinesses } from './staticDemo';

const meta = {
  title: 'Demo/Static business baseline',
  render: () => (
    <div className="business-grid">
      {staticDemoBusinesses().map((business) => (
        <BusinessCard key={business.id} business={business} />
      ))}
    </div>
  ),
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllBusinesses: Story = {};
export const Phone: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};
