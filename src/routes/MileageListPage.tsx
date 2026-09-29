import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';
import {
  sessionDate,
  sessionStatus,
} from '../features/mileage/businessMileage';
import {
  emptyWorkSessionSummary,
  sessionMoney,
  type WorkSession,
  type WorkSessionSummary,
} from './MileagePage';

export function MileageListPage() {
  const { businessId = '' } = useParams();
  const { businesses } = useBusinessDirectory();
  const { user } = useAuth();
  const business = businesses.find((item) => item.id === businessId);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [summary, setSummary] = useState<WorkSessionSummary>(
    emptyWorkSessionSummary,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await apiRequest<{
        sessions: WorkSession[];
        summary: WorkSessionSummary;
      }>(`/api/businesses/${businessId}/work-sessions`);
      setSessions(result.sessions);
      setSummary(result.summary);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load mileage.',
      );
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const currency = summary.currency ?? 'NZD';
  return (
    <section aria-labelledby="mileage-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Mileage log</span>
          <h1 id="mileage-heading">Mileage</h1>
          <p>
            Work sessions and odometer-derived distance for {business?.name}.
          </p>
        </div>
        {user?.role === 'OWNER' ? (
          <Link className="primary-button button-link" to="new">
            Add work session
          </Link>
        ) : null}
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
          <strong>{sessionMoney(summary.revenuePerHourMinor, currency)}</strong>
          <small>
            {summary.completeRevenueData
              ? 'Gross revenue ÷ time'
              : 'Add revenue to every session'}
          </small>
        </article>
        <article className="metric-card">
          <span>Revenue per km</span>
          <strong>{sessionMoney(summary.revenuePerKmMinor, currency)}</strong>
          <small>
            {summary.completeRevenueData
              ? 'Gross revenue ÷ distance'
              : 'Add revenue to every session'}
          </small>
        </article>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">Loading mileage…</p> : null}
      {!loading && sessions.length === 0 ? (
        <section className="empty-state">
          <div>
            <h2>No work sessions yet</h2>
            <p>
              Add the first session to calculate business distance and rates.
            </p>
          </div>
        </section>
      ) : null}
      {sessions.length ? (
        <div className="responsive-record-table">
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>Vehicle</th>
                <th>Distance</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td data-label="Start">
                    <Link to={session.id}>
                      {sessionDate(session.startedAt)}
                    </Link>
                  </td>
                  <td data-label="Vehicle">{session.vehicleRegistration}</td>
                  <td data-label="Distance" className="numeric-cell">
                    {session.distanceKm.toLocaleString('en-NZ')} km
                  </td>
                  <td data-label="Duration" className="numeric-cell">
                    {session.durationHours.toLocaleString('en-NZ')} h
                  </td>
                  <td data-label="Status">
                    <span className="context-chip">
                      {sessionStatus(session.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
