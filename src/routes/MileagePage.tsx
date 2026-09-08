import { useCallback, useEffect, useState } from 'react';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { WorkSessionForm } from '../features/mileage/WorkSessionForm';
import {
  emptyWorkSessionDraft,
  localDateTimeValue,
  type ReferenceOption,
  type WorkSessionDraft,
} from '../features/mileage/workSessionModel';

interface WorkSession {
  id: string;
  businessActivityId: string;
  activityName: string;
  vehicleId: string;
  vehicleRegistration: string;
  startedAt: string;
  endedAt: string;
  odometerStartKm: number;
  odometerEndKm: number;
  distanceKm: number;
  durationMinutes: number;
  durationHours: number;
  grossRevenueMinor: number | null;
  currency: string;
  revenuePerHourMinor: number | null;
  revenuePerKmMinor: number | null;
  notes: string | null;
}

interface Summary {
  sessionCount: number;
  totalDurationHours: number;
  totalDistanceKm: number;
  totalRevenueMinor: number | null;
  revenuePerHourMinor: number | null;
  revenuePerKmMinor: number | null;
  currency: string | null;
  completeRevenueData: boolean;
}

const emptySummary: Summary = {
  sessionCount: 0,
  totalDurationHours: 0,
  totalDistanceKm: 0,
  totalRevenueMinor: null,
  revenuePerHourMinor: null,
  revenuePerKmMinor: null,
  currency: null,
  completeRevenueData: false,
};

