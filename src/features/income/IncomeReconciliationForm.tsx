import { type SubmitEvent, useState } from 'react';
import { FormError } from '../../components/FormError';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

export function IncomeReconciliationForm({
  totalAmountMinor,
  onSubmit,
}: {
  totalAmountMinor: number;
  onSubmit: (value: {
    expectedAmount: string;
    actualAmount: string;
    notes: string;
  }) => Promise<void>;
}) {
  const [expectedAmount, setExpected] = useState(
    (totalAmountMinor / 100).toFixed(2),
  );
  const [actualAmount, setActual] = useState(
    (totalAmountMinor / 100).toFixed(2),
  );
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit({ expectedAmount, actualAmount, notes });
      setDirty(false);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save reconciliation.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="secondary-button"
        onClick={() => setOpen(true)}
      >
        Reconcile
      </button>
    );
  }

  return (
    <form
      className="reference-form"
      onChange={() => setDirty(true)}
      onSubmit={(event) => void submit(event)}
    >
      <UnsavedChangesGuard when={dirty && !saving} />
      <h3>Manual reconciliation</h3>
      <div className="form-pair">
        <label>
          Expected
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={expectedAmount}
            onChange={(event) => setExpected(event.target.value)}
          />
        </label>
        <label>
          Actual
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={actualAmount}
            onChange={(event) => setActual(event.target.value)}
          />
        </label>
      </div>
      <label>
        Notes
        <textarea
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <FormError message={error} />
      <div className="button-row">
        <button disabled={saving}>
          {saving ? 'Saving…' : 'Save reconciliation'}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={saving}
          onClick={() => {
            setDirty(false);
            setOpen(false);
            setError('');
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
