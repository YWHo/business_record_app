import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest, useAuth } from '../features/auth/AuthContext';

interface Option {
  id: string;
  label: string;
  active: boolean;
}
interface FuelRecord {
  id: string;
  businessActivityId: string | null;
  activityName: string | null;
  vehicleId: string;
  vehicleRegistration: string;
  merchantName: string;
  purchaseDatetime: string;
  totalAmountMinor: number;
  currency: string;
  gstAmountMinor: number | null;
  gstStatus: string;
  description: string | null;
  recurrenceType: string;
  fuelStation: string | null;
  fuelPriceMicrosPerLitre: number | null;
  fuelLitres: number | null;
  odometerKm: number | null;
  fillType: string;
  notes: string | null;
}
interface Draft {
  businessActivityId: string;
  vehicleId: string;
  merchantName: string;
  purchaseDatetime: string;
  totalAmount: string;
  currency: string;
  gstAmount: string;
  gstStatus: string;
  description: string;
  recurrenceType: string;
  fuelStation: string;
  fuelPricePerLitre: string;
  fuelLitres: string;
  odometerKm: string;
  fillType: string;
  notes: string;
}
interface Warning {
  code: string;
  message: string;
}

function dateTimeValue(value = new Date().toISOString()) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function emptyDraft(): Draft {
  return {
    businessActivityId: '',
    vehicleId: '',
    merchantName: '',
    purchaseDatetime: dateTimeValue(),
    totalAmount: '',
    currency: 'NZD',
    gstAmount: '',
    gstStatus: 'UNKNOWN',
    description: '',
    recurrenceType: 'ONE_OFF',
    fuelStation: '',
    fuelPricePerLitre: '',
    fuelLitres: '',
    odometerKm: '',
    fillType: 'UNKNOWN',
    notes: '',
  };
}

function fromRecord(record: FuelRecord): Draft {
  return {
    businessActivityId: record.businessActivityId ?? '',
    vehicleId: record.vehicleId,
    merchantName: record.merchantName,
    purchaseDatetime: dateTimeValue(record.purchaseDatetime),
    totalAmount: (record.totalAmountMinor / 100).toFixed(2),
    currency: record.currency,
    gstAmount:
      record.gstAmountMinor === null
        ? ''
        : (record.gstAmountMinor / 100).toFixed(2),
    gstStatus: record.gstStatus,
    description: record.description ?? '',
    recurrenceType: record.recurrenceType,
    fuelStation: record.fuelStation ?? '',
    fuelPricePerLitre:
      record.fuelPriceMicrosPerLitre === null
        ? ''
        : String(record.fuelPriceMicrosPerLitre / 1_000_000),
    fuelLitres: record.fuelLitres === null ? '' : String(record.fuelLitres),
    odometerKm: record.odometerKm === null ? '' : String(record.odometerKm),
    fillType: record.fillType,
    notes: record.notes ?? '',
  };
}

function body(draft: Draft, confirmedWarnings: string[] = []) {
  return {
    ...draft,
    purchaseDatetime: new Date(draft.purchaseDatetime).toISOString(),
    fuelLitres: draft.fuelLitres === '' ? null : Number(draft.fuelLitres),
    odometerKm: draft.odometerKm === '' ? null : Number(draft.odometerKm),
    confirmedWarnings,
  };
}

function money(minor: number, currency: string) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(
    minor / 100,
  );
}

