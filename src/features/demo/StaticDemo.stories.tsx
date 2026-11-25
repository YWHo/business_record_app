import type { Meta, StoryObj } from '@storybook/react-vite';
import { BusinessCard } from '../../components/BusinessCard';
import { staticDemoBusinesses } from './staticDemo';
import { readStaticDemoDetail } from './staticDemoDetails';

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

export const MileageEvidence: Story = {
  loaders: [
    async () => ({
      session: await readStaticDemoDetail(
        'business-demo-activity-delivery',
        'work-sessions',
        'demo-session-1',
      ),
    }),
  ],
  render: (_, { loaded }) => {
    const session = loaded.session as Record<string, unknown>;
    return (
      <section className="panel">
        <h2>Static work-session evidence</h2>
        <dl>
          <dt>Vehicle</dt>
          <dd>{String(session.vehicleRegistration)}</dd>
          <dt>Distance</dt>
          <dd>{String(session.distanceKm)} km</dd>
          <dt>Duration</dt>
          <dd>{String(session.durationMinutes)} minutes</dd>
          <dt>Fuel calculation</dt>
          <dd>{String(session.fuelCalculationStatus)}</dd>
        </dl>
      </section>
    );
  },
};
