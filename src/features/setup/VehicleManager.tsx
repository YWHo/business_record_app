import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../auth/AuthContext';

export interface Vehicle {
  id: string;
  registration: string;
  description: string;
  active: boolean;
  acquiredAt: string | null;
  retiredAt: string | null;
  notes: string | null;
}

interface VehicleDraft {
  registration: string;
  description: string;
  acquiredAt: string;
  retiredAt: string;
  notes: string;
  active: boolean;
}

const emptyDraft: VehicleDraft = {
  registration: '',
  description: '',
  acquiredAt: '',
  retiredAt: '',
  notes: '',
  active: true,
};

function draftFrom(vehicle: Vehicle): VehicleDraft {
  return {
    registration: vehicle.registration,
    description: vehicle.description,
    acquiredAt: vehicle.acquiredAt ?? '',
    retiredAt: vehicle.retiredAt ?? '',
    notes: vehicle.notes ?? '',
    active: vehicle.active,
  };
}

export function VehicleManager({ canManage }: { canManage: boolean }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [createDraft, setCreateDraft] = useState(emptyDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles');
    setVehicles(result.vehicles);
  }, []);

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load vehicles.',
      ),
    );
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify(createDraft),
      });
      setCreateDraft(emptyDraft);
      setMessage('Vehicle added.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to add vehicle.',
      );
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editId) return;
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/vehicles', {
        method: 'PATCH',
        body: JSON.stringify({ id: editId, ...editDraft }),
      });
      setEditId(null);
      setMessage('Vehicle updated.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to update vehicle.',
      );
    }
  }

  async function toggle(vehicle: Vehicle) {
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/vehicles', {
        method: 'PATCH',
        body: JSON.stringify({ id: vehicle.id, active: !vehicle.active }),
      });
      setMessage(`Vehicle ${vehicle.active ? 'deactivated' : 'reactivated'}.`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to update vehicle.',
      );
    }
  }

  return (
    <section
      className="panel reference-panel"
      aria-labelledby="vehicles-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="vehicles-heading">Vehicles</h2>
          <p>Reusable vehicles retained for mileage and expense history.</p>
        </div>
        <span className="count-badge">{vehicles.length}</span>
      </div>

      {canManage ? (
        <form
          className="reference-form"
          onSubmit={(event) => void create(event)}
        >
          <h3>Add vehicle</h3>
          <label htmlFor="new-vehicle-registration">Registration</label>
          <input
            id="new-vehicle-registration"
            required
            maxLength={16}
            value={createDraft.registration}
            onChange={(event) =>
              setCreateDraft({
                ...createDraft,
                registration: event.target.value,
              })
            }
          />
          <label htmlFor="new-vehicle-description">Description</label>
          <input
            id="new-vehicle-description"
            required
            maxLength={200}
            value={createDraft.description}
            onChange={(event) =>
              setCreateDraft({
                ...createDraft,
                description: event.target.value,
              })
            }
          />
          <label htmlFor="new-vehicle-acquired">Acquired date</label>
          <input
            id="new-vehicle-acquired"
            type="date"
            value={createDraft.acquiredAt}
            onChange={(event) =>
              setCreateDraft({ ...createDraft, acquiredAt: event.target.value })
            }
          />
          <label htmlFor="new-vehicle-notes">Notes</label>
          <textarea
            id="new-vehicle-notes"
            maxLength={2000}
            value={createDraft.notes}
            onChange={(event) =>
              setCreateDraft({ ...createDraft, notes: event.target.value })
            }
          />
          <button type="submit">Add vehicle</button>
        </form>
      ) : null}

      {message ? (
        <p className="notice success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="record-list">
        {vehicles.map((vehicle) => (
          <article className="reference-card" key={vehicle.id}>
            {editId === vehicle.id ? (
              <form
                className="reference-form"
                onSubmit={(event) => void save(event)}
              >
                <h3>Edit vehicle</h3>
                <label htmlFor={`vehicle-registration-${vehicle.id}`}>
                  Registration
                </label>
                <input
                  id={`vehicle-registration-${vehicle.id}`}
                  required
                  maxLength={16}
                  value={editDraft.registration}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      registration: event.target.value,
                    })
                  }
                />
                <label htmlFor={`vehicle-description-${vehicle.id}`}>
                  Description
                </label>
                <input
                  id={`vehicle-description-${vehicle.id}`}
                  required
                  maxLength={200}
                  value={editDraft.description}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      description: event.target.value,
                    })
                  }
                />
                <label htmlFor={`vehicle-acquired-${vehicle.id}`}>
                  Acquired date
                </label>
                <input
                  id={`vehicle-acquired-${vehicle.id}`}
                  type="date"
                  value={editDraft.acquiredAt}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      acquiredAt: event.target.value,
                    })
                  }
                />
                <label htmlFor={`vehicle-notes-${vehicle.id}`}>Notes</label>
                <textarea
                  id={`vehicle-notes-${vehicle.id}`}
                  maxLength={2000}
                  value={editDraft.notes}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, notes: event.target.value })
                  }
                />
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editDraft.active}
                    onChange={(event) =>
                      setEditDraft({
                        ...editDraft,
                        active: event.target.checked,
                      })
                    }
                  />
                  Active
                </label>
                {!editDraft.active ? (
                  <>
                    <label htmlFor={`vehicle-retired-${vehicle.id}`}>
                      Retired date
                    </label>
                    <input
                      id={`vehicle-retired-${vehicle.id}`}
                      type="date"
                      value={editDraft.retiredAt}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          retiredAt: event.target.value,
                        })
                      }
                    />
                  </>
                ) : null}
                <div className="button-row">
                  <button type="submit">Save</button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="record-summary">
                  <div>
                    <h3>{vehicle.registration}</h3>
                    <p>{vehicle.description}</p>
                  </div>
                  <span
                    className={`status-badge ${vehicle.active ? 'active' : 'inactive'}`}
                  >
                    {vehicle.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="record-dates">
                  {vehicle.acquiredAt
                    ? `Acquired ${vehicle.acquiredAt}`
                    : 'No acquisition date'}
                  {vehicle.retiredAt ? ` · Retired ${vehicle.retiredAt}` : ''}
                </p>
                {vehicle.notes ? <p>{vehicle.notes}</p> : null}
                {canManage ? (
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditId(vehicle.id);
                        setEditDraft(draftFrom(vehicle));
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={
                        vehicle.active ? 'danger-button' : 'secondary-button'
                      }
                      onClick={() => void toggle(vehicle)}
                    >
                      {vehicle.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
