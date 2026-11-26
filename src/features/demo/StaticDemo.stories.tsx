import type { Meta, StoryObj } from '@storybook/react-vite';
import { BusinessCard } from '../../components/BusinessCard';
import { staticDemoBusinesses } from './staticDemo';
import { readStaticDemoDetail } from './staticDemoDetails';
import { readStaticDemoTransactions } from './staticDemoTransactions';
import { readStaticDemoReport } from './staticDemoReports';
import { readStaticDemoDashboard } from './staticDemoDashboard';
import { readStaticDemoReferences } from './staticDemoReferences';
import { readStaticDemoAudit } from './staticDemoHistory';
import { readStaticDemoDocuments } from './staticDemoEvidence';
import { EvidencePreview } from '../attachments/EvidencePreview';

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

export const FictionalEvidence: Story = {
  loaders: [
    async () => ({
      evidence: await readStaticDemoDocuments(
        'business-demo-activity-delivery',
      ),
    }),
  ],
  render: (_, { loaded }) => {
    const evidence = loaded.evidence as Awaited<
      ReturnType<typeof readStaticDemoDocuments>
    >;
    return (
      <section className="panel">
        <h2>Fictional demo evidence</h2>
        <p>
          These bundled examples contain synthetic data. Browser uploads keep
          filenames only.
        </p>
        {evidence.documents.map((file) => (
          <EvidencePreview key={file.id} file={file} canDownload={false} />
        ))}
      </section>
    );
  },
};

export const FictionalEvidencePhone: Story = {
  ...FictionalEvidence,
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};

export const ReferencesAndHistory: Story = {
  loaders: [
    async () => ({
      clients: await readStaticDemoReferences('clients'),
      audit: await readStaticDemoAudit(new URLSearchParams('pageSize=5')),
    }),
  ],
  render: (_, { loaded }) => {
    const clients = loaded.clients as Awaited<
      ReturnType<typeof readStaticDemoReferences>
    >;
    const audit = loaded.audit as Awaited<
      ReturnType<typeof readStaticDemoAudit>
    >;
    return (
      <section className="panel">
        <h2>Fictional clients and history</h2>
        <ul>
          {clients.clients.map((row) => (
            <li key={String(row.id)}>{String(row.name)}</li>
          ))}
        </ul>
        <h3>Seeded audit events</h3>
        <ul>
          {audit.auditEvents.map((row) => (
            <li key={String(row.id)}>
              {String(row.summary)} — {String(row.userEmail)}
            </li>
          ))}
        </ul>
      </section>
    );
  },
};

export const Dashboard: Story = {
  loaders: [
    async () => ({
      dashboard: await readStaticDemoDashboard(
        'business-demo-activity-rideshare',
        new URLSearchParams('taxYear=2027'),
      ),
    }),
  ],
  render: (_, { loaded }) => {
    const dashboard = loaded.dashboard as Awaited<
      ReturnType<typeof readStaticDemoDashboard>
    >;
    return (
      <section className="panel">
        <h2>Static Uber dashboard</h2>
        <dl>
          <dt>Records</dt>
          <dd>{dashboard.review.totalRecords}</dd>
          <dt>Items to review</dt>
          <dd>{dashboard.attention.itemsToReviewCount}</dd>
          <dt>Missing receipts</dt>
          <dd>{dashboard.attention.missingReceiptCount}</dd>
        </dl>
        <h3>Recent transactions</h3>
        <ul>
          {dashboard.recentTransactions.map((row) => (
            <li key={`${row.recordType}-${row.id}`}>
              {row.transactionDate}: {row.counterparty}
            </li>
          ))}
        </ul>
      </section>
    );
  },
};

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
