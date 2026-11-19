import { useState } from 'react';
import { AllocationAdjustmentForm } from './AllocationAdjustmentForm';
import {
  type BusinessExpense,
  formatMoney,
  plainLabel,
} from './businessExpense';
import { canAdjustInsuranceAllocation } from '../../lib/permissions';

export function InsuranceAllocationPanel({
  expense,
  role,
  onAdjust,
}: {
  expense: Pick<
    BusinessExpense,
    'id' | 'allocation' | 'totalAmountMinor' | 'currency'
  >;
  role: unknown;
  onAdjust: (
    amount: string,
    notes: string,
    periodStart: string,
    periodEnd: string,
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [saved, setSaved] = useState(false);

  const allocation = expense.allocation;
  if (!allocation) {
    return null;
  }

  return (
    <section className="panel" aria-labelledby="insurance-allocation-heading">
      <h2 id="insurance-allocation-heading">Insurance business allocation</h2>
      <dl className="detail-grid">
        <div>
          <dt>Full premium</dt>
          <dd>{formatMoney(expense.totalAmountMinor, expense.currency)}</dd>
        </div>
        <div>
          <dt>Allocated business amount</dt>
          <dd>
            {allocation.allocatedAmountMinor === null
              ? 'Undetermined'
              : formatMoney(allocation.allocatedAmountMinor, expense.currency)}
          </dd>
        </div>
        <div>
          <dt>Allocation method</dt>
          <dd>{plainLabel(allocation.method)}</dd>
        </div>
        <div>
          <dt>Business percentage</dt>
          <dd>
            {allocation.percentageBasisPoints === null
              ? 'Undetermined'
              : `${(allocation.percentageBasisPoints / 100).toFixed(2)}%`}
          </dd>
        </div>
      </dl>
      {(allocation.calculationPeriodStart ||
        allocation.calculationPeriodEnd) && (
        <p>
          Calculation period: {allocation.calculationPeriodStart ?? 'No start'}{' '}
          to {allocation.calculationPeriodEnd ?? 'No end'}
        </p>
      )}
      {allocation.notes && <p>{allocation.notes}</p>}
      {allocation.reviewerEmail && (
        <p>Last adjusted by {allocation.reviewerEmail}.</p>
      )}
      <p>
        The full premium is separate from its business allocation. Allocation
        estimates are not final tax treatment.
      </p>
      {saved && (
        <p role="status">
          Allocation adjustment recorded with reviewer attribution.
        </p>
      )}
      {canAdjustInsuranceAllocation({ role }) &&
        (open ? (
          <AllocationAdjustmentForm
            allocation={allocation}
            premiumMinor={expense.totalAmountMinor}
            onCancel={() => setOpen(false)}
            onSubmit={async (...values) => {
              await onAdjust(...values);
              setOpen(false);
              setSaved(true);
            }}
          />
        ) : (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setOpen(true)}
          >
            Adjust allocation
          </button>
        ))}
    </section>
  );
}
