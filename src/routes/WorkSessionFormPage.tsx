import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiRequest, useAuth } from '../features/auth/AuthContext';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';
import { WorkSessionForm } from '../features/mileage/WorkSessionForm';
import {
  emptyWorkSessionDraft,
  type ReferenceOption,
  type WorkSessionDraft,
} from '../features/mileage/workSessionModel';
import {
  workSessionDraftFrom,
  workSessionRequestBody,
  type WorkSession,
} from './MileagePage';

interface Warning {
  code: string;
  message: string;
}

export function WorkSessionFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { businessId = '', sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { businesses } = useBusinessDirectory();
  const { configuration, user } = useAuth();
  const business = businesses.find((item) => item.id === businessId);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [vehicles, setVehicles] = useState<ReferenceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    draft: WorkSessionDraft;
    warnings: Warning[];
  } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [vehicleResult, sessionResult] = await Promise.all([
        apiRequest<{
          vehicles: Array<{
            id: string;
            registration: string;
            active: boolean;
          }>;
        }>('/api/vehicles'),
        mode === 'edit'
          ? apiRequest<{ session: WorkSession }>(
              `/api/businesses/${businessId}/work-sessions/${sessionId}`,
            )
          : Promise.resolve(null),
      ]);
      setVehicles(
        vehicleResult.vehicles.map((item) => ({
          id: item.id,
          label: item.registration,
          active: item.active,
        })),
      );
      if (sessionResult) setSession(sessionResult.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load work session.',
      );
    } finally {
      setLoading(false);
    }
  }, [businessId, mode, sessionId]);

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(
    draft: WorkSessionDraft,
    confirmedWarnings: string[] = [],
  ) {
    setError('');
    try {
      const result = await apiRequest<{ session: WorkSession }>(
        mode === 'edit'
          ? `/api/businesses/${businessId}/work-sessions/${sessionId}`
          : `/api/businesses/${businessId}/work-sessions`,
        {
          method: mode === 'edit' ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...workSessionRequestBody(draft),
            confirmedWarnings,
          }),
        },
      );
      setPending(null);
      if (mode === 'edit' || configuration?.environment === 'demo')
        void navigate(`/app/businesses/${businessId}/mileage`);
      else
        void navigate(
          `/app/businesses/${businessId}/mileage/${result.session.id}`,
        );
    } catch (caught) {
      const warnings =
        caught instanceof ApiError &&
        caught.status === 409 &&
        Array.isArray(caught.body?.warnings)
          ? (caught.body.warnings as Warning[])
          : null;
      if (warnings?.length) {
        setPending({ draft, warnings });
        return;
      }
      const failure =
        caught instanceof Error
          ? caught
          : new Error('Unable to save work session.');
      setError(failure.message);
      throw failure;
    }
  }

  if (user?.role !== 'OWNER')
    return (
      <section className="empty-state" role="alert">
        <div>
          <h1>Work-session changes are owner-only</h1>
          <p>
            Accountants can review mileage but cannot change source records.
          </p>
          <Link to={`/app/businesses/${businessId}/mileage`}>
            Back to mileage
          </Link>
        </div>
      </section>
    );
  const context =
    business?.currentLegalEntity?.legalName ||
    business?.currentLegalEntity?.tradingName;
  const cancelPath =
    mode === 'edit'
      ? `/app/businesses/${businessId}/mileage/${sessionId}`
      : `/app/businesses/${businessId}/mileage`;
  return (
    <section aria-labelledby="session-form-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Mileage</span>
          <h1 id="session-form-heading">
            {mode === 'edit' ? 'Edit work session' : 'Add work session'}
          </h1>
          <p>
            {mode === 'edit' ? 'Update' : 'Record'} a work session for{' '}
            {business?.name}. {context ? `${context} is derived by date.` : ''}
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
      {loading ? <p role="status">Loading work session…</p> : null}
      {pending ? (
        <section
          className="panel warning-panel"
          aria-labelledby="session-warning-heading"
        >
          <h2 id="session-warning-heading">Check before saving</h2>
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
          <WorkSessionForm
            key={`${mode}-${session?.id ?? 'new'}`}
            activities={[]}
            vehicles={vehicles}
            initial={
              session ? workSessionDraftFrom(session) : emptyWorkSessionDraft
            }
            showActivity={false}
            submitLabel={mode === 'edit' ? 'Save changes' : 'Save work session'}
            onSubmit={submit}
          />
        </section>
      ) : null}
    </section>
  );
}
