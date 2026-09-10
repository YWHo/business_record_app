import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../features/auth/AuthContext';
import { BackupReminder } from '../features/exports/BackupReminder';
import { DashboardMetricCard } from '../components/DashboardMetricCard';

interface FinancialTotal {
  currency: string;
  recordedRevenueMinor: number;
  cashReceivedMinor: number;
  recordedExpensesMinor: number;
  netCashMovementMinor: number;
  incomeLessRecordedExpensesMinor: number;
}
interface Spending {
  currency: string;
  fuelSpendingMinor: number;
  parkingSpendingMinor: number;
  fuelLitres: number;
}
interface PlatformActivity {
  activityId: string;
  activityName: string;
  currency: string;
  sessionCount: number;
  revenueSessionCount: number;
  revenueComplete: boolean;
  durationHours: number;
  distanceKm: number;
  sessionRevenueMinor: number | null;
  revenuePerSessionMinor: number | null;
  revenuePerHourMinor: number | null;
  revenuePerKmMinor: number | null;
  fuelSpendingMinor: number;
  fuelLitres: number;
  parkingSpendingMinor: number;
  directOperatingCostMinor: number;
  fuelCostPerKmMinor: number | null;
  directOperatingContributionMinor: number | null;
  recordedPlatformIncomeMinor: number;
  allocatedInsuranceMinor: number;
}
interface DashboardData {
  period: {
    taxYear: string;
    from: string;
    to: string;
    activityId: string | null;
  };
  financialTotals: FinancialTotal[];
  spending: Spending[];
  outstandingInvoices: Array<{
    currency: string;
    invoiceCount: number;
    outstandingMinor: number;
  }>;
  review: {
    totalRecords: number;
    unreviewedCount: number;
    missingInformationCount: number;
    readyForReviewCount: number;
  };
  platformActivities: PlatformActivity[];
}
interface Activity {
  id: string;
  name: string;
}

const money = (minor: number | null, currency: string) =>
  minor === null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(
        minor / 100,
      );