function money(minor: number | null, currency = 'NZD'): string {
  if (minor === null) return '—';
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

function draftFrom(session: WorkSession): WorkSessionDraft {
  return {
    businessActivityId: session.businessActivityId,
    vehicleId: session.vehicleId,
    startedAt: localDateTimeValue(session.startedAt),
    endedAt: localDateTimeValue(session.endedAt),
    odometerStartKm: String(session.odometerStartKm),
    odometerEndKm: String(session.odometerEndKm),
    grossRevenue:
      session.grossRevenueMinor === null
        ? ''
        : (session.grossRevenueMinor / 100).toFixed(2),
    currency: session.currency,
    notes: session.notes ?? '',
  };
}

function requestBody(draft: WorkSessionDraft) {
  return {
    ...draft,
    startedAt: new Date(draft.startedAt).toISOString(),
    endedAt: new Date(draft.endedAt).toISOString(),
    odometerStartKm: Number(draft.odometerStartKm),
    odometerEndKm: Number(draft.odometerEndKm),
  };
}

export function MileagePage() {
  const { user } = useAuth();
  const canManage = user?.role === 'OWNER';
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [activities, setActivities] = useState<ReferenceOption[]>([]);
  const [vehicles, setVehicles] = useState<ReferenceOption[]>([]);
  const [editing, setEditing] = useState<WorkSession | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [sessionResult, activityResult, vehicleResult] = await Promise.all([
      apiRequest<{ sessions: WorkSession[]; summary: Summary }>(
        '/api/work-sessions',
      ),
      apiRequest<{
        activities: Array<{ id: string; name: string; active: boolean }>;
      }>('/api/business-activities'),
      apiRequest<{
        vehicles: Array<{ id: string; registration: string; active: boolean }>;
      }>('/api/vehicles'),
    ]);
    setSessions(sessionResult.sessions);
    setSummary(sessionResult.summary);
    setActivities(
      activityResult.activities.map((item) => ({
        id: item.id,
        label: item.name,
        active: item.active,
      })),
    );
    setVehicles(
      vehicleResult.vehicles.map((item) => ({
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
          : 'Unable to load work sessions.',
      ),
    );
  }, [load]);

  async function create(draft: WorkSessionDraft) {
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/work-sessions', {
        method: 'POST',
        body: JSON.stringify(requestBody(draft)),
      });
      setMessage(
        'Work session added. Distance and rates were calculated from the source values.',
      );
      await load();
    } catch (caught) {
      const failure =
        caught instanceof Error
          ? caught
          : new Error('Unable to add work session.');
      setError(failure.message);
      throw failure;
    }
  }

  async function update(draft: WorkSessionDraft) {
    if (!editing) return;
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/work-sessions', {
        method: 'PATCH',
        body: JSON.stringify({ id: editing.id, ...requestBody(draft) }),
      });
      setEditing(null);
      setMessage('Work session updated and metrics recalculated.');
      await load();
    } catch (caught) {
      const failure =
        caught instanceof Error
          ? caught
          : new Error('Unable to update work session.');
      setError(failure.message);
      throw failure;
    }
  }

  const summaryCurrency = summary.currency ?? 'NZD';

  return (
    <section aria-labelledby="mileage-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Mileage log</span>
          <h1 id="mileage-heading">Work sessions</h1>
          <p>
            Business distance comes directly from the recorded odometers—never
            from a separately editable total.
          </p>
        </div>
      </div>

      <div className="metric-grid mileage-metrics">
        <article className="metric-card">
          <span>Business distance</span>
          <strong>{summary.totalDistanceKm.toLocaleString('en-NZ')} km</strong>
          <small>{summary.sessionCount} sessions</small>
        </article>
        <article className="metric-card">
          <span>Recorded time</span>
          <strong>
            {summary.totalDurationHours.toLocaleString('en-NZ')} h
          </strong>
          <small>Across logged sessions</small>
        </article>
        <article className="metric-card">
          <span>Revenue per hour</span>
          <strong>{money(summary.revenuePerHourMinor, summaryCurrency)}</strong>
          <small>
            {summary.completeRevenueData
              ? 'Gross revenue ÷ time'
              : 'Add revenue to every session'}
          </small>
        </article>
        <article className="metric-card">
          <span>Revenue per km</span>
          <strong>{money(summary.revenuePerKmMinor, summaryCurrency)}</strong>
          <small>
            {summary.completeRevenueData
              ? 'Gross revenue ÷ distance'
              : 'Add revenue to every session'}
          </small>
        </article>
      </div>

      {!canManage ? (
        <p className="notice">
          Accountants can review work sessions and calculated metrics. Only the
          owner can change them.
        </p>
      ) : null}
      {canManage ? (
        <section className="panel" aria-labelledby="add-session-heading">
          <h2 id="add-session-heading">Add work session</h2>
          <WorkSessionForm
            key={sessions.length}
            activities={activities}
            vehicles={vehicles}
            initial={emptyWorkSessionDraft}
            submitLabel="Add session"
            onSubmit={create}
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

      <section aria-labelledby="session-history-heading">
        <h2 id="session-history-heading">Session history</h2>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No work sessions yet</h3>
              <p>
                Add the first session to calculate business distance and
                performance rates.
              </p>
            </div>
          </div>
        ) : (
          <div className="session-list">
            {sessions.map((session) => (
              <article className="session-card" key={session.id}>
                {editing?.id === session.id ? (
                  <WorkSessionForm
                    activities={activities}
                    vehicles={vehicles}
                    initial={draftFrom(session)}
                    submitLabel="Save changes"
                    onSubmit={update}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <div className="record-summary">
                      <div>
                        <h3>{session.activityName}</h3>
                        <p>
                          {new Date(session.startedAt).toLocaleString('en-NZ')}{' '}
                          · {session.vehicleRegistration}
                        </p>
                      </div>
                      <strong>
                        {session.distanceKm.toLocaleString('en-NZ')} km
                      </strong>
                    </div>
                    <dl className="session-details">
                      <div>
                        <dt>Duration</dt>
                        <dd>
                          {session.durationHours.toLocaleString('en-NZ')} h
                        </dd>
                      </div>
                      <div>
                        <dt>Gross revenue</dt>
                        <dd>
                          {money(session.grossRevenueMinor, session.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt>Revenue/hour</dt>
                        <dd>
                          {money(session.revenuePerHourMinor, session.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt>Revenue/km</dt>
                        <dd>
                          {money(session.revenuePerKmMinor, session.currency)}
                        </dd>
                      </div>
                    </dl>
                    <p className="record-dates">
                      Odometer {session.odometerStartKm.toLocaleString('en-NZ')}{' '}
                      → {session.odometerEndKm.toLocaleString('en-NZ')} km
                    </p>
                    {session.notes ? <p>{session.notes}</p> : null}
                    {canManage ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setEditing(session)}
                      >
                        Edit session
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
