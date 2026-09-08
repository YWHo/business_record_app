import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { AttachmentPanel } from '../features/attachments/AttachmentPanel';

type IncomeType = 'PLATFORM' | 'CONTRACT' | 'SUBSCRIPTION' | 'GENERAL';
interface Reference {
  id: string;
  name: string;
  active: boolean;
}
interface Reconciliation {
  expectedAmountMinor: number;
  actualAmountMinor: number;
  differenceAmountMinor: number;
  matched: boolean;
  notes: string | null;
  reconcilerEmail: string;
}
interface Details {
  [key: string]: string | number | null;
}
interface IncomeRecord {
  id: string;
  businessActivityId: string;
  activityName: string;
  incomeType: IncomeType;
  receivedFrom: string | null;
  transactionDate: string;
  totalAmountMinor: number;
  currency: string;
  notes: string | null;
  details: Details | null;
  reconciliation: Reconciliation | null;
}
interface Draft {
  incomeType: IncomeType;
  businessActivityId: string;
  currency: string;
  notes: string;
  receivedFrom: string;
  transactionDate: string;
  totalAmount: string;
  providerName: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  grossEarnings: string;
  tips: string;
  bonusesPromotions: string;
  flatRateCredit: string;
  platformFees: string;
  otherAdjustments: string;
  netPaymentReceived: string;
  clientId: string;
  invoiceNumber: string;
  invoiceDate: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  subtotal: string;
  gstAmount: string;
  total: string;
  dueDate: string;
  paymentReceivedDate: string;
  amountReceived: string;
  paymentStatus: string;
  grossSubscriptionRevenue: string;
  refunds: string;
  paymentProcessingFees: string;
  subscriberCount: string;
  newSubscribers: string;
  cancelledSubscribers: string;
}
const today = () => new Date().toISOString().slice(0, 10);
const amount = (minor: unknown) =>
  typeof minor === 'number' ? (minor / 100).toFixed(2) : '';
function emptyDraft(): Draft {
  const date = today();
  return {
    incomeType: 'PLATFORM',
    businessActivityId: '',
    currency: 'NZD',
    notes: '',
    receivedFrom: '',
    transactionDate: date,
    totalAmount: '',
    providerName: '',
    periodStart: date,
    periodEnd: date,
    paymentDate: date,
    grossEarnings: '',
    tips: '0',
    bonusesPromotions: '0',
    flatRateCredit: '0',
    platformFees: '0',
    otherAdjustments: '0',
    netPaymentReceived: '',
    clientId: '',
    invoiceNumber: '',
    invoiceDate: date,
    servicePeriodStart: '',
    servicePeriodEnd: '',
    subtotal: '',
    gstAmount: '',
    total: '',
    dueDate: '',
    paymentReceivedDate: '',
    amountReceived: '',
    paymentStatus: 'DRAFT',
    grossSubscriptionRevenue: '',
    refunds: '0',
    paymentProcessingFees: '0',
    subscriberCount: '',
    newSubscribers: '',
    cancelledSubscribers: '',
  };
}
function fromRecord(record: IncomeRecord): Draft {
  const draft = emptyDraft(),
    details = record.details ?? {};
  return {
    ...draft,
    incomeType: record.incomeType,
    businessActivityId: record.businessActivityId,
    currency: record.currency,
    notes: record.notes ?? '',
    receivedFrom: record.receivedFrom ?? '',
    transactionDate: record.transactionDate,
    totalAmount: amount(record.totalAmountMinor),
    providerName: String(details.providerName ?? ''),
    periodStart: String(details.periodStart ?? draft.periodStart),
    periodEnd: String(details.periodEnd ?? draft.periodEnd),
    paymentDate: String(details.paymentDate ?? draft.paymentDate),
    grossEarnings: amount(details.grossEarningsMinor),
    tips: amount(details.tipsMinor),
    bonusesPromotions: amount(details.bonusesPromotionsMinor),
    flatRateCredit: amount(details.flatRateCreditMinor),
    platformFees: amount(details.platformFeesMinor),
    otherAdjustments: amount(details.otherAdjustmentsMinor),
    netPaymentReceived: amount(details.netPaymentReceivedMinor),
    clientId: String(details.clientId ?? ''),
    invoiceNumber: String(details.invoiceNumber ?? ''),
    invoiceDate: String(details.invoiceDate ?? draft.invoiceDate),
    servicePeriodStart: String(details.servicePeriodStart ?? ''),
    servicePeriodEnd: String(details.servicePeriodEnd ?? ''),
    subtotal: amount(details.subtotalMinor),
    gstAmount: amount(details.gstAmountMinor),
    total: amount(details.totalMinor),
    dueDate: String(details.dueDate ?? ''),
    paymentReceivedDate: String(details.paymentReceivedDate ?? ''),
    amountReceived: amount(details.amountReceivedMinor),
    paymentStatus: String(details.paymentStatus ?? 'DRAFT'),
    grossSubscriptionRevenue: amount(details.grossSubscriptionRevenueMinor),
    refunds: amount(details.refundsMinor),
    paymentProcessingFees: amount(details.paymentProcessingFeesMinor),
    subscriberCount: String(details.subscriberCount ?? ''),
    newSubscribers: String(details.newSubscribers ?? ''),
    cancelledSubscribers: String(details.cancelledSubscribers ?? ''),
  };
}
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(
    minor / 100,
  );