function FuelForm({
  initial,
  activities,
  vehicles,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  activities: Option[];
  vehicles: Option[];
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const field =
    (key: keyof Draft) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setDraft({ ...draft, [key]: event.target.value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(draft);
      if (!onCancel) setDraft(emptyDraft());
    } catch {
      /* parent displays */
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
        <div>
          <label>Business activity (optional)</label>
          <select
            value={draft.businessActivityId}
            onChange={field('businessActivityId')}
          >
            <option value="">Unallocated</option>
            {activities.map((item) => (
              <option
                key={item.id}
                value={item.id}
                disabled={
                  !item.active && initial.businessActivityId !== item.id
                }
              >
                {item.label}
                {item.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Vehicle</label>
          <select
            required
            value={draft.vehicleId}
            onChange={field('vehicleId')}
          >
            <option value="">Select a vehicle</option>
            {vehicles.map((item) => (
              <option
                key={item.id}
                value={item.id}
                disabled={!item.active && initial.vehicleId !== item.id}
              >
                {item.label}
                {item.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-pair">
        <div>
          <label>Merchant</label>
          <input
            required
            maxLength={200}
            value={draft.merchantName}
            onChange={field('merchantName')}
          />
        </div>
        <div>
          <label>Purchase date and time</label>
          <input
            required
            type="datetime-local"
            value={draft.purchaseDatetime}
            onChange={field('purchaseDatetime')}
          />
        </div>
      </div>
      <div className="form-pair">
        <div>
          <label>Total amount</label>
          <input
            required
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            value={draft.totalAmount}
            onChange={field('totalAmount')}
          />
        </div>
        <div>
          <label>GST amount (optional)</label>
          <input
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            value={draft.gstAmount}
            onChange={field('gstAmount')}
          />
        </div>
      </div>
      <label>GST status</label>
      <select value={draft.gstStatus} onChange={field('gstStatus')}>
        <option value="UNKNOWN">Unknown</option>
        <option value="GST_INCLUDED">GST included</option>
        <option value="NO_GST">No GST</option>
        <option value="REVIEW_REQUIRED">Review required</option>
      </select>
      <div className="form-pair">
        <div>
          <label>Fuel station (optional)</label>
          <input
            maxLength={200}
            value={draft.fuelStation}
            onChange={field('fuelStation')}
          />
        </div>
        <div>
          <label>Fill type</label>
          <select value={draft.fillType} onChange={field('fillType')}>
            <option value="FULL">Full</option>
            <option value="PARTIAL">Partial</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </div>
      </div>
      <div className="form-pair">
        <div>
          <label>Price per litre (optional)</label>
          <input
            inputMode="decimal"
            value={draft.fuelPricePerLitre}
            onChange={field('fuelPricePerLitre')}
          />
        </div>
        <div>
          <label>Litres (optional)</label>
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={draft.fuelLitres}
            onChange={field('fuelLitres')}
          />
        </div>
      </div>
      <label>Odometer (km, optional)</label>
      <input
        type="number"
        min="0"
        step="0.001"
        value={draft.odometerKm}
        onChange={field('odometerKm')}
      />
      <label>Description (optional)</label>
      <textarea
        maxLength={2000}
        value={draft.description}
        onChange={field('description')}
      />
      <label>Recurrence</label>
      <select value={draft.recurrenceType} onChange={field('recurrenceType')}>
        <option value="ONE_OFF">One-off</option>
        <option value="RECURRING">Recurring</option>
      </select>
      <label>Fuel notes (optional)</label>
      <textarea
        maxLength={2000}
        value={draft.notes}
        onChange={field('notes')}
      />
      <div className="button-row">
        <button disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
        {onCancel ? (
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function FuelPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'OWNER';
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [activities, setActivities] = useState<Option[]>([]);
  const [vehicles, setVehicles] = useState<Option[]>([]);
  const [editing, setEditing] = useState<FuelRecord | null>(null);
  const [pending, setPending] = useState<{
    draft: Draft;
    editingId: string | null;
    warnings: Warning[];
  } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const [fuel, activity, vehicle] = await Promise.all([
      apiRequest<{ fuelRecords: FuelRecord[] }>('/api/fuel-records'),
      apiRequest<{
        activities: Array<{ id: string; name: string; active: boolean }>;
      }>('/api/business-activities'),
      apiRequest<{
        vehicles: Array<{ id: string; registration: string; active: boolean }>;
      }>('/api/vehicles'),
    ]);
    setRecords(fuel.fuelRecords);
    setActivities(
      activity.activities.map((item) => ({
        id: item.id,
        label: item.name,
        active: item.active,
      })),
    );
    setVehicles(
      vehicle.vehicles.map((item) => ({
        id: item.id,
        label: item.registration,
        active: item.active,
      })),
    );
  }, []);
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load fuel records.',
      ),
    );
  }, [load]);

  async function save(
    draft: Draft,
    editingId: string | null,
    confirmed: string[] = [],
  ) {
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/fuel-records', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          ...body(draft, confirmed),
        }),
      });
      setPending(null);
      setEditing(null);
      setMessage(editingId ? 'Fuel expense updated.' : 'Fuel expense added.');
      await load();
    } catch (caught) {
      const warnings =
        caught instanceof ApiError &&
        caught.status === 409 &&
        Array.isArray(caught.body?.warnings)
          ? (caught.body.warnings as Warning[])
          : null;
      if (warnings) {
        setPending({ draft, editingId, warnings });
        return;
      }
      const failure =
        caught instanceof Error
          ? caught
          : new Error('Unable to save fuel expense.');
      setError(failure.message);
      throw failure;
    }
  }

  return (
    <section aria-labelledby="fuel-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Expenses</span>
          <h1 id="fuel-heading">Fuel records</h1>
          <p>
            Keep receipt totals and optional pump details together. Warnings
            flag incomplete or inconsistent evidence without blocking a
            deliberate save.
          </p>
        </div>
      </div>
      {!canManage ? (
        <p className="notice">
          Accountants can review fuel records. Only the owner can change them.
        </p>
      ) : null}
      {pending ? (
        <section
          className="panel warning-panel"
          aria-labelledby="fuel-warning-heading"
        >
          <h2 id="fuel-warning-heading">Check before saving</h2>
          <ul>
            {pending.warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPending(null)}
            >
              Go back
            </button>
            <button
              type="button"
              onClick={() =>
                void save(
                  pending.draft,
                  pending.editingId,
                  pending.warnings.map(({ code }) => code),
                )
              }
            >
              Save anyway
            </button>
          </div>
        </section>
      ) : null}
      {canManage ? (
        <section className="panel">
          <h2>Add fuel expense</h2>
          <FuelForm
            key={records.length}
            initial={emptyDraft()}
            activities={activities}
            vehicles={vehicles}
            submitLabel="Add fuel expense"
            onSubmit={(draft) => save(draft, null)}
          />
        </section>
      ) : null}
      {message ? (
        <p role="status" className="notice success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : null}
      <section>
        <h2>Fuel history</h2>
        {records.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No fuel records yet</h3>
              <p>Add a receipt to start the fuel evidence trail.</p>
            </div>
          </div>
        ) : (
          <div className="session-list">
            {records.map((record) => (
              <article className="session-card" key={record.id}>
                {editing?.id === record.id ? (
                  <FuelForm
                    initial={fromRecord(record)}
                    activities={activities}
                    vehicles={vehicles}
                    submitLabel="Save changes"
                    onSubmit={(draft) => save(draft, record.id)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <div className="record-summary">
                      <div>
                        <h3>{record.merchantName}</h3>
                        <p>
                          {new Date(record.purchaseDatetime).toLocaleString(
                            'en-NZ',
                          )}{' '}
                          · {record.vehicleRegistration}
                        </p>
                      </div>
                      <strong>
                        {money(record.totalAmountMinor, record.currency)}
                      </strong>
                    </div>
                    <dl className="session-details">
                      <div>
                        <dt>Fill</dt>
                        <dd>{record.fillType.toLowerCase()}</dd>
                      </div>
                      <div>
                        <dt>Litres</dt>
                        <dd>{record.fuelLitres ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Price/litre</dt>
                        <dd>
                          {record.fuelPriceMicrosPerLitre === null
                            ? '—'
                            : money(
                                Math.round(
                                  record.fuelPriceMicrosPerLitre / 10_000,
                                ),
                                record.currency,
                              )}
                        </dd>
                      </div>
                      <div>
                        <dt>Activity</dt>
                        <dd>{record.activityName ?? 'Unallocated'}</dd>
                      </div>
                    </dl>
                    {canManage ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setEditing(record)}
                      >
                        Edit fuel expense
                      </button>
                    ) : null}
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
