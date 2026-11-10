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
interface Summary {
  rows: {
    family: string;
    subtype: string;
    currency: string;
    record_count: number;
    recorded_total_minor: number;
  }[];
  note: string;
}
export function ReadOnlyReportsPage() {
  const { businessId } = useParams();
  return <ReportView key={businessId ?? 'account'} />;
}
function ReportView() {
  const { businessId } = useParams();
  const [scope, setScope] = useState('FULL'),
    [month, setMonth] = useState(''),
    [taxYear, setTaxYear] = useState('');
  const [result, setResult] = useState<Summary>(),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);
  const load = useCallback(
    async (query: URLSearchParams) => {
      const request = ++latestRequest.current;
      setLoading(true);
      setError('');
      setResult(undefined);
      if (businessId) query.set('businessId', businessId);
      try {
        const result = await apiRequest<Summary>(
          `/api/reports/summary?${query}`,
        );
        if (request === latestRequest.current) setResult(result);
      } catch (caught) {
        if (request === latestRequest.current)
          setError(
            caught instanceof Error ? caught.message : 'Unable to load report.',
          );
      } finally {
        if (request === latestRequest.current) setLoading(false);
      }
    },
    [businessId],
  );
  useEffect(() => {
    // Synchronize the visible report with the selected business.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(new URLSearchParams({ scope: 'FULL' }));
  }, [load]);
  function submit(event: FormEvent) {
    event.preventDefault();
    void load(
      new URLSearchParams({
        scope,
        ...(scope === 'MONTH'
          ? { month }
          : scope === 'TAX_YEAR'
            ? { taxYear }
            : {}),
      }),
    );
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Read-only summaries</span>
          <h1>Reports</h1>
          <p>Source totals within your granted scope and record dates.</p>
        </div>
      </div>
      <form className="panel stack-form" onSubmit={submit}>
        <label htmlFor="report-period">Report period</label>
        <select
          id="report-period"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <option value="FULL">All permitted dates</option>
          <option value="MONTH">Month</option>
          <option value="TAX_YEAR">Tax year</option>
        </select>
        {scope === 'MONTH' && (
          <>
            <label htmlFor="report-month">Month</label>
            <input
              id="report-month"
              type="month"
              required
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </>
        )}
        {scope === 'TAX_YEAR' && (
          <>
            <label htmlFor="report-year">Tax year ending</label>
            <input
              id="report-year"
              type="number"
              min="1901"
              max="9999"
              required
              value={taxYear}
              onChange={(event) => setTaxYear(event.target.value)}
            />
          </>
        )}
        <button disabled={loading}>View report</button>
      </form>
      <FormError message={error} />
      {loading && <p role="status">Loading report…</p>}
      {result && (
        <section className="panel">
          <p>{result.note}</p>
          {result.rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Family</th>
                    <th>Type</th>
                    <th>Records</th>
                    <th>Currency</th>
                    <th>Recorded total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={`${row.family}-${row.subtype}-${row.currency}`}>
                      <td>{row.family}</td>
                      <td>{row.subtype}</td>
                      <td>{row.record_count}</td>
                      <td>{row.currency}</td>
                      <td>
                        {new Intl.NumberFormat('en-NZ', {
                          style: 'currency',
                          currency: row.currency,
                        }).format(row.recorded_total_minor / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No records match this report period within your access.</p>
          )}
        </section>
      )}
    </section>
  );
}
