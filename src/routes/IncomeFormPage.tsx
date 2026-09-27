import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiRequest, useAuth } from '../features/auth/AuthContext';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';
import {
  IncomeForm,
  emptyIncomeDraft,
  incomeDraftFrom,
  type IncomeDraft,
  type IncomeRecord,
  type IncomeReference,
} from './IncomePage';

export function IncomeFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { businessId = '', incomeId = '' } = useParams();
  const navigate = useNavigate();
  const { businesses } = useBusinessDirectory();
  const { configuration, user } = useAuth();
  const business = businesses.find((item) => item.id === businessId);
  const [record, setRecord] = useState<IncomeRecord | null>(null);
  const [clients, setClients] = useState<IncomeReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    draft: IncomeDraft;
    warnings: Array<{ code: string; message: string }>;
  } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [clientResult, incomeResult] = await Promise.all([
        apiRequest<{ clients: IncomeReference[] }>('/api/clients'),
        mode === 'edit'
          ? apiRequest<{ incomeRecord: IncomeRecord }>(
              `/api/businesses/${businessId}/income/${incomeId}`,
            )
          : Promise.resolve(null),
      ]);
      setClients(clientResult.clients);
      if (incomeResult) setRecord(incomeResult.incomeRecord);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load income.',
      );
    } finally {
      setLoading(false);
    }
  }, [businessId, incomeId, mode]);

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(draft: IncomeDraft, confirmedWarnings: string[] = []) {
    setError('');
    try {
      const result = await apiRequest<{ incomeRecord: IncomeRecord }>(
        mode === 'edit'
          ? `/api/businesses/${businessId}/income/${incomeId}`
          : `/api/businesses/${businessId}/income`,
        {
          method: mode === 'edit' ? 'PATCH' : 'POST',
          body: JSON.stringify({ ...draft, confirmedWarnings }),
        },
      );
      setPending(null);
      if (mode === 'edit' || configuration?.environment === 'demo') {
        void navigate(`/app/businesses/${businessId}/income`);
      } else {
        void navigate(
          `/app/businesses/${businessId}/income/${result.incomeRecord.id}`,
        );
      }
    } catch (caught) {
      const warnings =
        caught instanceof ApiError &&
        caught.status === 409 &&
        Array.isArray(caught.body?.warnings)
          ? (caught.body.warnings as Array<{ code: string; message: string }>)
          : null;
      if (warnings?.length) {
        setPending({ draft, warnings });
        return;
      }
      const failure =
        caught instanceof Error ? caught : new Error('Unable to save income.');
      setError(failure.message);
      throw failure;
    }
  }

  if (user?.role !== 'OWNER')
    return (
      <section className="empty-state" role="alert">
        <div>
          <h1>Income changes are owner-only</h1>
          <p>
            Accountants can review and reconcile income but cannot create or
            edit source records.
          </p>
          <Link to={`/app/businesses/${businessId}/income`}>
            Back to income
          </Link>
        </div>
      </section>
    );

  const entity = business?.currentLegalEntity;
  const context = entity?.legalName || entity?.tradingName;
  const cancelPath =
    mode === 'edit'
      ? `/app/businesses/${businessId}/income/${incomeId}`
      : `/app/businesses/${businessId}/income`;

  return (
    <section aria-labelledby="income-form-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Income</span>
          <h1 id="income-form-heading">
            {mode === 'edit' ? 'Edit income' : 'Add income'}
          </h1>
          <p>
            {mode === 'edit' ? 'Update' : 'Record'} income for {business?.name}.{' '}
            {context ? `${context} is derived by date.` : ''}
          </p>
        </div>
        <Link className="secondary-button button-link" to={cancelPath}>
          Cancel
        </Link>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">Loading income form…</p> : null}
      {pending ? (
        <section
          className="panel warning-panel"
          aria-labelledby="income-warning-heading"
        >
          <h2 id="income-warning-heading">Check before saving</h2>
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
                void submit(
                  pending.draft,
                  pending.warnings.map(({ code }) => code),
                )
              }
            >
              Save anyway
            </button>
          </div>
        </section>
      ) : null}
      {!loading && !error ? (
        <section className="panel focused-form-panel">
          <IncomeForm
            key={`${mode}-${record?.id ?? 'new'}`}
            initial={record ? incomeDraftFrom(record) : emptyIncomeDraft()}
            activities={[]}
            clients={clients}
            showActivity={false}
            lockType={mode === 'edit'}
            submitLabel={mode === 'edit' ? 'Save changes' : 'Save income'}
            onSubmit={submit}
          />
        </section>
      ) : null}
    </section>
  );
}
