import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import {
  localDateTime,
  type ReferenceOption,
} from '../features/expenses/expenseModel';

interface Allocation {
  method: string;
  percentageBasisPoints: number | null;
  allocatedAmountMinor: number | null;
  calculationPeriodStart: string | null;
  calculationPeriodEnd: string | null;
  notes: string | null;
  reviewerEmail: string | null;
}
interface InsuranceRecord {
  id: string;
  businessActivityId: string | null;
  activityName: string | null;
  provider: string;
  purchaseDatetime: string;
  premiumMinor: number;
  currency: string;
  gstAmountMinor: number | null;
  gstStatus: string;
  description: string | null;
  recurrenceType: string;
  insuranceType: string;
  policyNumber: string | null;
  policyPeriodStart: string;
  policyPeriodEnd: string;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  allocation: Allocation;
}
interface Draft {
  insuranceType: string;
  businessActivityId: string;
  vehicleId: string;
  provider: string;
  policyNumber: string;
  policyPeriodStart: string;
  policyPeriodEnd: string;
  purchaseDatetime: string;
  totalAmount: string;
  currency: string;
  gstAmount: string;
  gstStatus: string;
  description: string;
  recurrenceType: string;
  allocationMethod: string;
  allocationPercentage: string;
  allocatedAmount: string;
  calculationPeriodStart: string;
  calculationPeriodEnd: string;
  allocationNotes: string;
}
const today = () => new Date().toISOString().slice(0, 10);
function emptyDraft(): Draft {
  return {
    insuranceType: 'PROFESSIONAL_LIABILITY',
    businessActivityId: '',
    vehicleId: '',
    provider: '',
    policyNumber: '',
    policyPeriodStart: today(),
    policyPeriodEnd: today(),
    purchaseDatetime: localDateTime(),
    totalAmount: '',
    currency: 'NZD',
    gstAmount: '',
    gstStatus: 'UNKNOWN',
    description: '',
    recurrenceType: 'ONE_OFF',
    allocationMethod: 'UNDETERMINED',
    allocationPercentage: '',
    allocatedAmount: '',
    calculationPeriodStart: '',
    calculationPeriodEnd: '',
    allocationNotes: '',
  };
}
function fromRecord(record: InsuranceRecord): Draft {
  return {
    insuranceType: record.insuranceType,
    businessActivityId: record.businessActivityId ?? '',
    vehicleId: record.vehicleId ?? '',
    provider: record.provider,
    policyNumber: record.policyNumber ?? '',
    policyPeriodStart: record.policyPeriodStart,
    policyPeriodEnd: record.policyPeriodEnd,
    purchaseDatetime: localDateTime(record.purchaseDatetime),
    totalAmount: (record.premiumMinor / 100).toFixed(2),
    currency: record.currency,
    gstAmount:
      record.gstAmountMinor === null
        ? ''
        : (record.gstAmountMinor / 100).toFixed(2),
    gstStatus: record.gstStatus,
    description: record.description ?? '',
    recurrenceType: record.recurrenceType,
    allocationMethod: record.allocation.method,
    allocationPercentage:
      record.allocation.percentageBasisPoints === null
        ? ''
        : String(record.allocation.percentageBasisPoints / 100),
    allocatedAmount:
      record.allocation.allocatedAmountMinor === null
        ? ''
        : (record.allocation.allocatedAmountMinor / 100).toFixed(2),
    calculationPeriodStart: record.allocation.calculationPeriodStart ?? '',
    calculationPeriodEnd: record.allocation.calculationPeriodEnd ?? '',
    allocationNotes: record.allocation.notes ?? '',
  };
}
function requestBody(draft: Draft) {
  return {
    ...draft,
    purchaseDatetime: new Date(draft.purchaseDatetime).toISOString(),
  };
}
function money(minor: number | null, currency: string) {
  return minor === null
    ? '—'
    : new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(
        minor / 100,
      );
}
function methodLabel(method: string) {
  return (
    (
      {
        '100_PERCENT_BUSINESS': '100% business',
        MANUAL_PERCENTAGE: 'Manual percentage',
        BUSINESS_KM_OVER_TOTAL_KM: 'Business km ÷ total km',
        ACCOUNTANT_ADJUSTMENT: 'Accountant adjustment',
        UNDETERMINED: 'Undetermined',
      } as Record<string, string>
    )[method] ?? method
  );
}

