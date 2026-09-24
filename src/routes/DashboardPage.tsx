import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardMetricCard } from '../components/DashboardMetricCard';
import { apiRequest } from '../features/auth/AuthContext';
import {
  type BusinessSummary,
  useBusinessDirectory,
} from '../features/business/BusinessDirectoryContext';

interface FinancialTotal {
  currency: string;
  recordedRevenueMinor: number;
  recordedExpensesMinor: number;
  netCashMovementMinor: number;
}

interface RecentTransaction {
  id: string;
  businessId: string;
  recordType: 'EXPENSE' | 'INCOME';
  subtype: string;
  transactionDate: string;
  counterparty: string;
  totalAmountMinor: number;
  currency: string;
  status: string;
}

interface DashboardData {
  period: {
    taxYear: string;
    from: string;
    to: string;
  };
  financialTotals: FinancialTotal[];
  attention: {
    missingReceiptCount: number;
    itemsToReviewCount: number;
    outstandingInvoiceCount: number;
  };
  recentTransactions: RecentTransaction[];
}

const entityTypeLabels: Record<
  NonNullable<BusinessSummary['currentLegalEntity']>['entityType'],
  string
> = {
  SOLE_TRADER: 'Sole trader',
  LIMITED_COMPANY: 'Limited company',
  PARTNERSHIP: 'Partnership',
  TRUST: 'Trust',
  OTHER: 'Other entity',
};

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(
    minor / 100,
  );

function dateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-NZ', {
        day: '2-digit',
        month: 'short',
        timeZone: 'UTC',
      }).format(date)
    : value;
}

function statusLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function DashboardPage() {
  const { businessId = '' } = useParams();
  const { businesses } = useBusinessDirectory();
  const business = businesses.find((candidate) => candidate.id === businessId);
  const businessBase = `/app/businesses/${businessId}`;
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);

  const load = useCallback(
    async (taxYear = '') => {
      const requestId = ++requestSequence.current;
      setError('');
      setLoading(true);
      setDashboard(null);
      try {
        const query = new URLSearchParams();
        if (taxYear) query.set('taxYear', taxYear);
        const result = await apiRequest<DashboardData>(
          `/api/businesses/${businessId}/dashboard?${query}`,
        );
        if (requestId === requestSequence.current) setDashboard(result);
      } catch (caught) {
        if (requestId === requestSequence.current)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load this business dashboard.',
          );
      } finally {
        if (requestId === requestSequence.current) setLoading(false);
      }
    },
    [businessId],
  );

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const entity = business?.currentLegalEntity;
  const entityName = entity?.legalName || entity?.tradingName;
  const context = [
    business?.description,
    entityName && entity
      ? `${entityName} (${entityTypeLabels[entity.entityType]})`
      : 'Legal entity needs attention',
  ]
    .filter(Boolean)
    .join(' · ');
  const financial = dashboard?.financialTotals.length
    ? dashboard.financialTotals
    : [
        {
          currency: business?.defaultCurrency ?? 'NZD',
          recordedRevenueMinor: 0,
          recordedExpensesMinor: 0,
          netCashMovementMinor: 0,
        },
      ];
  const selectedYear = Number(dashboard?.period.taxYear);
  const taxYears = Number.isFinite(selectedYear)
    ? [selectedYear - 1, selectedYear, selectedYear + 1]
    : [];
  const attention = dashboard?.attention;
  const hasAttention = Boolean(
    attention &&
    (attention.missingReceiptCount ||
      attention.itemsToReviewCount ||
      attention.outstandingInvoiceCount),
  );

  return (
    <section aria-labelledby="dashboard-heading">
      <div className="page-heading business-dashboard-heading">
        <div>
          <span className="eyebrow">Business dashboard</span>
          <h1 id="dashboard-heading">{business?.name ?? 'Dashboard'}</h1>
          <p>{context}</p>
        </div>
        {dashboard ? (
          <label className="dashboard-period-select">
            <span>Tax year ending</span>
            <select
              aria-label="Tax year ending"
              value={dashboard.period.taxYear}
              onChange={(event) => void load(event.target.value)}
            >
              {taxYears.map((year) => (
                <option key={year} value={year}>
                  31 March {year}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}
      {loading ? <p role="status">Loading dashboard…</p> : null}

      {!loading && dashboard ? (
        <>
          <div className="metric-grid dashboard-metrics">
            {financial.flatMap((total) => [
              <DashboardMetricCard
                key={`revenue-${total.currency}`}
                label="Revenue"
                value={money(total.recordedRevenueMinor, total.currency)}
                note={`${total.currency} recorded income`}
              />,
              <DashboardMetricCard
                key={`expenses-${total.currency}`}
                label="Expenses"
                value={money(total.recordedExpensesMinor, total.currency)}
                note={`${total.currency} recorded expenses`}
              />,
              <DashboardMetricCard
                key={`cash-${total.currency}`}
                label="Net cash movement"
                value={money(total.netCashMovementMinor, total.currency)}
                note="Cash received less recorded expenses"
              />,
            ])}
          </div>

          <div className="business-dashboard-columns">
            <section className="panel needs-attention-panel">
              <div className="section-heading">
                <h2>Needs attention</h2>
              </div>
              {hasAttention ? (
                <ul className="attention-list">
                  {attention?.missingReceiptCount ? (
                    <li>
                      <span aria-hidden="true">!</span>
                      <Link to={`${businessBase}/expenses`}>
                        {attention.missingReceiptCount} missing receipt
                        {attention.missingReceiptCount === 1 ? '' : 's'}
                      </Link>
                    </li>
                  ) : null}
                  {attention?.itemsToReviewCount ? (
                    <li>
                      <span aria-hidden="true">!</span>
                      <Link to={`${businessBase}/transactions`}>
                        {attention.itemsToReviewCount} item
                        {attention.itemsToReviewCount === 1 ? '' : 's'} to
                        review
                      </Link>
                    </li>
                  ) : null}
                  {attention?.outstandingInvoiceCount ? (
                    <li>
                      <span aria-hidden="true">!</span>
                      <Link to={`${businessBase}/income`}>
                        {attention.outstandingInvoiceCount} outstanding invoice
                        {attention.outstandingInvoiceCount === 1 ? '' : 's'}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p>No items need attention for this tax year.</p>
              )}
            </section>

            <section className="panel recent-transactions-panel">
              <div className="section-heading">
                <h2>Recent transactions</h2>
                <Link to={`${businessBase}/transactions`}>View all</Link>
              </div>
              {dashboard.recentTransactions.length ? (
                <ul className="recent-transaction-list">
                  {dashboard.recentTransactions.map((transaction) => (
                    <li key={`${transaction.recordType}-${transaction.id}`}>
                      <time dateTime={transaction.transactionDate}>
                        {dateLabel(transaction.transactionDate)}
                      </time>
                      <span>
                        <strong>{transaction.counterparty}</strong>
                        <small>
                          {statusLabel(transaction.subtype)} ·{' '}
                          {statusLabel(transaction.status)}
                        </small>
                      </span>
                      <strong
                        className={
                          transaction.recordType === 'INCOME'
                            ? 'money-positive'
                            : undefined
                        }
                      >
                        {transaction.recordType === 'INCOME' ? '+' : '−'}
                        {money(
                          transaction.totalAmountMinor,
                          transaction.currency,
                        )}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No transactions recorded for this tax year.</p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
