import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AttachmentPanel } from '../features/attachments/AttachmentPanel';
import { apiRequest, useAuth } from '../features/auth/AuthContext';

type RecordType = 'EXPENSE' | 'INCOME';
interface Transaction {
  id: string;
  recordType: RecordType;
  subtype: string;
  transactionDate: string;
  businessActivityId: string | null;
  activityName: string | null;
  counterparty: string;
  totalAmountMinor: number;
  currency: string;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  reviewedBy: string | null;
  reviewerEmail: string | null;
  reviewedAt: string | null;
  attachmentCount: number;
}
interface Reference {
  id: string;
  name: string;
  active: boolean;
}
interface SavedFilter {
  id: string;
  name: string;
  filterType: 'TRANSACTIONS' | 'RECEIPTS';
  criteria: Filters;
}
interface Comment {
  id: string;
  message: string;
  createdAt: string;
  authorEmail: string;
  authorRole: string;
}
interface Filters {
  q: string;
  dateFrom: string;
  dateTo: string;
  taxYear: string;
  activityId: string;
  direction: string;
  subtype: string;
  categoryId: string;
  status: string;
  vehicleId: string;
  amountMin: string;
  amountMax: string;
  attachment: string;
  review: string;
}
const emptyFilters: Filters = {
  q: '',
  dateFrom: '',
  dateTo: '',
  taxYear: '',
  activityId: '',
  direction: '',
  subtype: '',
  categoryId: '',
  status: '',
  vehicleId: '',
  amountMin: '',
  amountMax: '',
  attachment: '',
  review: '',
};
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(
    minor / 100,
  );
const statusLabel = (status: string) =>
  status.replaceAll('_', ' ').toLowerCase();

