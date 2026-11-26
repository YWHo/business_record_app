import type { Meta, StoryObj } from '@storybook/react-vite';
import { BusinessCard } from '../../components/BusinessCard';
import { staticDemoBusinesses } from './staticDemo';
import { readStaticDemoDetail } from './staticDemoDetails';
import { readStaticDemoTransactions } from './staticDemoTransactions';
import { readStaticDemoReport } from './staticDemoReports';

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
export const FinancialReport: Story = {
  loaders: [
    async () => ({
      report: await readStaticDemoReport(
        new URLSearchParams({ businessId: 'business-demo-activity-rideshare' }),
      ),
    }),
  ],
  render: (_, { loaded }) => {
    const report = loaded.report as Awaited<
      ReturnType<typeof readStaticDemoReport>
    >;
    return (
      <section className="panel">
        <h2>Static Uber source totals</h2>
        <table>
          <thead>
            <tr>
              <th>Family</th>
              <th>Type</th>
              <th>Currency</th>
              <th>Recorded amount</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={`${row.family}-${row.subtype}-${row.currency}`}>
                <td>{row.family}</td>
                <td>{row.subtype}</td>
                <td>{row.currency}</td>
                <td>{(row.recorded_total_minor / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{report.note}</p>
      </section>
    );
  },
};
export const Transactions: Story = {
  loaders: [
    async () => ({
      transactionPage: await readStaticDemoTransactions(
        'business-demo-activity-rideshare',
        new URLSearchParams('pageSize=5'),
      ),
    }),
  ],
  render: (_, { loaded }) => {
    const result = loaded.transactionPage as Awaited<
      ReturnType<typeof readStaticDemoTransactions>
    >;
    return (
      <section className="panel">
        <h2>Static Uber transactions</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Source</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {result.transactions.map((row) => (
              <tr key={`${row.recordType}-${row.id}`}>
                <td>{row.transactionDate}</td>
                <td>{row.counterparty}</td>
                <td>{row.subtype}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  },
};
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