const number = (value: number, suffix = '') =>
  `${value.toLocaleString('en-NZ', { maximumFractionDigits: 2 })}${suffix}`;

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null),
    [activities, setActivities] = useState<Activity[]>([]),
    [taxYear, setTaxYear] = useState(''),
    [activityId, setActivityId] = useState(''),
    [error, setError] = useState('');
  const load = useCallback(async (year: string, activity: string) => {
    const query = new URLSearchParams();
    if (year) query.set('taxYear', year);
    if (activity) query.set('activityId', activity);
    const [dashboardResult, activityResult] = await Promise.all([
      apiRequest<DashboardData>(`/api/dashboard?${query}`),
      apiRequest<{ activities: Activity[] }>('/api/business-activities'),
    ]);
    setDashboard(dashboardResult);
    setTaxYear(dashboardResult.period.taxYear);
    setActivities(activityResult.activities);
  }, []);
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load('', '').catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load dashboard.',
      ),
    );
  }, [load]);

  async function applyFilters() {
    setError('');
    try {
      await load(taxYear, activityId);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load dashboard.',
      );
    }
  }
  const financial = dashboard?.financialTotals.length
    ? dashboard.financialTotals
    : [
        {
          currency: 'NZD',
          recordedRevenueMinor: 0,
          cashReceivedMinor: 0,
          recordedExpensesMinor: 0,
          netCashMovementMinor: 0,
          incomeLessRecordedExpensesMinor: 0,
        },
      ];

  return (
    <section aria-labelledby="dashboard-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Overview</span>
          <h1 id="dashboard-heading">Your business at a glance</h1>
          <p>
            Recorded income, cash movement, costs, and operating indicators —
            not final accounting profit or tax treatment.
          </p>
        </div>
        <Link className="button-link" to="/records">
          Add record
        </Link>
      </div>
      <section
        className="panel dashboard-filters"
        aria-label="Dashboard period"
      >
        <div className="form-pair">
          <label>
            Tax year ending
            <input
              type="number"
              min="1901"
              max="9999"
              value={taxYear}
              onChange={(event) => setTaxYear(event.target.value)}
            />
          </label>
          <label>
            Business activity
            <select
              value={activityId}
              onChange={(event) => setActivityId(event.target.value)}
            >
              <option value="">All activities</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" onClick={() => void applyFilters()}>
          Update dashboard
        </button>
        {dashboard ? (
          <small>
            {dashboard.period.from} to {dashboard.period.to}
          </small>
        ) : null}
      </section>
      {error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : null}
      {dashboard ? (
        <>
          <div className="metric-grid dashboard-metrics">
            {financial.flatMap((total) => [
              <DashboardMetricCard
                key={`revenue-${total.currency}`}
                label="Recorded revenue"
                value={money(total.recordedRevenueMinor, total.currency)}
                note={`${total.currency} invoice and received income values`}
              />,
              <DashboardMetricCard
                key={`expenses-${total.currency}`}
                label="Recorded expenses"
                value={money(total.recordedExpensesMinor, total.currency)}
                note={`${total.currency} retained active records`}
              />,
              <DashboardMetricCard
                key={`cash-${total.currency}`}
                label="Net cash movement"
                value={money(total.netCashMovementMinor, total.currency)}
                note="Cash received less recorded expenses"
              />,
              <DashboardMetricCard
                key={`result-${total.currency}`}
                label="Income less recorded expenses"
                value={money(
                  total.incomeLessRecordedExpensesMinor,
                  total.currency,
                )}
                note="Not taxable or final accounting profit"
              />,
            ])}
          </div>
          <BackupReminder />
          <div className="dashboard-columns">
            <section className="panel">
              <h2>Review indicators</h2>
              <dl className="dashboard-list">
                <div>
                  <dt>Total records</dt>
                  <dd>{dashboard.review.totalRecords}</dd>
                </div>
                <div>
                  <dt>Unreviewed</dt>
                  <dd>{dashboard.review.unreviewedCount}</dd>
                </div>
                <div>
                  <dt>Missing information</dt>
                  <dd>{dashboard.review.missingInformationCount}</dd>
                </div>
                <div>
                  <dt>Ready for review</dt>
                  <dd>{dashboard.review.readyForReviewCount}</dd>
                </div>
              </dl>
              <Link to="/transactions">Open review workspace</Link>
            </section>
            <section className="panel">
              <h2>Fuel and parking</h2>
              {dashboard.spending.length ? (
                dashboard.spending.map((item) => (
                  <dl className="dashboard-list" key={item.currency}>
                    <div>
                      <dt>Fuel spending</dt>
                      <dd>{money(item.fuelSpendingMinor, item.currency)}</dd>
                    </div>
                    <div>
                      <dt>Recorded fuel</dt>
                      <dd>{number(item.fuelLitres, ' L')}</dd>
                    </div>
                    <div>
                      <dt>Parking spending</dt>
                      <dd>{money(item.parkingSpendingMinor, item.currency)}</dd>
                    </div>
                  </dl>
                ))
              ) : (
                <p>No fuel or parking costs in this period.</p>
              )}
            </section>
            <section className="panel">
              <h2>Outstanding contract invoices</h2>
              {dashboard.outstandingInvoices.length ? (
                dashboard.outstandingInvoices.map((item) => (
                  <div key={item.currency}>
                    <strong>
                      {money(item.outstandingMinor, item.currency)}
                    </strong>
                    <p>
                      {item.invoiceCount} open invoice
                      {item.invoiceCount === 1 ? '' : 's'}
                    </p>
                  </div>
                ))
              ) : (
                <p>No outstanding contract invoices in this period.</p>
              )}
            </section>
          </div>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Delivery and ride-hailing operations</h2>
                <p>
                  Session revenue less directly recorded fuel and parking only.
                  Allocated insurance is shown separately.
                </p>
              </div>
              <span className="count-badge">
                {dashboard.platformActivities.length}
              </span>
            </div>
            <div className="reference-grid">
              {dashboard.platformActivities.length ? (
                dashboard.platformActivities.map((item) => (
                  <article
                    className="record-card"
                    key={`${item.activityId}-${item.currency}`}
                  >
                    <span className="eyebrow">{item.currency}</span>
                    <h3>{item.activityName}</h3>
                    {item.sessionCount === 0 ? (
                      <p className="notice">
                        Revenue-derived rates are unavailable because no work
                        sessions were recorded for this activity and currency.
                      </p>
                    ) : !item.revenueComplete ? (
                      <p className="notice">
                        Revenue-derived rates are unavailable because at least
                        one session has no gross revenue.
                      </p>
                    ) : null}
                    <dl className="dashboard-list">
                      <div>
                        <dt>Recorded platform income</dt>
                        <dd>
                          {money(
                            item.recordedPlatformIncomeMinor,
                            item.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Sessions</dt>
                        <dd>{item.sessionCount}</dd>
                      </div>
                      <div>
                        <dt>Session revenue</dt>
                        <dd>
                          {money(item.sessionRevenueMinor, item.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt>Revenue/session</dt>
                        <dd>
                          {money(item.revenuePerSessionMinor, item.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt>Revenue/hour</dt>
                        <dd>
                          {money(item.revenuePerHourMinor, item.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt>Revenue/km</dt>
                        <dd>{money(item.revenuePerKmMinor, item.currency)}</dd>
                      </div>
                      <div>
                        <dt>Distance</dt>
                        <dd>{number(item.distanceKm, ' km')}</dd>
                      </div>
                      <div>
                        <dt>Fuel cost/km</dt>
                        <dd>{money(item.fuelCostPerKmMinor, item.currency)}</dd>
                      </div>
                      <div>
                        <dt>Parking cost</dt>
                        <dd>
                          {money(item.parkingSpendingMinor, item.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt>Direct operating cost</dt>
                        <dd>
                          {money(item.directOperatingCostMinor, item.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt>Direct operating contribution</dt>
                        <dd>
                          {money(
                            item.directOperatingContributionMinor,
                            item.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Allocated insurance</dt>
                        <dd>
                          {money(item.allocatedInsuranceMinor, item.currency)}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))
              ) : (
                <p>No delivery or ride-hailing activity in this period.</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <p role="status">Loading dashboard…</p>
      )}
    </section>
  );
}
