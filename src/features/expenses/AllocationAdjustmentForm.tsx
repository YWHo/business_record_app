import { type SubmitEvent, useState } from 'react';
import { FormError } from '../../components/FormError';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import type { BusinessExpense } from './businessExpense';

export function AllocationAdjustmentForm({
  allocation,
  premiumMinor,
  onSubmit,
  onCancel,
}: {
  allocation: NonNullable<BusinessExpense['allocation']>;
  premiumMinor: number;
  onSubmit: (
    amount: string,
    notes: string,
    periodStart: string,
    periodEnd: string,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(
    allocation.allocatedAmountMinor === null
      ? ''
      : (allocation.allocatedAmountMinor / 100).toFixed(2),
  );
  const [notes, setNotes] = useState(allocation.notes ?? '');
  const [periodStart, setPeriodStart] = useState(
    allocation.calculationPeriodStart ?? '',
  );
  const [periodEnd, setPeriodEnd] = useState(
    allocation.calculationPeriodEnd ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(amount, notes, periodStart, periodEnd);
      setDirty(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save allocation adjustment.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="reference-form"
      onChange={() => setDirty(true)}
      onSubmit={(event) => void submit(event)}
    >
      <UnsavedChangesGuard when={dirty && !saving} />
      <h3>Accountant allocation adjustment</h3>
      <p>
        Adjust the business amount while preserving the full premium and prior
        calculation in audit history. This does not determine final tax
        treatment.
      </p>
      <label>
        Allocated business amount
        <input
          required
          type="number"
          min="0"
          max={(premiumMinor / 100).toFixed(2)}
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label>
        Adjustment notes
        <textarea
          required
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="form-pair">
        <label>
          Calculation period start (optional)
          <input
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
          />
        </label>
        <label>
          Calculation period end (optional)
          <input
            type="date"
            min={periodStart || undefined}
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
          />
        </label>
      </div>
      <FormError message={error} />
      <div className="button-row">
        <button disabled={saving}>
          {saving ? 'Saving…' : 'Save adjustment'}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
