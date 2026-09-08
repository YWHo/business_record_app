import { type FormEvent, useState } from 'react';
import type {
  ExpenseDraft,
  ParkingDraft,
  ReferenceOption,
} from './expenseModel';

type InputEvent = React.ChangeEvent<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
>;

function CommonFields<T extends ExpenseDraft>({
  draft,
  setDraft,
  activities,
  categories,
  showCategory = true,
}: {
  draft: T;
  setDraft: (draft: T) => void;
  activities: ReferenceOption[];
  categories: ReferenceOption[];
  showCategory?: boolean;
}) {
  const field = (key: keyof T) => (event: InputEvent) =>
    setDraft({ ...draft, [key]: event.target.value });
  return (
    <>
      <div className="form-pair">
        <label>
          Business activity (optional)
          <select
            value={draft.businessActivityId}
            onChange={field('businessActivityId')}
          >
            <option value="">Unallocated</option>
            {activities.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.active}>
                {item.label}
                {item.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </label>
        {showCategory ? (
          <label>
            Expense category
            <select
              required
              value={draft.expenseCategoryId}
              onChange={field('expenseCategoryId')}
            >
              <option value="">Select a category</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.active}>
                  {item.label}
                  {item.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="form-pair">
        <label>
          Purchase date and time
          <input
            required
            type="datetime-local"
            value={draft.purchaseDatetime}
            onChange={field('purchaseDatetime')}
          />
        </label>
        <label>
          Total amount
          <input
            required
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            value={draft.totalAmount}
            onChange={field('totalAmount')}
          />
        </label>
      </div>
      <div className="form-pair">
        <label>
          GST amount (optional)
          <input
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            value={draft.gstAmount}
            onChange={field('gstAmount')}
          />
        </label>
        <label>
          GST status
          <select value={draft.gstStatus} onChange={field('gstStatus')}>
            <option value="UNKNOWN">Unknown</option>
            <option value="GST_INCLUDED">GST included</option>
            <option value="NO_GST">No GST</option>
            <option value="REVIEW_REQUIRED">Review required</option>
          </select>
        </label>
      </div>
      <label>
        Recurrence
        <select value={draft.recurrenceType} onChange={field('recurrenceType')}>
          <option value="ONE_OFF">One-off</option>
          <option value="RECURRING">Recurring</option>
        </select>
      </label>
      <label>
        Description / notes (optional)
        <textarea
          maxLength={2000}
          value={draft.description}
          onChange={field('description')}
        />
      </label>
    </>
  );
}

function Actions({
  saving,
  submitLabel,
  onCancel,
}: {
  saving: boolean;
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <div className="button-row">
      <button disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
      {onCancel ? (
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
    </div>
  );
}

export function GeneralExpenseForm({
  initial,
  activities,
  categories,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ExpenseDraft;
  activities: ReferenceOption[];
  categories: ReferenceOption[];
  submitLabel: string;
  onSubmit: (draft: ExpenseDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(draft);
    } catch {
      /* parent */
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="work-session-form"
      onSubmit={(event) => void submit(event)}
    >
      <label>
        Merchant
        <input
          required
          maxLength={200}
          value={draft.merchantName}
          onChange={(event) =>
            setDraft({ ...draft, merchantName: event.target.value })
          }
        />
      </label>
      <CommonFields
        draft={draft}
        setDraft={setDraft}
        activities={activities}
        categories={categories}
      />
      <Actions saving={saving} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}

export function ParkingForm({
  initial,
  activities,
  vehicles,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ParkingDraft;
  activities: ReferenceOption[];
  vehicles: ReferenceOption[];
  submitLabel: string;
  onSubmit: (draft: ParkingDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        ...draft,
        merchantName: draft.parkingProvider || 'Parking',
      });
    } catch {
      /* parent */
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="work-session-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="form-pair">
        <label>
          Provider (optional)
          <input
            maxLength={200}
            value={draft.parkingProvider}
            onChange={(event) =>
              setDraft({ ...draft, parkingProvider: event.target.value })
            }
          />
        </label>
        <label>
          Location
          <input
            required
            maxLength={500}
            value={draft.parkingLocation}
            onChange={(event) =>
              setDraft({ ...draft, parkingLocation: event.target.value })
            }
          />
        </label>
      </div>
      <CommonFields
        draft={draft}
        setDraft={setDraft}
        activities={activities}
        categories={[]}
        showCategory={false}
      />
      <label>
        Vehicle (optional)
        <select
          value={draft.vehicleId}
          onChange={(event) =>
            setDraft({ ...draft, vehicleId: event.target.value })
          }
        >
          <option value="">No vehicle</option>
          {vehicles.map((item) => (
            <option key={item.id} value={item.id} disabled={!item.active}>
              {item.label}
              {item.active ? '' : ' (inactive)'}
            </option>
          ))}
        </select>
      </label>
      <div className="form-pair">
        <label>
          Parking start (optional)
          <input
            type="datetime-local"
            value={draft.parkingStartDatetime}
            onChange={(event) =>
              setDraft({ ...draft, parkingStartDatetime: event.target.value })
            }
          />
        </label>
        <label>
          Parking end (optional)
          <input
            type="datetime-local"
            value={draft.parkingEndDatetime}
            onChange={(event) =>
              setDraft({ ...draft, parkingEndDatetime: event.target.value })
            }
          />
        </label>
      </div>
      <label>
        Reference / ticket number (optional)
        <input
          maxLength={200}
          value={draft.parkingReference}
          onChange={(event) =>
            setDraft({ ...draft, parkingReference: event.target.value })
          }
        />
      </label>
      <Actions saving={saving} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}
