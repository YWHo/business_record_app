import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../features/auth/AuthContext';
import { FormError } from '../components/FormError';
interface AuditEvent {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  userEmail: string;
  changedFields: Record<string, unknown> | null;
}
interface AuditResult {
  auditEvents: AuditEvent[];
  page: { number: number; hasNext: boolean };
}
export function AuditTrailPage() {
  const { businessId } = useParams();
  return <AuditTrailView key={businessId ?? 'account'} />;
}
function AuditTrailView() {
  const { businessId } = useParams();
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    action: '',
  });
  const [applied, setApplied] = useState(filters);
  const [result, setResult] = useState<AuditResult>(),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);
  const load = useCallback(
    async (criteria: typeof filters, page: number) => {
      const request = ++latestRequest.current;
      setLoading(true);
      setError('');
      setResult(undefined);
      const query = new URLSearchParams({ page: String(page) });
      for (const [key, value] of Object.entries(criteria))
        if (value) query.set(key, value);
      if (businessId) query.set('businessId', businessId);
      try {
        const result = await apiRequest<AuditResult>(`/api/audit-log?${query}`);
        if (request === latestRequest.current) setResult(result);
      } catch (caught) {
        if (request === latestRequest.current)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load audit history.',
          );
      } finally {
        if (request === latestRequest.current) setLoading(false);
      }
    },
    [businessId],
  );
  useEffect(() => {
    // Synchronize the visible history with the selected business.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load({ dateFrom: '', dateTo: '', action: '' }, 1);
  }, [load]);
  function submit(event: FormEvent) {
    event.preventDefault();
    setApplied(filters);
    void load(filters, 1);
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Financial history</span>
          <h1>Audit trail</h1>
          <p>
            Read-only history for permitted records
            {businessId ? ' in this business' : ''}. Administrative events are
            excluded from auditor access.
          </p>
        </div>
      </div>
      <form className="panel inline-form" onSubmit={submit}>
        <label>
          Event date from (UTC)
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) =>
              setFilters({ ...filters, dateFrom: event.target.value })
            }
          />
        </label>
        <label>
          Event date to (UTC)
          <input
            type="date"
            min={filters.dateFrom || undefined}
            value={filters.dateTo}
            onChange={(event) =>
              setFilters({ ...filters, dateTo: event.target.value })
            }
          />
        </label>
        <label>
          Action
          <input
            value={filters.action}
            placeholder="e.g. EXPENSE_CREATED"
            onChange={(event) =>
              setFilters({ ...filters, action: event.target.value })
            }
          />
        </label>
        <button disabled={loading}>Filter history</button>
      </form>
      <FormError message={error} />
      {loading && <p role="status">Loading audit history…</p>}
      {result && (
        <section className="panel">
          <h2>Audit events</h2>
          {result.auditEvents.length === 0 && (
            <p>No events match these filters within your access.</p>
          )}
          {result.auditEvents.map((event) => (
            <article key={event.id}>
              <h3>{event.action.replaceAll('_', ' ')}</h3>
              <p>{event.summary}</p>
              <p>
                <time dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString('en-NZ')}
                </time>{' '}
                · {event.userEmail}
              </p>
              {event.changedFields && (
                <details>
                  <summary>View recorded changes</summary>
                  <pre className="audit-evidence">
                    {JSON.stringify(event.changedFields, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          ))}
          <div className="button-row">
            <button
              type="button"
              disabled={loading || result.page.number <= 1}
              onClick={() => void load(applied, result.page.number - 1)}
            >
              Previous events
            </button>
            <span>Page {result.page.number}</span>
            <button
              type="button"
              disabled={loading || !result.page.hasNext}
              onClick={() => void load(applied, result.page.number + 1)}
            >
              Next events
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
