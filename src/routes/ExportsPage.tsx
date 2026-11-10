import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackupReminder } from '../features/exports/BackupReminder';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { hasPermission } from '../lib/permissions';
import { ExportDownloadLink } from '../features/exports/ExportDownloadLink';
import { useParams } from 'react-router-dom';

interface ExportHistory {
  id: string;
  scope: 'MONTH' | 'TAX_YEAR' | 'FULL';
  periodKey: string | null;
  expectedRecordCount: number;
  expectedAttachmentCount: number;
  completedAt: string;
  requestedByEmail: string;
}
interface ExportStatus {
  exports: ExportHistory[];
}

export function ExportsPage() {
  const { configuration, user } = useAuth();
  const archive = hasPermission(user, 'ARCHIVE_EXPORT');
  const { businessId } = useParams();
  const isDemo = configuration?.environment === 'demo';
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const initialTaxYear = String(
    now.getMonth() < 3 ? now.getFullYear() : now.getFullYear() + 1,
  );
  const [scope, setScope] = useState<'MONTH' | 'TAX_YEAR' | 'FULL'>('MONTH'),
    [month, setMonth] = useState(initialMonth),
    [taxYear, setTaxYear] = useState(initialTaxYear),
    [history, setHistory] = useState<ExportHistory[]>([]),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    const result = await apiRequest<ExportStatus>('/api/exports/status');
    setHistory(result.exports);
  }, []);
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load exports.',
      ),
    );
  }, [load]);
  const href = useMemo(() => {
    const query = new URLSearchParams({ scope });
    if (scope === 'MONTH') query.set('month', month);
    if (scope === 'TAX_YEAR') query.set('taxYear', taxYear);
    if (!archive && businessId) query.set('businessId', businessId);
    return `${archive ? '/api/exports/archive' : '/api/reports/export'}?${query}`;
  }, [archive, businessId, month, scope, taxYear]);
  function started() {
    setError('');
    window.setTimeout(() => void load().catch(() => undefined), 1500);
  }
  return (
    <section aria-labelledby="exports-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Portable copies</span>
          <h1 id="exports-heading">
            {archive ? 'Exports and local backup' : 'Reports'}
          </h1>
          <p>
            {archive
              ? 'Download repeatable ZIP archives containing CSV data, source documents, a readable summary, and a SHA-256 manifest.'
              : 'Download source totals grouped by record family and currency. These figures are not cash flow, profit, or final tax treatment.'}
          </p>
        </div>
      </div>
      {archive ? <BackupReminder /> : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="panel">
        <h2>Create an export</h2>
        {isDemo ? (
          <p className="notice">
            Dynamic archive generation is disabled in the public demo to keep
            shared infrastructure usage bounded. Production and local
            environments retain the complete backup workflow.
          </p>
        ) : (
          <>
            <p>
              Exporting never removes, archives, or changes the cloud records.
              The same period can be downloaded again whenever needed.
            </p>
            <div className="work-session-form">
              <label>
                Export scope
                <select
                  value={scope}
                  onChange={(event) =>
                    setScope(event.target.value as typeof scope)
                  }
                >
                  <option value="MONTH">Monthly</option>
                  <option value="TAX_YEAR">Tax year</option>
                  <option value="FULL">
                    {archive ? 'Complete archive' : 'All retained records'}
                  </option>
                </select>
              </label>
              {scope === 'MONTH' ? (
                <label>
                  Month
                  <input
                    required
                    type="month"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                  />
                </label>
              ) : null}
              {scope === 'TAX_YEAR' ? (
                <label>
                  Tax year ending
                  <input
                    required
                    type="number"
                    min="1901"
                    max="9999"
                    value={taxYear}
                    onChange={(event) => setTaxYear(event.target.value)}
                  />
                </label>
              ) : null}
              <ExportDownloadLink
                role={user?.role}
                href={href}
                onDownload={started}
              />
            </div>
          </>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Successful exports</h2>
            <p>Server-verified archive generations, newest first.</p>
          </div>
          <span className="count-badge">{history.length}</span>
        </div>
        <div className="record-list">
          {history.length ? (
            history.map((item) => (
              <article className="reference-card" key={item.id}>
                <strong>
                  {item.scope.replace('_', ' ').toLowerCase()}
                  {item.periodKey ? ` · ${item.periodKey}` : ''}
                </strong>
                <p>
                  {item.expectedRecordCount} records ·{' '}
                  {item.expectedAttachmentCount} source documents
                </p>
                <small>
                  {new Date(item.completedAt).toLocaleString('en-NZ')} ·{' '}
                  {item.requestedByEmail}
                </small>
              </article>
            ))
          ) : (
            <p>No exports have completed yet.</p>
          )}
        </div>
      </section>
    </section>
  );
}