function InsuranceForm({
  initial,
  activities,
  vehicles,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  activities: ReferenceOption[];
  vehicles: ReferenceOption[];
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
    } catch {
      /* parent */
    } finally {
      setSaving(false);
    }
  }
  const needsPercentage = [
    'MANUAL_PERCENTAGE',
    'BUSINESS_KM_OVER_TOTAL_KM',
  ].includes(draft.allocationMethod);
  return (
    <form
      className="work-session-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="form-pair">
        <label>
          Insurance type
          <select value={draft.insuranceType} onChange={field('insuranceType')}>
            <option value="PROFESSIONAL_LIABILITY">
              Professional / liability
            </option>
            <option value="VEHICLE">Vehicle</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          Provider
          <input
            required
            maxLength={200}
            value={draft.provider}
            onChange={field('provider')}
          />
        </label>
      </div>
      <div className="form-pair">
        <label>
          Business activity{' '}
          {draft.insuranceType === 'PROFESSIONAL_LIABILITY' ? '' : '(optional)'}
          <select
            required={draft.insuranceType === 'PROFESSIONAL_LIABILITY'}
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
        </label>
        <label>
          Vehicle {draft.insuranceType === 'VEHICLE' ? '' : '(optional)'}
          <select
            required={draft.insuranceType === 'VEHICLE'}
            value={draft.vehicleId}
            onChange={field('vehicleId')}
          >
            <option value="">No vehicle</option>
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
        </label>
      </div>
      <div className="form-pair">
        <label>
          Policy period start
          <input
            required
            type="date"
            value={draft.policyPeriodStart}
            onChange={field('policyPeriodStart')}
          />
        </label>
        <label>
          Policy period end
          <input
            required
            type="date"
            value={draft.policyPeriodEnd}
            onChange={field('policyPeriodEnd')}
          />
        </label>
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
          Policy number (optional)
          <input
            maxLength={200}
            value={draft.policyNumber}
            onChange={field('policyNumber')}
          />
        </label>
      </div>
      <div className="form-pair">
        <label>
          Full premium
          <input
            required
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            value={draft.totalAmount}
            onChange={field('totalAmount')}
          />
        </label>
        <label>
          GST amount (optional)
          <input
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            value={draft.gstAmount}
            onChange={field('gstAmount')}
          />
        </label>
      </div>
      <div className="form-pair">
        <label>
          GST status
          <select value={draft.gstStatus} onChange={field('gstStatus')}>
            <option value="UNKNOWN">Unknown</option>
            <option value="GST_INCLUDED">GST included</option>
            <option value="NO_GST">No GST</option>
            <option value="REVIEW_REQUIRED">Review required</option>
          </select>
        </label>
        <label>
          Recurrence
          <select
            value={draft.recurrenceType}
            onChange={field('recurrenceType')}
          >
            <option value="ONE_OFF">One-off</option>
            <option value="RECURRING">Recurring</option>
          </select>
        </label>
      </div>
      <label>
        Allocation method
        <select
          value={draft.allocationMethod}
          onChange={field('allocationMethod')}
        >
          <option value="UNDETERMINED">Undetermined</option>
          <option value="100_PERCENT_BUSINESS">100% business</option>
          <option value="MANUAL_PERCENTAGE">Manual percentage</option>
          <option value="BUSINESS_KM_OVER_TOTAL_KM">
            Business km ÷ total km
          </option>
          {draft.allocationMethod === 'ACCOUNTANT_ADJUSTMENT' ? (
            <option value="ACCOUNTANT_ADJUSTMENT">
              Accountant adjustment (current)
            </option>
          ) : null}
        </select>
      </label>
      {needsPercentage ? (
        <label>
          Business allocation percentage
          <input
            required
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={draft.allocationPercentage}
            onChange={field('allocationPercentage')}
          />
        </label>
      ) : null}
      {draft.allocationMethod === 'BUSINESS_KM_OVER_TOTAL_KM' ? (
        <div className="form-pair">
          <label>
            Calculation period start
            <input
              required
              type="date"
              value={draft.calculationPeriodStart}
              onChange={field('calculationPeriodStart')}
            />
          </label>
          <label>
            Calculation period end
            <input
              required
              type="date"
              value={draft.calculationPeriodEnd}
              onChange={field('calculationPeriodEnd')}
            />
          </label>
        </div>
      ) : null}
      <label>
        Allocation notes (optional)
        <textarea
          maxLength={2000}
          value={draft.allocationNotes}
          onChange={field('allocationNotes')}
        />
      </label>
      <label>
        Insurance notes (optional)
        <textarea
          maxLength={2000}
          value={draft.description}
          onChange={field('description')}
        />
      </label>
      <p className="notice">
        Allocations are record-keeping estimates and are not presented as final
        tax treatment.
      </p>
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

function AdjustmentForm({
  record,
  onSubmit,
  onCancel,
}: {
  record: InsuranceRecord;
  onSubmit: (
    amount: string,
    notes: string,
    periodStart: string,
    periodEnd: string,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(
    record.allocation.allocatedAmountMinor === null
      ? ''
      : (record.allocation.allocatedAmountMinor / 100).toFixed(2),
  );
  const [notes, setNotes] = useState(record.allocation.notes ?? '');
  const [periodStart, setPeriodStart] = useState(
    record.allocation.calculationPeriodStart ?? '',
  );
  const [periodEnd, setPeriodEnd] = useState(
    record.allocation.calculationPeriodEnd ?? '',
  );
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(amount, notes, periodStart, periodEnd);
    } catch {
      /* parent */
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="reference-form" onSubmit={(event) => void submit(event)}>
      <h4>Accountant allocation adjustment</h4>
      <p>
        Adjust the business amount while preserving the full premium and prior
        calculation in audit history.
      </p>
      <label>
        Allocated business amount
        <input
          required
          inputMode="decimal"
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
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
          />
        </label>
      </div>
      <div className="button-row">
        <button disabled={saving}>
          {saving ? 'Saving…' : 'Save adjustment'}
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function InsurancePage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const [records, setRecords] = useState<InsuranceRecord[]>([]);
  const [activities, setActivities] = useState<ReferenceOption[]>([]);
  const [vehicles, setVehicles] = useState<ReferenceOption[]>([]);
  const [editing, setEditing] = useState<InsuranceRecord | null>(null);
  const [adjusting, setAdjusting] = useState<InsuranceRecord | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [insurance, activity, vehicle] = await Promise.all([
      apiRequest<{ insuranceRecords: InsuranceRecord[] }>(
        '/api/insurance-records',
      ),
      apiRequest<{
        activities: Array<{ id: string; name: string; active: boolean }>;
      }>('/api/business-activities'),
      apiRequest<{
        vehicles: Array<{ id: string; registration: string; active: boolean }>;
      }>('/api/vehicles'),
    ]);
    setRecords(insurance.insuranceRecords);
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
        caught instanceof Error ? caught.message : 'Unable to load insurance.',
      ),
    );
  }, [load]);
  async function save(draft: Draft, id?: string) {
    setError('');
    try {
      await apiRequest('/api/insurance-records', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...(id ? { id } : {}), ...requestBody(draft) }),
      });
      setEditing(null);
      setMessage(id ? 'Insurance updated.' : 'Insurance added.');
      await load();
    } catch (caught) {
      const failure =
        caught instanceof Error
          ? caught
          : new Error('Unable to save insurance.');
      setError(failure.message);
      throw failure;
    }
  }
  async function adjust(
    record: InsuranceRecord,
    amount: string,
    notes: string,
    calculationPeriodStart: string,
    calculationPeriodEnd: string,
  ) {
    setError('');
    try {
      await apiRequest('/api/insurance-allocations', {
        method: 'PATCH',
        body: JSON.stringify({
          expenseId: record.id,
          allocatedAmount: amount,
          allocationNotes: notes,
          calculationPeriodStart,
          calculationPeriodEnd,
        }),
      });
      setAdjusting(null);
      setMessage('Allocation adjustment recorded with reviewer attribution.');
      await load();
    } catch (caught) {
      const failure =
        caught instanceof Error
          ? caught
          : new Error('Unable to adjust allocation.');
      setError(failure.message);
      throw failure;
    }
  }
  return (
    <section aria-labelledby="insurance-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Expenses</span>
          <h1 id="insurance-heading">Insurance and allocations</h1>
          <p>
            Keep the full premium separate from the estimated business
            allocation. These records do not determine final tax treatment.
          </p>
        </div>
      </div>
      {!isOwner ? (
        <p className="notice">
          Accountants can review insurance and record attributed allocation
          adjustments. Only the owner can change the source policy or premium.
        </p>
      ) : null}
      {isOwner ? (
        <section className="panel">
          <h2>Add insurance</h2>
          <InsuranceForm
            key={records.length}
            initial={emptyDraft()}
            activities={activities}
            vehicles={vehicles}
            submitLabel="Add insurance"
            onSubmit={(draft) => save(draft)}
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
        <h2>Insurance history</h2>
        {records.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No insurance records yet</h3>
              <p>Policy premiums and allocations will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="session-list">
            {records.map((record) => (
              <article className="session-card" key={record.id}>
                {editing?.id === record.id ? (
                  <InsuranceForm
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
                        <h3>{record.provider}</h3>
                        <p>
                          {record.insuranceType
                            .replaceAll('_', ' ')
                            .toLowerCase()}{' '}
                          · {record.policyPeriodStart} to{' '}
                          {record.policyPeriodEnd}
                        </p>
                      </div>
                      <strong>
                        {money(record.premiumMinor, record.currency)}
                      </strong>
                    </div>
                    <dl className="session-details">
                      <div>
                        <dt>Full premium</dt>
                        <dd>{money(record.premiumMinor, record.currency)}</dd>
                      </div>
                      <div>
                        <dt>Business allocation</dt>
                        <dd>
                          {money(
                            record.allocation.allocatedAmountMinor,
                            record.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Method</dt>
                        <dd>{methodLabel(record.allocation.method)}</dd>
                      </div>
                      <div>
                        <dt>Percentage</dt>
                        <dd>
                          {record.allocation.percentageBasisPoints === null
                            ? '—'
                            : `${(record.allocation.percentageBasisPoints / 100).toFixed(2)}%`}
                        </dd>
                      </div>
                      <div>
                        <dt>Activity</dt>
                        <dd>{record.activityName ?? 'Unallocated'}</dd>
                      </div>
                      <div>
                        <dt>Vehicle</dt>
                        <dd>{record.vehicleRegistration ?? '—'}</dd>
                      </div>
                    </dl>
                    {record.allocation.reviewerEmail ? (
                      <p>Last adjusted by {record.allocation.reviewerEmail}.</p>
                    ) : null}
                    <p className="record-dates">
                      Allocated values are estimates, not final accounting or
                      tax treatment.
                    </p>
                    <div className="button-row">
                      {isOwner ? (
                        <button
                          className="secondary-button"
                          onClick={() => setEditing(record)}
                        >
                          Edit policy
                        </button>
                      ) : null}
                      {!isOwner ? (
                        <button
                          className="secondary-button"
                          onClick={() =>
                            setAdjusting(
                              adjusting?.id === record.id ? null : record,
                            )
                          }
                        >
                          Adjust allocation
                        </button>
                      ) : null}
                    </div>
                    {adjusting?.id === record.id ? (
                      <AdjustmentForm
                        record={record}
                        onSubmit={(amount, notes, periodStart, periodEnd) =>
                          adjust(record, amount, notes, periodStart, periodEnd)
                        }
                        onCancel={() => setAdjusting(null)}
                      />
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