function IncomeForm({
  initial,
  activities,
  clients,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  activities: Reference[];
  clients: Reference[];
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [saving, setSaving] = useState(false);
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
    } finally {
      setSaving(false);
    }
  }
  const dates = (prefix = '') => (
    <div className="form-pair">
      <label>
        {prefix} start
        <input
          type="date"
          required
          value={draft.periodStart}
          onChange={field('periodStart')}
        />
      </label>
      <label>
        {prefix} end
        <input
          type="date"
          required
          value={draft.periodEnd}
          onChange={field('periodEnd')}
        />
      </label>
    </div>
  );
  return (
    <form
      className="work-session-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="form-pair">
        <label>
          Income type
          <select
            disabled={Boolean(onCancel)}
            value={draft.incomeType}
            onChange={field('incomeType')}
          >
            <option value="PLATFORM">Platform</option>
            <option value="CONTRACT">Contract invoice</option>
            <option value="SUBSCRIPTION">Subscription summary</option>
            <option value="GENERAL">General income</option>
          </select>
        </label>
        <label>
          Business activity
          <select
            required
            value={draft.businessActivityId}
            onChange={field('businessActivityId')}
          >
            <option value="">Select activity</option>
            {activities
              .filter(
                (item) => item.active || item.id === draft.businessActivityId,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.active ? '' : ' (inactive)'}
                </option>
              ))}
          </select>
        </label>
      </div>
      {draft.incomeType === 'PLATFORM' ? (
        <>
          <div className="form-pair">
            <label>
              Provider
              <input
                required
                maxLength={200}
                value={draft.providerName}
                onChange={field('providerName')}
              />
            </label>
            <label>
              Payment date
              <input
                type="date"
                required
                value={draft.paymentDate}
                onChange={field('paymentDate')}
              />
            </label>
          </div>
          {dates('Earning period')}
          <div className="form-pair">
            <label>
              Gross earnings
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={draft.grossEarnings}
                onChange={field('grossEarnings')}
              />
            </label>
            <label>
              Net payment received
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={draft.netPaymentReceived}
                onChange={field('netPaymentReceived')}
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Tips
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.tips}
                onChange={field('tips')}
              />
            </label>
            <label>
              Bonuses / promotions
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.bonusesPromotions}
                onChange={field('bonusesPromotions')}
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Flat-rate credit
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.flatRateCredit}
                onChange={field('flatRateCredit')}
              />
            </label>
            <label>
              Platform fees
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.platformFees}
                onChange={field('platformFees')}
              />
            </label>
          </div>
          <label>
            Other adjustments (signed)
            <input
              type="number"
              step="0.01"
              value={draft.otherAdjustments}
              onChange={field('otherAdjustments')}
            />
          </label>
        </>
      ) : null}
      {draft.incomeType === 'CONTRACT' ? (
        <>
          <div className="form-pair">
            <label>
              Client
              <select
                required
                value={draft.clientId}
                onChange={field('clientId')}
              >
                <option value="">Select client</option>
                {clients
                  .filter((item) => item.active || item.id === draft.clientId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.active ? '' : ' (inactive)'}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Invoice number
              <input
                required
                maxLength={100}
                value={draft.invoiceNumber}
                onChange={field('invoiceNumber')}
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Invoice date
              <input
                type="date"
                required
                value={draft.invoiceDate}
                onChange={field('invoiceDate')}
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                value={draft.dueDate}
                onChange={field('dueDate')}
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Service start
              <input
                type="date"
                value={draft.servicePeriodStart}
                onChange={field('servicePeriodStart')}
              />
            </label>
            <label>
              Service end
              <input
                type="date"
                value={draft.servicePeriodEnd}
                onChange={field('servicePeriodEnd')}
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Subtotal
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={draft.subtotal}
                onChange={field('subtotal')}
              />
            </label>
            <label>
              GST
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.gstAmount}
                onChange={field('gstAmount')}
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Invoice total
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={draft.total}
                onChange={field('total')}
              />
            </label>
            <label>
              Payment status
              <select
                value={draft.paymentStatus}
                onChange={field('paymentStatus')}
              >
                {[
                  'DRAFT',
                  'ISSUED',
                  'PARTIALLY_PAID',
                  'PAID',
                  'OVERDUE',
                  'VOID',
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-pair">
            <label>
              Received date
              <input
                type="date"
                value={draft.paymentReceivedDate}
                onChange={field('paymentReceivedDate')}
              />
            </label>
            <label>
              Amount received
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.amountReceived}
                onChange={field('amountReceived')}
              />
            </label>
          </div>
        </>
      ) : null}
      {draft.incomeType === 'SUBSCRIPTION' ? (
        <>
          {dates('Summary period')}
          <div className="form-pair">
            <label>
              Gross revenue
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={draft.grossSubscriptionRevenue}
                onChange={field('grossSubscriptionRevenue')}
              />
            </label>
            <label>
              Net payment received
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={draft.netPaymentReceived}
                onChange={field('netPaymentReceived')}
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Refunds
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.refunds}
                onChange={field('refunds')}
              />
            </label>
            <label>
              Platform fees
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.platformFees}
                onChange={field('platformFees')}
              />
            </label>
          </div>
          <label>
            Payment processing fees
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft.paymentProcessingFees}
              onChange={field('paymentProcessingFees')}
            />
          </label>
          <div className="form-pair">
            <label>
              Subscriber count
              <input
                type="number"
                min="0"
                value={draft.subscriberCount}
                onChange={field('subscriberCount')}
              />
            </label>
            <label>
              New subscribers
              <input
                type="number"
                min="0"
                value={draft.newSubscribers}
                onChange={field('newSubscribers')}
              />
            </label>
          </div>
          <label>
            Cancelled subscribers
            <input
              type="number"
              min="0"
              value={draft.cancelledSubscribers}
              onChange={field('cancelledSubscribers')}
            />
          </label>
        </>
      ) : null}
      {draft.incomeType === 'GENERAL' ? (
        <div className="form-pair">
          <label>
            Received from
            <input
              maxLength={200}
              value={draft.receivedFrom}
              onChange={field('receivedFrom')}
            />
          </label>
          <label>
            Transaction date
            <input
              type="date"
              required
              value={draft.transactionDate}
              onChange={field('transactionDate')}
            />
          </label>
          <label>
            Total amount
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={draft.totalAmount}
              onChange={field('totalAmount')}
            />
          </label>
        </div>
      ) : null}
      <div className="form-pair">
        <label>
          Currency
          <input
            required
            pattern="[A-Za-z]{3}"
            maxLength={3}
            value={draft.currency}
            onChange={field('currency')}
          />
        </label>
        <label>
          Notes
          <textarea
            maxLength={2000}
            value={draft.notes}
            onChange={field('notes')}
          />
        </label>
      </div>
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
function ReconcileForm({
  record,
  onSaved,
}: {
  record: IncomeRecord;
  onSaved: () => Promise<void>;
}) {
  const [expected, setExpected] = useState(amount(record.totalAmountMinor)),
    [actual, setActual] = useState(amount(record.totalAmountMinor)),
    [notes, setNotes] = useState(''),
    [open, setOpen] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await apiRequest('/api/income-reconciliations', {
      method: 'POST',
      body: JSON.stringify({
        incomeId: record.id,
        expectedAmount: expected,
        actualAmount: actual,
        notes,
      }),
    });
    setOpen(false);
    await onSaved();
  }
  if (!open)
    return (
      <button className="secondary-button" onClick={() => setOpen(true)}>
        Reconcile
      </button>
    );
  return (
    <form className="reference-form" onSubmit={(event) => void submit(event)}>
      <h4>Manual reconciliation</h4>
      <div className="form-pair">
        <label>
          Expected
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={expected}
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
            value={actual}
            onChange={(event) => setActual(event.target.value)}
          />
        </label>
      </div>
      <label>
        Notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="button-row">
        <button>Save reconciliation</button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
export function IncomePage() {
  const { user } = useAuth(),
    canManage = user?.role === 'OWNER';
  const [records, setRecords] = useState<IncomeRecord[]>([]),
    [activities, setActivities] = useState<Reference[]>([]),
    [clients, setClients] = useState<Reference[]>([]),
    [summary, setSummary] = useState<
      { currency: string; totalAmountMinor: number }[]
    >([]),
    [edit, setEdit] = useState<IncomeRecord | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const [income, activityResult, clientResult] = await Promise.all([
      apiRequest<{
        incomeRecords: IncomeRecord[];
        summary: {
          totalsByCurrency: { currency: string; totalAmountMinor: number }[];
        };
      }>('/api/income-records'),
      apiRequest<{ activities: Reference[] }>('/api/business-activities'),
      apiRequest<{ clients: Reference[] }>('/api/clients'),
    ]);
    setRecords(income.incomeRecords);
    setSummary(income.summary.totalsByCurrency);
    setActivities(activityResult.activities);
    setClients(clientResult.clients);
  }, []);
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load income.',
      ),
    );
  }, [load]);
  async function save(draft: Draft, id?: string) {
    setError('');
    try {
      await apiRequest('/api/income-records', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...draft, ...(id ? { id } : {}) }),
      });
      setEdit(null);
      setMessage(id ? 'Income record updated.' : 'Income record added.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to save income.',
      );
      throw caught;
    }
  }
  return (
    <section aria-labelledby="income-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Revenue evidence</span>
          <h1 id="income-heading">Income</h1>
          <p>
            Platform payouts, contract invoices, subscription summaries, and
            general income—with manual reconciliation.
          </p>
        </div>
      </div>
      {summary.length ? (
        <div className="metric-grid">
          {summary.map((item) => (
            <article className="metric-card" key={item.currency}>
              <span>Recorded value · {item.currency}</span>
              <strong>{money(item.totalAmountMinor, item.currency)}</strong>
            </article>
          ))}
        </div>
      ) : null}
      {!canManage ? (
        <p className="notice">
          Accountants can view and reconcile income. Only the owner can change
          source records.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="notice success">
          {message}
        </p>
      ) : null}
      {canManage ? (
        <section className="panel">
          <h2>Add income</h2>
          <IncomeForm
            initial={emptyDraft()}
            activities={activities}
            clients={clients}
            submitLabel="Add income"
            onSubmit={(draft) => save(draft)}
          />
        </section>
      ) : null}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Income records</h2>
            <p>
              Totals represent net payout for platform/subscription records and
              invoice value for contracts.
            </p>
          </div>
          <span className="count-badge">{records.length}</span>
        </div>
        <div className="record-list">
          {records.map((record) => (
            <article className="record-card" key={record.id}>
              {edit?.id === record.id ? (
                <IncomeForm
                  initial={fromRecord(record)}
                  activities={activities}
                  clients={clients}
                  submitLabel="Save changes"
                  onSubmit={(draft) => save(draft, record.id)}
                  onCancel={() => setEdit(null)}
                />
              ) : (
                <>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">
                        {record.incomeType.replace('_', ' ')}
                      </span>
                      <h3>
                        {record.incomeType === 'PLATFORM'
                          ? record.details?.providerName
                          : record.incomeType === 'CONTRACT'
                            ? `${record.details?.clientName} · ${record.details?.invoiceNumber}`
                            : record.incomeType === 'SUBSCRIPTION'
                              ? `${record.details?.periodStart} to ${record.details?.periodEnd}`
                              : record.receivedFrom || 'General income'}
                      </h3>
                      <p>
                        {record.activityName} · {record.transactionDate}
                      </p>
                    </div>
                    <strong>
                      {money(record.totalAmountMinor, record.currency)}
                    </strong>
                  </div>
                  {record.incomeType === 'PLATFORM' ? (
                    <p>
                      Gross{' '}
                      {money(
                        Number(record.details?.grossEarningsMinor),
                        record.currency,
                      )}{' '}
                      · Fees{' '}
                      {money(
                        Number(record.details?.platformFeesMinor),
                        record.currency,
                      )}{' '}
                      · Net{' '}
                      {money(
                        Number(record.details?.netPaymentReceivedMinor),
                        record.currency,
                      )}
                    </p>
                  ) : null}
                  {record.incomeType === 'CONTRACT' ? (
                    <p>
                      {record.details?.paymentStatus} · Received{' '}
                      {money(
                        Number(record.details?.amountReceivedMinor ?? 0),
                        record.currency,
                      )}{' '}
                      · Outstanding{' '}
                      {money(
                        Number(record.details?.outstandingAmountMinor),
                        record.currency,
                      )}
                    </p>
                  ) : null}
                  {record.incomeType === 'SUBSCRIPTION' ? (
                    <p>
                      Gross{' '}
                      {money(
                        Number(record.details?.grossSubscriptionRevenueMinor),
                        record.currency,
                      )}{' '}
                      · Refunds{' '}
                      {money(
                        Number(record.details?.refundsMinor),
                        record.currency,
                      )}{' '}
                      · Subscribers{' '}
                      {record.details?.subscriberCount ?? 'not recorded'}
                    </p>
                  ) : null}
                  {record.notes ? <p>{record.notes}</p> : null}
                  {record.reconciliation ? (
                    <p
                      className={`notice ${record.reconciliation.matched ? 'success' : 'error'}`}
                    >
                      {record.reconciliation.matched ? 'Matched' : 'Difference'}
                      :{' '}
                      {money(
                        record.reconciliation.differenceAmountMinor,
                        record.currency,
                      )}{' '}
                      · {record.reconciliation.reconcilerEmail}
                    </p>
                  ) : null}
                  <div className="button-row">
                    {canManage ? (
                      <button
                        className="secondary-button"
                        onClick={() => setEdit(record)}
                      >
                        Edit
                      </button>
                    ) : null}
                    <ReconcileForm record={record} onSaved={load} />
                  </div>
                </>
              )}
              <AttachmentPanel
                recordType="INCOME"
                recordId={record.id}
                canManage={canManage}
              />
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
