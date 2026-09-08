import { useCallback, useEffect, useState } from 'react';
import {
  GeneralExpenseForm,
  ParkingForm,
} from '../features/expenses/ExpenseForms';
import {
  emptyExpenseDraft,
  emptyParkingDraft,
  expenseBody,
  localDateTime,
  type ExpenseDraft,
  type ParkingDraft,
  type ReferenceOption,
} from '../features/expenses/expenseModel';
import { apiRequest, useAuth } from '../features/auth/AuthContext';

interface ExpenseRecord {
  id: string;
  businessActivityId: string | null;
  activityName: string | null;
  expenseCategoryId: string;
  categoryName: string;
  merchantName: string;
  purchaseDatetime: string;
  totalAmountMinor: number;
  currency: string;
  gstAmountMinor: number | null;
  gstStatus: string;
  description: string | null;
  recurrenceType: string;
}
interface ParkingRecord extends ExpenseRecord {
  vehicleId: string | null;
  vehicleRegistration: string | null;
  parkingProvider: string | null;
  parkingLocation: string;
  parkingStartDatetime: string | null;
  parkingEndDatetime: string | null;
  parkingReference: string | null;
  parkingDurationMinutes: number | null;
}
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(
    minor / 100,
  );
function draftFrom(record: ExpenseRecord): ExpenseDraft {
  return {
    businessActivityId: record.businessActivityId ?? '',
    expenseCategoryId: record.expenseCategoryId,
    merchantName: record.merchantName,
    purchaseDatetime: localDateTime(record.purchaseDatetime),
    totalAmount: (record.totalAmountMinor / 100).toFixed(2),
    currency: record.currency,
    gstAmount:
      record.gstAmountMinor === null
        ? ''
        : (record.gstAmountMinor / 100).toFixed(2),
    gstStatus: record.gstStatus,
    description: record.description ?? '',
    recurrenceType: record.recurrenceType,
  };
}
function parkingDraftFrom(record: ParkingRecord): ParkingDraft {
  return {
    ...draftFrom(record),
    vehicleId: record.vehicleId ?? '',
    parkingProvider: record.parkingProvider ?? '',
    parkingLocation: record.parkingLocation,
    parkingStartDatetime: record.parkingStartDatetime
      ? localDateTime(record.parkingStartDatetime)
      : '',
    parkingEndDatetime: record.parkingEndDatetime
      ? localDateTime(record.parkingEndDatetime)
      : '',
    parkingReference: record.parkingReference ?? '',
  };
}
function duration(minutes: number | null) {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h ${rest} min` : `${rest} min`;
}

export function RecordsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'OWNER';
  const [parking, setParking] = useState<ParkingRecord[]>([]);
  const [general, setGeneral] = useState<ExpenseRecord[]>([]);
  const [activities, setActivities] = useState<ReferenceOption[]>([]);
  const [vehicles, setVehicles] = useState<ReferenceOption[]>([]);
  const [categories, setCategories] = useState<ReferenceOption[]>([]);
  const [editParking, setEditParking] = useState<ParkingRecord | null>(null);
  const [editGeneral, setEditGeneral] = useState<ExpenseRecord | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [
      parkingResult,
      generalResult,
      activityResult,
      vehicleResult,
      categoryResult,
    ] = await Promise.all([
      apiRequest<{ parkingRecords: ParkingRecord[] }>('/api/parking-records'),
      apiRequest<{ generalExpenses: ExpenseRecord[] }>('/api/general-expenses'),
      apiRequest<{
        activities: Array<{ id: string; name: string; active: boolean }>;
      }>('/api/business-activities'),
      apiRequest<{
        vehicles: Array<{ id: string; registration: string; active: boolean }>;
      }>('/api/vehicles'),
      apiRequest<{
        categories: Array<{
          id: string;
          name: string;
          active: boolean;
          systemKey: string | null;
        }>;
      }>('/api/expense-categories'),
    ]);
    setParking(parkingResult.parkingRecords);
    setGeneral(generalResult.generalExpenses);
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
    setCategories(
      categoryResult.categories
        .filter((item) => !['FUEL', 'PARKING'].includes(item.systemKey ?? ''))
        .map((item) => ({
          id: item.id,
          label: item.name,
          active: item.active,
        })),
    );
  }, []);
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load expenses.',
      ),
    );
  }, [load]);
  async function save(
    path: string,
    draft: ExpenseDraft | ParkingDraft,
    id?: string,
  ) {
    setError('');
    setMessage('');
    try {
      await apiRequest(path, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...(id ? { id } : {}), ...expenseBody(draft) }),
      });
      setEditParking(null);
      setEditGeneral(null);
      setMessage(id ? 'Expense updated.' : 'Expense added.');
      await load();
    } catch (caught) {
      const failure =
        caught instanceof Error ? caught : new Error('Unable to save expense.');
      setError(failure.message);
      throw failure;
    }
  }
  return (
    <section aria-labelledby="records-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Expense records</span>
          <h1 id="records-heading">Parking and general expenses</h1>
          <p>
            Record parking evidence and flexible business costs without making
            tax-treatment decisions.
          </p>
        </div>
      </div>
      {!canManage ? (
        <p className="notice">
          Accountants can review expenses. Only the owner can change them.
        </p>
      ) : null}
      {canManage ? (
        <div className="reference-grid">
          <section className="panel">
            <h2>Add parking</h2>
            <ParkingForm
              key={`p-${parking.length}`}
              initial={emptyParkingDraft()}
              activities={activities}
              vehicles={vehicles}
              submitLabel="Add parking expense"
              onSubmit={(draft) => save('/api/parking-records', draft)}
            />
          </section>
          <section className="panel">
            <h2>Add general expense</h2>
            <GeneralExpenseForm
              key={`g-${general.length}`}
              initial={emptyExpenseDraft()}
              activities={activities}
              categories={categories}
              submitLabel="Add general expense"
              onSubmit={(draft) => save('/api/general-expenses', draft)}
            />
          </section>
        </div>
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
      <section>
        <h2>Parking history</h2>
        {parking.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No parking records yet</h3>
              <p>Parking expenses will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="session-list">
            {parking.map((record) => (
              <article className="session-card" key={record.id}>
                {editParking?.id === record.id ? (
                  <ParkingForm
                    initial={parkingDraftFrom(record)}
                    activities={activities}
                    vehicles={vehicles}
                    submitLabel="Save changes"
                    onSubmit={(draft) =>
                      save('/api/parking-records', draft, record.id)
                    }
                    onCancel={() => setEditParking(null)}
                  />
                ) : (
                  <>
                    <div className="record-summary">
                      <div>
                        <h3>
                          {record.parkingProvider ?? 'Parking'} ·{' '}
                          {record.parkingLocation}
                        </h3>
                        <p>
                          {new Date(record.purchaseDatetime).toLocaleString(
                            'en-NZ',
                          )}{' '}
                          · {record.activityName ?? 'Unallocated'}
                        </p>
                      </div>
                      <strong>
                        {money(record.totalAmountMinor, record.currency)}
                      </strong>
                    </div>
                    <dl className="session-details">
                      <div>
                        <dt>Duration</dt>
                        <dd>{duration(record.parkingDurationMinutes)}</dd>
                      </div>
                      <div>
                        <dt>Vehicle</dt>
                        <dd>{record.vehicleRegistration ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Reference</dt>
                        <dd>{record.parkingReference ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Recurrence</dt>
                        <dd>
                          {record.recurrenceType === 'RECURRING'
                            ? 'Recurring'
                            : 'One-off'}
                        </dd>
                      </div>
                    </dl>
                    {canManage ? (
                      <button
                        className="secondary-button"
                        onClick={() => setEditParking(record)}
                      >
                        Edit parking
                      </button>
                    ) : null}
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="history-section">
        <h2>General expense history</h2>
        {general.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No general expenses yet</h3>
              <p>
                Software, services, training, and other costs will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="session-list">
            {general.map((record) => (
              <article className="session-card" key={record.id}>
                {editGeneral?.id === record.id ? (
                  <GeneralExpenseForm
                    initial={draftFrom(record)}
                    activities={activities}
                    categories={categories}
                    submitLabel="Save changes"
                    onSubmit={(draft) =>
                      save('/api/general-expenses', draft, record.id)
                    }
                    onCancel={() => setEditGeneral(null)}
                  />
                ) : (
                  <>
                    <div className="record-summary">
                      <div>
                        <h3>{record.merchantName}</h3>
                        <p>
                          {record.categoryName} ·{' '}
                          {new Date(record.purchaseDatetime).toLocaleString(
                            'en-NZ',
                          )}
                        </p>
                      </div>
                      <strong>
                        {money(record.totalAmountMinor, record.currency)}
                      </strong>
                    </div>
                    <dl className="session-details">
                      <div>
                        <dt>Activity</dt>
                        <dd>{record.activityName ?? 'Unallocated'}</dd>
                      </div>
                      <div>
                        <dt>GST</dt>
                        <dd>
                          {record.gstAmountMinor === null
                            ? '—'
                            : money(record.gstAmountMinor, record.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt>Recurrence</dt>
                        <dd>
                          {record.recurrenceType === 'RECURRING'
                            ? 'Recurring'
                            : 'One-off'}
                        </dd>
                      </div>
                    </dl>
                    {record.description ? <p>{record.description}</p> : null}
                    {canManage ? (
                      <button
                        className="secondary-button"
                        onClick={() => setEditGeneral(record)}
                      >
                        Edit expense
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
