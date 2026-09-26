import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AttachmentPanel } from '../features/attachments/AttachmentPanel';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import {
  type BusinessExpense,
  expenseTypeLabels,
  formatExpenseDate,
  formatMoney,
  plainLabel,
} from '../features/expenses/businessExpense';

export function ExpenseDetailPage() {
  const { businessId = '', expenseId = '' } = useParams();
  const { configuration, user } = useAuth();
  const [expense, setExpense] = useState<BusinessExpense | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await apiRequest<{ expense: BusinessExpense }>(
        `/api/businesses/${businessId}/expenses/${expenseId}`,
      );
      setExpense(result.expense);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load expense.',
      );
    }
  }, [businessId, expenseId]);

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (error)
    return (
      <section className="empty-state" role="alert">
        <div>
          <h1>Unable to open expense</h1>
          <p>{error}</p>
          <Link to={`/app/businesses/${businessId}/expenses`}>
            Back to expenses
          </Link>
        </div>
      </section>
    );
  if (!expense) return <p role="status">Loading expense…</p>;

  return (
    <section aria-labelledby="expense-detail-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {expenseTypeLabels[expense.expenseType]} expense
          </span>
          <h1 id="expense-detail-heading">{expense.merchantName}</h1>
          <p>
            {formatExpenseDate(expense.purchaseDatetime)} ·{' '}
            {expense.categoryName}
          </p>
        </div>
        <div className="button-row">
          <Link
            className="secondary-button button-link"
            to={`/app/businesses/${businessId}/expenses`}
          >
            Back to expenses
          </Link>
          {user?.role === 'OWNER' ? (
            <Link
              className="button-link"
              to={`/app/businesses/${businessId}/expenses/${expense.id}/edit`}
            >
              Edit expense
            </Link>
          ) : null}
        </div>
      </div>

      <section className="panel expense-detail-panel">
        <div className="expense-detail-amount">
          <span>Amount</span>
          <strong>
            {formatMoney(expense.totalAmountMinor, expense.currency)}
          </strong>
          <span className={`status-badge ${expense.status.toLowerCase()}`}>
            {plainLabel(expense.status)}
          </span>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Type</dt>
            <dd>{expenseTypeLabels[expense.expenseType]}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{expense.categoryName}</dd>
          </div>
          <div>
            <dt>GST</dt>
            <dd>
              {expense.gstAmountMinor === null ||
              expense.gstAmountMinor === undefined
                ? 'Not recorded'
                : formatMoney(expense.gstAmountMinor, expense.currency)}
            </dd>
          </div>
          <div>
            <dt>Recurrence</dt>
            <dd>{plainLabel(expense.recurrenceType ?? 'ONE_OFF')}</dd>
          </div>
          {expense.vehicleRegistration ? (
            <div>
              <dt>Vehicle</dt>
              <dd>{expense.vehicleRegistration}</dd>
            </div>
          ) : null}
          {expense.parkingLocation ? (
            <div>
              <dt>Parking location</dt>
              <dd>{expense.parkingLocation}</dd>
            </div>
          ) : null}
          {expense.fuelLitres !== null && expense.fuelLitres !== undefined ? (
            <div>
              <dt>Fuel</dt>
              <dd>{expense.fuelLitres} L</dd>
            </div>
          ) : null}
          {expense.policyPeriodStart ? (
            <div>
              <dt>Policy period</dt>
              <dd>
                {expense.policyPeriodStart} to {expense.policyPeriodEnd}
              </dd>
            </div>
          ) : null}
        </dl>
        {expense.description ? <p>{expense.description}</p> : null}
      </section>

      <AttachmentPanel
        recordType="EXPENSE"
        recordId={expense.id}
        canManage={user?.role === 'OWNER'}
        localOnly={configuration?.environment === 'demo'}
      />
    </section>
  );
}
