import { type FormEvent, useId, useState } from 'react';
import {
  emptyWorkSessionDraft,
  type ReferenceOption,
  type WorkSessionDraft,
} from './workSessionModel';

export function WorkSessionForm({
  activities,
  vehicles,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  activities: ReferenceOption[];
  vehicles: ReferenceOption[];
  initial: WorkSessionDraft;
  submitLabel: string;
  onSubmit: (draft: WorkSessionDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const formId = useId().replaceAll(':', '');
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(draft);
      if (!onCancel) setDraft(emptyWorkSessionDraft);
    } catch {
      // The parent owns and displays the API error.
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="work-session-form"
      onSubmit={(event) => void submit(event)}
    >
      <label htmlFor={`activity-${formId}`}>Business activity</label>
      <select
        id={`activity-${formId}`}
        required
        value={draft.businessActivityId}
        onChange={(event) =>
          setDraft({ ...draft, businessActivityId: event.target.value })
        }
      >
        <option value="">Select an activity</option>
        {activities.map((activity) => (
          <option
            key={activity.id}
            value={activity.id}
            disabled={
              !activity.active && initial.businessActivityId !== activity.id
            }
          >
            {activity.label}
            {activity.active ? '' : ' (inactive)'}
          </option>
        ))}
      </select>

      <label htmlFor={`vehicle-${formId}`}>Vehicle</label>
      <select
        id={`vehicle-${formId}`}
        required
        value={draft.vehicleId}
        onChange={(event) =>
          setDraft({ ...draft, vehicleId: event.target.value })
        }
      >
        <option value="">Select a vehicle</option>
        {vehicles.map((vehicle) => (
          <option
            key={vehicle.id}
            value={vehicle.id}
            disabled={!vehicle.active && initial.vehicleId !== vehicle.id}
          >
            {vehicle.label}
            {vehicle.active ? '' : ' (inactive)'}
          </option>
        ))}
      </select>

      <div className="form-pair">
        <div>
          <label htmlFor={`start-${formId}`}>Start</label>
          <input
            id={`start-${formId}`}
            type="datetime-local"
            required
            value={draft.startedAt}
            onChange={(event) =>
              setDraft({ ...draft, startedAt: event.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor={`end-${formId}`}>End</label>
          <input
            id={`end-${formId}`}
            type="datetime-local"
            required
            value={draft.endedAt}
            onChange={(event) =>
              setDraft({ ...draft, endedAt: event.target.value })
            }
          />
        </div>
      </div>

      <div className="form-pair">
        <div>
          <label htmlFor={`odometer-start-${formId}`}>
            Starting odometer (km)
          </label>
          <input
            id={`odometer-start-${formId}`}
            type="number"
            min="0"
            step="0.001"
            required
            value={draft.odometerStartKm}
            onChange={(event) =>
              setDraft({ ...draft, odometerStartKm: event.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor={`odometer-end-${formId}`}>Ending odometer (km)</label>
          <input
            id={`odometer-end-${formId}`}
            type="number"
            min="0"
            step="0.001"
            required
            value={draft.odometerEndKm}
            onChange={(event) =>
              setDraft({ ...draft, odometerEndKm: event.target.value })
            }
          />
        </div>
      </div>

      <label htmlFor={`revenue-${formId}`}>Gross revenue (optional)</label>
      <div className="money-input">
        <span aria-hidden="true">$</span>
        <input
          id={`revenue-${formId}`}
          inputMode="decimal"
          pattern="[0-9]+([.][0-9]{1,2})?"
          placeholder="0.00"
          value={draft.grossRevenue}
          onChange={(event) =>
            setDraft({ ...draft, grossRevenue: event.target.value })
          }
        />
        <span>{draft.currency}</span>
      </div>

      <label htmlFor={`notes-${formId}`}>Notes (optional)</label>
      <textarea
        id={`notes-${formId}`}
        maxLength={2000}
        value={draft.notes}
        onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
      />

      <div className="button-row">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