function ReviewPanel({
  record,
  role,
  onChanged,
}: {
  record: Transaction;
  role: 'OWNER' | 'ACCOUNTANT';
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [comments, setComments] = useState<Comment[]>([]),
    [message, setMessage] = useState(''),
    [status, setStatus] = useState(record.status),
    [error, setError] = useState('');
  const loadComments = useCallback(async () => {
    const result = await apiRequest<{ comments: Comment[] }>(
      `/api/comments?recordType=${record.recordType}&recordId=${encodeURIComponent(record.id)}`,
    );
    setComments(result.comments);
  }, [record.id, record.recordType]);
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        await loadComments();
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Unable to load comments.',
        );
      }
    }
  }
  async function addComment(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiRequest('/api/comments', {
        method: 'POST',
        body: JSON.stringify({
          recordType: record.recordType,
          recordId: record.id,
          message,
        }),
      });
      setMessage('');
      await loadComments();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to add comment.',
      );
    }
  }
  async function updateStatus() {
    setError('');
    try {
      await apiRequest('/api/record-status', {
        method: 'PATCH',
        body: JSON.stringify({
          recordType: record.recordType,
          recordId: record.id,
          status,
        }),
      });
      await onChanged();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to update status.',
      );
    }
  }
  const statuses =
    role === 'OWNER'
      ? ['NEW', 'MISSING_INFORMATION', 'READY_FOR_REVIEW', 'VOIDED']
      : [
          'MISSING_INFORMATION',
          'READY_FOR_REVIEW',
          ...(record.status === 'READY_FOR_REVIEW' ? ['REVIEWED'] : []),
          ...(record.status === 'REVIEWED' ? ['PROCESSED'] : []),
        ];
  return (
    <section className="review-panel">
      <button
        type="button"
        className="secondary-button"
        onClick={() => void toggle()}
      >
        {open ? 'Close review' : 'Review and comments'}
      </button>
      {open ? (
        <div className="review-content">
          {error ? (
            <p className="notice error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="inline-form">
            <label>
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {!statuses.includes(status) ? <option>{status}</option> : null}
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void updateStatus()}>
              Update status
            </button>
          </div>
          <div className="comment-thread">
            {comments.length ? (
              comments.map((comment) => (
                <article key={comment.id}>
                  <p>{comment.message}</p>
                  <small>
                    {comment.authorEmail} · {comment.authorRole.toLowerCase()} ·{' '}
                    {new Date(comment.createdAt).toLocaleString('en-NZ')}
                  </small>
                </article>
              ))
            ) : (
              <p>No comments yet.</p>
            )}
          </div>
          <form
            className="inline-form"
            onSubmit={(event) => void addComment(event)}
          >
            <label>
              Add comment
              <textarea
                required
                maxLength={4000}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            <button>Add comment</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export function TransactionsPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'TRANSACTIONS' | 'RECEIPTS'>('TRANSACTIONS');
  const [filters, setFilters] = useState<Filters>(emptyFilters),
    [records, setRecords] = useState<Transaction[]>([]),
    [activities, setActivities] = useState<Reference[]>([]),
    [categories, setCategories] = useState<Reference[]>([]),
    [vehicles, setVehicles] = useState<Reference[]>([]),
    [saved, setSaved] = useState<SavedFilter[]>([]),
    [filterName, setFilterName] = useState(''),
    [summary, setSummary] = useState({
      resultCount: 0,
      missingAttachmentCount: 0,
      unreviewedCount: 0,
    }),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const field =
    (key: keyof Filters) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFilters({ ...filters, [key]: event.target.value });
  const loadSaved = useCallback(async (filterMode: typeof mode) => {
    const result = await apiRequest<{ savedFilters: SavedFilter[] }>(
      `/api/saved-filters?filterType=${filterMode}`,
    );
    setSaved(result.savedFilters);
  }, []);
  const search = useCallback(
    async (activeFilters: Filters, activeMode: typeof mode) => {
      const query = new URLSearchParams();
      for (const key of Object.keys(activeFilters) as Array<keyof Filters>) {
        const value = activeFilters[key];
        if (value) query.set(key, value);
      }
      const result = await apiRequest<{
        transactions: Transaction[];
        summary: typeof summary;
      }>(
        `/api/${activeMode === 'RECEIPTS' ? 'receipts' : 'transactions'}?${query}`,
      );
      setRecords(result.transactions);
      setSummary(result.summary);
    },
    [],
  );
  useEffect(() => {
    const load = async () => {
      const [activityResult, categoryResult, vehicleResult] = await Promise.all(
        [
          apiRequest<{ activities: Reference[] }>('/api/business-activities'),
          apiRequest<{ categories: Reference[] }>('/api/expense-categories'),
          apiRequest<{
            vehicles: Array<{
              id: string;
              registration: string;
              active: boolean;
            }>;
          }>('/api/vehicles'),
        ],
      );
      setActivities(activityResult.activities);
      setCategories(categoryResult.categories);
      setVehicles(
        vehicleResult.vehicles.map((item) => ({
          id: item.id,
          name: item.registration,
          active: item.active,
        })),
      );
      await Promise.all([
        search(emptyFilters, 'TRANSACTIONS'),
        loadSaved('TRANSACTIONS'),
      ]);
    };
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load transactions.',
      ),
    );
  }, [loadSaved, search]);
  async function changeMode(next: typeof mode) {
    setMode(next);
    setFilters(emptyFilters);
    setError('');
    await Promise.all([search(emptyFilters, next), loadSaved(next)]);
  }
  async function saveFilter(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiRequest('/api/saved-filters', {
        method: 'POST',
        body: JSON.stringify({
          name: filterName,
          filterType: mode,
          criteria: filters,
        }),
      });
      setFilterName('');
      setMessage('Filter saved.');
      await loadSaved(mode);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to save filter.',
      );
    }
  }
  async function removeFilter(id: string) {
    await apiRequest('/api/saved-filters', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await loadSaved(mode);
  }
  async function applyFilter(item: SavedFilter) {
    setFilters({ ...emptyFilters, ...item.criteria });
    await search({ ...emptyFilters, ...item.criteria }, mode);
  }
  async function moveToTrash(record: Transaction) {
    if (
      !window.confirm(
        'Move this record to trash? It can be restored during retention.',
      )
    )
      return;
    setError('');
    try {
      await apiRequest('/api/trash', {
        method: 'POST',
        body: JSON.stringify({
          recordType: record.recordType,
          recordId: record.id,
        }),
      });
      setMessage('Record moved to trash.');
      await search(filters, mode);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to move record to trash.',
      );
    }
  }
  return (
    <section aria-labelledby="transactions-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Find and review</span>
          <h1 id="transactions-heading">Transactions and receipts</h1>
          <p>
            Search income and expenses, find missing evidence, and preserve the
            review conversation.
          </p>
        </div>
      </div>
      <div className="button-row" role="group" aria-label="Log type">
        <button
          type="button"
          className={mode === 'TRANSACTIONS' ? '' : 'secondary-button'}
          onClick={() => void changeMode('TRANSACTIONS')}
        >
          Transaction log
        </button>
        <button
          type="button"
          className={mode === 'RECEIPTS' ? '' : 'secondary-button'}
          onClick={() => void changeMode('RECEIPTS')}
        >
          Receipt log
        </button>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="notice success" role="status">
          {message}
        </p>
      ) : null}
      <section className="panel">
        <h2>Filters</h2>
        <form
          className="work-session-form"
          onSubmit={(event) => {
            event.preventDefault();
            void search(filters, mode);
          }}
        >
          <div className="form-pair">
            <label>
              Search merchant, client, or type
              <input value={filters.q} onChange={field('q')} />
            </label>
            <label>
              Tax year ending
              <select value={filters.taxYear} onChange={field('taxYear')}>
                <option value="">Any tax year</option>
                {[2025, 2026, 2027, 2028].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-pair">
            <label>
              From
              <input
                type="date"
                value={filters.dateFrom}
                onChange={field('dateFrom')}
                disabled={Boolean(filters.taxYear)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.dateTo}
                onChange={field('dateTo')}
                disabled={Boolean(filters.taxYear)}
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Activity
              <select value={filters.activityId} onChange={field('activityId')}>
                <option value="">All activities</option>
                {activities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Income or expense
              <select value={filters.direction} onChange={field('direction')}>
                <option value="">Both</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
              </select>
            </label>
          </div>
          <div className="form-pair">
            <label>
              Record type
              <select value={filters.subtype} onChange={field('subtype')}>
                <option value="">All types</option>
                {[
                  'PLATFORM',
                  'CONTRACT',
                  'SUBSCRIPTION',
                  'GENERAL',
                  'FUEL',
                  'PARKING',
                  'INSURANCE',
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Expense category
              <select value={filters.categoryId} onChange={field('categoryId')}>
                <option value="">All categories</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-pair">
            <label>
              Status
              <select value={filters.status} onChange={field('status')}>
                <option value="">All statuses</option>
                {[
                  'NEW',
                  'MISSING_INFORMATION',
                  'READY_FOR_REVIEW',
                  'REVIEWED',
                  'PROCESSED',
                  'VOIDED',
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Vehicle
              <select value={filters.vehicleId} onChange={field('vehicleId')}>
                <option value="">All vehicles</option>
                {vehicles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-pair">
            <label>
              Minimum amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.amountMin}
                onChange={field('amountMin')}
              />
            </label>
            <label>
              Maximum amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.amountMax}
                onChange={field('amountMax')}
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Attachment
              <select value={filters.attachment} onChange={field('attachment')}>
                <option value="">Present or missing</option>
                <option value="PRESENT">Present</option>
                <option value="MISSING">Missing</option>
              </select>
            </label>
            <label>
              Review state
              <select value={filters.review} onChange={field('review')}>
                <option value="">Reviewed or not</option>
                <option value="REVIEWED">Reviewed</option>
                <option value="UNREVIEWED">Unreviewed</option>
              </select>
            </label>
          </div>
          <div className="button-row">
            <button>Search</button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setFilters(emptyFilters);
                void search(emptyFilters, mode);
              }}
            >
              Clear
            </button>
          </div>
        </form>
        <form
          className="inline-form saved-filter-form"
          onSubmit={(event) => void saveFilter(event)}
        >
          <label>
            Save current filters
            <input
              required
              maxLength={100}
              placeholder="e.g. Missing delivery receipts"
              value={filterName}
              onChange={(event) => setFilterName(event.target.value)}
            />
          </label>
          <button>Save filter</button>
        </form>
        <div className="saved-filter-list">
          {saved.map((item) => (
            <div key={item.id}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void applyFilter(item)}
              >
                {item.name}
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => void removeFilter(item.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
      <div className="metric-grid">
        <article className="metric-card">
          <span>Results</span>
          <strong>{summary.resultCount}</strong>
        </article>
        <article className="metric-card">
          <span>Missing attachments</span>
          <strong>{summary.missingAttachmentCount}</strong>
        </article>
        <article className="metric-card">
          <span>Unreviewed</span>
          <strong>{summary.unreviewedCount}</strong>
        </article>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{mode === 'RECEIPTS' ? 'Receipt log' : 'Transaction log'}</h2>
            <p>Up to 500 matching records, newest first.</p>
          </div>
          <span className="count-badge">{records.length}</span>
        </div>
        <div className="record-list">
          {records.map((record) => (
            <article
              className="record-card"
              key={`${record.recordType}-${record.id}`}
            >
              <div className="record-summary">
                <div>
                  <span className="eyebrow">
                    {record.recordType} · {record.subtype}
                  </span>
                  <h3>{record.counterparty}</h3>
                  <p>
                    {record.transactionDate} ·{' '}
                    {record.activityName ?? 'Unallocated'}
                    {record.categoryName ? ` · ${record.categoryName}` : ''}
                    {record.vehicleRegistration
                      ? ` · ${record.vehicleRegistration}`
                      : ''}
                  </p>
                </div>
                <strong>
                  {money(record.totalAmountMinor, record.currency)}
                </strong>
              </div>
              <div className="button-row">
                <span className={`status-badge ${record.status.toLowerCase()}`}>
                  {statusLabel(record.status)}
                </span>
                <span>
                  {record.attachmentCount} document
                  {record.attachmentCount === 1 ? '' : 's'}
                </span>
                {record.reviewerEmail ? (
                  <span>Reviewed by {record.reviewerEmail}</span>
                ) : null}
              </div>
              <ReviewPanel
                record={record}
                role={user?.role ?? 'ACCOUNTANT'}
                onChanged={() => search(filters, mode)}
              />
              {user?.role === 'OWNER' ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void moveToTrash(record)}
                >
                  Move to trash
                </button>
              ) : null}
              {mode === 'RECEIPTS' ? (
                <AttachmentPanel
                  recordType={record.recordType}
                  recordId={record.id}
                  canManage={user?.role === 'OWNER'}
                />
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
