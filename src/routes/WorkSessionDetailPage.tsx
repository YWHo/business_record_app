import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { AttachmentPanel } from '../features/attachments/AttachmentPanel';
import {
  sessionDate,
  sessionStatus,
} from '../features/mileage/businessMileage';
import {
  FuelWorkflowForm,
  sessionMoney,
  type FuelOption,
  type WorkSession,
} from './MileagePage';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function WorkSessionDetailPage() {
  const { businessId = '', sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { configuration, user } = useAuth();
  const [session, setSession] = useState<WorkSession | null>(null);
  const [fuelRecords, setFuelRecords] = useState<FuelOption[]>([]);
  const [fuelOpen, setFuelOpen] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [sessionResult, fuelResult] = await Promise.all([
        apiRequest<{ session: WorkSession }>(
          `/api/businesses/${businessId}/work-sessions/${sessionId}`,
        ),
        apiRequest<{ fuelRecords: FuelOption[] }>('/api/fuel-records'),
      ]);
      setSession(sessionResult.session);
      setFuelRecords(
        fuelResult.fuelRecords.filter(
          (fuel) => fuel.vehicleId === sessionResult.session.vehicleId,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load work session.',
      );
    }
  }, [businessId, sessionId]);
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function saveFuel(values: {
    tankFullAtStart: boolean;
    noPersonalDriving: boolean;
    tankFullAtEnd: boolean;
    startingFuelExpenseId: string;
    endingFuelExpenseId: string;
  }) {
    await apiRequest(
      `/api/businesses/${businessId}/work-sessions/${sessionId}/fuel-workflow`,
      { method: 'PATCH', body: JSON.stringify(values) },
    );
    setFuelOpen(false);
    await load();
  }
  async function moveToTrash() {
    if (
      !session ||
      !window.confirm(
        'Move this work session to trash? It can be restored during retention.',
      )
    )
      return;
    await apiRequest('/api/trash', {
      method: 'POST',
      body: JSON.stringify({
        recordType: 'WORK_SESSION',
        recordId: session.id,
        businessId,
      }),
    });
    void navigate(`/app/businesses/${businessId}/mileage`);
  }
  if (error)
    return (
      <section className="empty-state" role="alert">
        <div>
          <h1>Work session unavailable</h1>
          <p>{error}</p>
          <Link to={`/app/businesses/${businessId}/mileage`}>
            Back to mileage
          </Link>
        </div>
      </section>
    );
  if (!session) return <p role="status">Loading work session…</p>;
  return (
    <section aria-labelledby="session-detail-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Work session</span>
          <h1 id="session-detail-heading">
            {session.vehicleRegistration} ·{' '}
            {session.distanceKm.toLocaleString('en-NZ')} km
          </h1>
          <p>
            {sessionDate(session.startedAt)} · {sessionStatus(session.status)}
          </p>
        </div>
        <div className="button-row">
          <Link
            className="secondary-button button-link"
            to={`/app/businesses/${businessId}/mileage`}
          >
            Back to mileage
          </Link>
          {user?.role === 'OWNER' ? (
            <Link className="primary-button button-link" to="edit">
              Edit session
            </Link>
          ) : null}
        </div>
      </div>
      <section className="panel record-detail-panel">
        <dl className="record-detail-grid">
          <Detail label="Start" value={sessionDate(session.startedAt)} />
          <Detail label="End" value={sessionDate(session.endedAt)} />
          <Detail label="Vehicle" value={session.vehicleRegistration} />
          <Detail
            label="Odometer"
            value={`${session.odometerStartKm.toLocaleString('en-NZ')} → ${session.odometerEndKm.toLocaleString('en-NZ')} km`}
          />
          <Detail
            label="Distance"
            value={`${session.distanceKm.toLocaleString('en-NZ')} km`}
          />
          <Detail
            label="Duration"
            value={`${session.durationHours.toLocaleString('en-NZ')} h`}
          />
          <Detail
            label="Gross revenue"
            value={sessionMoney(session.grossRevenueMinor, session.currency)}
          />
          <Detail
            label="Revenue per hour"
            value={sessionMoney(session.revenuePerHourMinor, session.currency)}
          />
          <Detail
            label="Revenue per km"
            value={sessionMoney(session.revenuePerKmMinor, session.currency)}
          />
          <Detail
            label="Fuel evidence"
            value={
              session.fuelCalculationStatus === 'EXACT'
                ? 'Exact full-tank'
                : session.fuelCalculationStatus === 'ESTIMATE'
                  ? 'Estimate only'
                  : 'Unavailable'
            }
          />
          <Detail
            label="Efficiency"
            value={
              session.kilometresPerLitre === null
                ? '—'
                : `${session.kilometresPerLitre.toLocaleString('en-NZ')} km/L`
            }
          />
          <Detail label="Notes" value={session.notes || '—'} />
        </dl>
        {session.fuelCalculationStatus === 'ESTIMATE' ? (
          <p className="notice">
            This fuel-use result is not exact because all three full-tank
            confirmations are not true.
          </p>
        ) : null}
      </section>
      {user?.role === 'OWNER' ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Fuel workflow</h2>
              <p>Link full-tank evidence for this session vehicle.</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setFuelOpen(!fuelOpen)}
            >
              {fuelOpen ? 'Close' : 'Update fuel workflow'}
            </button>
          </div>
          {fuelOpen ? (
            <FuelWorkflowForm
              session={session}
              fuelRecords={fuelRecords}
              onSubmit={saveFuel}
              onCancel={() => setFuelOpen(false)}
            />
          ) : null}
          <button
            type="button"
            className="link-button"
            onClick={() => void moveToTrash()}
          >
            Move to trash
          </button>
        </section>
      ) : null}
      <AttachmentPanel
        recordType="WORK_SESSION"
        recordId={session.id}
        canManage={user?.role === 'OWNER'}
        localOnly={configuration?.environment === 'demo'}
      />
    </section>
  );
}
