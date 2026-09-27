import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { AttachmentPanel } from '../features/attachments/AttachmentPanel';
import {
  incomeDate,
  incomeMoney,
  incomeTitle,
  incomeTypeLabels,
  plainIncomeValue,
} from '../features/income/businessIncome';
import { ReconcileForm, type IncomeRecord } from './IncomePage';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function IncomeDetailPage() {
  const { businessId = '', incomeId = '' } = useParams();
  const { configuration, user } = useAuth();
  const [record, setRecord] = useState<IncomeRecord | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const result = await apiRequest<{ incomeRecord: IncomeRecord }>(
        `/api/businesses/${businessId}/income/${incomeId}`,
      );
      setRecord(result.incomeRecord);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load income.',
      );
    }
  }, [businessId, incomeId]);
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (error)
    return (
      <section className="empty-state" role="alert">
        <div>
          <h1>Income unavailable</h1>
          <p>{error}</p>
          <Link to={`/app/businesses/${businessId}/income`}>
            Back to income
          </Link>
        </div>
      </section>
    );
  if (!record) return <p role="status">Loading income…</p>;
  const details = record.details ?? {};
  return (
    <section aria-labelledby="income-detail-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{incomeTypeLabels[record.incomeType]}</span>
          <h1 id="income-detail-heading">{incomeTitle(record)}</h1>
          <p>
            {incomeDate(record.transactionDate)} ·{' '}
            {plainIncomeValue(record.status)}
          </p>
        </div>
        <div className="button-row">
          <Link
            className="secondary-button button-link"
            to={`/app/businesses/${businessId}/income`}
          >
            Back to income
          </Link>
          {user?.role === 'OWNER' ? (
            <Link className="primary-button button-link" to="edit">
              Edit income
            </Link>
          ) : null}
        </div>
      </div>
      <section className="panel record-detail-panel">
        <div className="record-detail-amount">
          {incomeMoney(record.totalAmountMinor, record.currency)}
        </div>
        <dl className="record-detail-grid">
          <Detail label="Type" value={incomeTypeLabels[record.incomeType]} />
          <Detail label="Source" value={record.receivedFrom} />
          <Detail label="Status" value={plainIncomeValue(record.status)} />
          <Detail label="Notes" value={record.notes} />
          {Object.entries(details).map(([key, value]) => (
            <Detail
              key={key}
              label={plainIncomeValue(key.replace(/([a-z])([A-Z])/g, '$1_$2'))}
              value={
                key.endsWith('Minor') && typeof value === 'number'
                  ? incomeMoney(value, record.currency)
                  : value
              }
            />
          ))}
        </dl>
      </section>
      {record.reconciliation ? (
        <p
          className={`notice ${record.reconciliation.matched ? 'success' : 'error'}`}
        >
          {record.reconciliation.matched ? 'Matched' : 'Difference'}:{' '}
          {incomeMoney(
            record.reconciliation.differenceAmountMinor,
            record.currency,
          )}{' '}
          · {record.reconciliation.reconcilerEmail}
        </p>
      ) : null}
      <section className="panel">
        <h2>Reconciliation</h2>
        <ReconcileForm record={record} onSaved={load} />
      </section>
      <AttachmentPanel
        recordType="INCOME"
        recordId={record.id}
        canManage={user?.role === 'OWNER'}
        localOnly={configuration?.environment === 'demo'}
      />
    </section>
  );
}
