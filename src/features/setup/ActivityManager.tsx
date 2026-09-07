import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../auth/AuthContext';

export interface BusinessActivity {
  id: string;
  name: string;
  activityType: string;
  active: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

interface ActivityDraft {
  name: string;
  activityType: string;
  startedAt: string;
  endedAt: string;
  active: boolean;
}

const emptyDraft: ActivityDraft = {
  name: '',
  activityType: '',
  startedAt: '',
  endedAt: '',
  active: true,
};

function draftFrom(activity: BusinessActivity): ActivityDraft {
  return {
    name: activity.name,
    activityType: activity.activityType,
    startedAt: activity.startedAt ?? '',
    endedAt: activity.endedAt ?? '',
    active: activity.active,
  };
}

export function ActivityManager({ canManage }: { canManage: boolean }) {
  const [activities, setActivities] = useState<BusinessActivity[]>([]);
  const [createDraft, setCreateDraft] = useState(emptyDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await apiRequest<{ activities: BusinessActivity[] }>(
      '/api/business-activities',
    );
    setActivities(result.activities);
  }, []);

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load activities.',
      ),
    );
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/business-activities', {
        method: 'POST',
        body: JSON.stringify(createDraft),
      });
      setCreateDraft(emptyDraft);
      setMessage('Business activity added.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to add activity.',
      );
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editId) return;
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/business-activities', {
        method: 'PATCH',
        body: JSON.stringify({ id: editId, ...editDraft }),
      });
      setEditId(null);
      setMessage('Business activity updated.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to update activity.',
      );
    }
  }

  async function toggle(activity: BusinessActivity) {
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/business-activities', {
        method: 'PATCH',
        body: JSON.stringify({ id: activity.id, active: !activity.active }),
      });
      setMessage(
        `Business activity ${activity.active ? 'deactivated' : 'reactivated'}.`,
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to update activity.',
      );
    }
  }

  return (
    <section
      className="panel reference-panel"
      aria-labelledby="activities-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="activities-heading">Business activities</h2>
          <p>Reusable lines of business for income, expenses, and mileage.</p>
        </div>
        <span className="count-badge">{activities.length}</span>
      </div>

      {canManage ? (
        <form
          className="reference-form"
          onSubmit={(event) => void create(event)}
        >
          <h3>Add activity</h3>
          <label htmlFor="new-activity-name">Name</label>
          <input
            id="new-activity-name"
            required
            maxLength={100}
            value={createDraft.name}
            onChange={(event) =>
              setCreateDraft({ ...createDraft, name: event.target.value })
            }
          />
          <label htmlFor="new-activity-type">Type</label>
          <input
            id="new-activity-type"
            required
            maxLength={50}
            pattern="[A-Za-z][A-Za-z0-9_]*"
            placeholder="PROFESSIONAL_SERVICES"
            value={createDraft.activityType}
            onChange={(event) =>
              setCreateDraft({
                ...createDraft,
                activityType: event.target.value,
              })
            }
          />
          <label htmlFor="new-activity-start">Start date</label>
          <input
            id="new-activity-start"
            type="date"
            value={createDraft.startedAt}
            onChange={(event) =>
              setCreateDraft({ ...createDraft, startedAt: event.target.value })
            }
          />
          <button type="submit">Add activity</button>
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
        {activities.map((activity) => (
          <article className="reference-card" key={activity.id}>
            {editId === activity.id ? (
              <form
                className="reference-form"
                onSubmit={(event) => void save(event)}
              >
                <h3>Edit activity</h3>
                <label htmlFor={`activity-name-${activity.id}`}>Name</label>
                <input
                  id={`activity-name-${activity.id}`}
                  required
                  maxLength={100}
                  value={editDraft.name}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, name: event.target.value })
                  }
                />
                <label htmlFor={`activity-type-${activity.id}`}>Type</label>
                <input
                  id={`activity-type-${activity.id}`}
                  required
                  maxLength={50}
                  pattern="[A-Za-z][A-Za-z0-9_]*"
                  value={editDraft.activityType}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      activityType: event.target.value,
                    })
                  }
                />
                <label htmlFor={`activity-start-${activity.id}`}>
                  Start date
                </label>
                <input
                  id={`activity-start-${activity.id}`}
                  type="date"
                  value={editDraft.startedAt}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      startedAt: event.target.value,
                    })
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
                    <label htmlFor={`activity-end-${activity.id}`}>
                      End date
                    </label>
                    <input
                      id={`activity-end-${activity.id}`}
                      type="date"
                      value={editDraft.endedAt}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          endedAt: event.target.value,
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
                    <h3>{activity.name}</h3>
                    <p>{activity.activityType.replaceAll('_', ' ')}</p>
                  </div>
                  <span
                    className={`status-badge ${activity.active ? 'active' : 'inactive'}`}
                  >
                    {activity.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="record-dates">
                  {activity.startedAt
                    ? `Started ${activity.startedAt}`
                    : 'No start date'}
                  {activity.endedAt ? ` · Ended ${activity.endedAt}` : ''}
                </p>
                {canManage ? (
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditId(activity.id);
                        setEditDraft(draftFrom(activity));
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={
                        activity.active ? 'danger-button' : 'secondary-button'
                      }
                      onClick={() => void toggle(activity)}
                    >
                      {activity.active ? 'Deactivate' : 'Reactivate'}
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
