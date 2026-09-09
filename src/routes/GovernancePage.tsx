import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest, useAuth } from '../features/auth/AuthContext';

interface TrashItem {
  id: string;
  recordType: 'EXPENSE' | 'INCOME' | 'WORK_SESSION';
  subtype: string;
  label: string;
  recordDate: string;
  deletedAt: string;
  retentionUntil: string;
  purgeEligibleAt: string;
  purgeEligible: boolean;
  purgePending: boolean;
}
interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  activityName: string | null;
  summary: string;
  createdAt: string;
  userEmail: string;
  userId: string;
  businessActivityId: string | null;
}
interface SavedAuditFilter {
  id: string;
  name: string;
  criteria: typeof emptyAuditFilters;
}
interface RetentionSettings {
  retentionTaxYears: number;
  taxYearEndMonth: number;
  taxYearEndDay: number;
  backupReminderDays: number;
  updatedAt: string;
}
const emptyAuditFilters = {
  userId: '',
  activityId: '',
  action: '',
  entityType: '',
  dateFrom: '',
  dateTo: '',
};

export function GovernancePage() {
  const { user } = useAuth();
  const [trash, setTrash] = useState<TrashItem[]>([]),
    [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]),
    [savedFilters, setSavedFilters] = useState<SavedAuditFilter[]>([]),
    [filterName, setFilterName] = useState(''),
    [settings, setSettings] = useState<RetentionSettings | null>(null),
    [filters, setFilters] = useState(emptyAuditFilters),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const loadAudit = useCallback(async (criteria: typeof emptyAuditFilters) => {
    const query = new URLSearchParams();
    Object.entries(criteria).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const result = await apiRequest<{ auditEvents: AuditEvent[] }>(
      `/api/audit-log?${query}`,
    );
    setAuditEvents(result.auditEvents);
  }, []);
  const load = useCallback(
    async (criteria: typeof emptyAuditFilters) => {
      const [trashResult, settingsResult, , savedResult] = await Promise.all([
        apiRequest<{ trash: TrashItem[] }>('/api/trash'),
        apiRequest<{ retentionSettings: RetentionSettings }>(
          '/api/retention-settings',
        ),
        loadAudit(criteria),
        apiRequest<{ savedFilters: SavedAuditFilter[] }>(
          '/api/saved-filters?filterType=AUDIT',
        ),
      ]);
      setTrash(trashResult.trash);
      setSettings(settingsResult.retentionSettings);
      setSavedFilters(savedResult.savedFilters);
    },
    [loadAudit],
  );
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(emptyAuditFilters).catch((caught: unknown) =>
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load governance records.',
      ),
    );
  }, [load]);

  async function restore(item: TrashItem) {
    setError('');
    await apiRequest('/api/trash/restore', {
      method: 'POST',
      body: JSON.stringify({ recordType: item.recordType, recordId: item.id }),
    });
    setMessage('Record restored.');
    await load(filters);
  }
  async function purge(item: TrashItem) {
    if (
      !window.confirm(
        'Permanently delete this record and its documents? This cannot be undone.',
      )
    )
      return;
    setError('');
    await apiRequest('/api/trash', {
      method: 'DELETE',
      body: JSON.stringify({
        recordType: item.recordType,
        recordId: item.id,
        confirmation: 'PERMANENTLY DELETE',
      }),
    });
    setMessage('Eligible record permanently purged.');
    await load(filters);
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError('');
    try {
      const result = await apiRequest<{ retentionSettings: RetentionSettings }>(
        '/api/retention-settings',
        { method: 'PATCH', body: JSON.stringify(settings) },
      );
      setSettings(result.retentionSettings);
      setMessage('Retention settings saved for future record calculations.');
      await loadAudit(filters);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save retention settings.',
      );
    }
  }
  async function saveAuditFilter(event: FormEvent) {
    event.preventDefault();
    await apiRequest('/api/saved-filters', {
      method: 'POST',
      body: JSON.stringify({
        name: filterName,
        filterType: 'AUDIT',
        criteria: filters,
      }),
    });
    setFilterName('');
    setMessage('Audit filter saved.');
    await load(filters);
  }
  async function applyAuditFilter(item: SavedAuditFilter) {
    const criteria = { ...emptyAuditFilters, ...item.criteria };
    setFilters(criteria);
    await loadAudit(criteria);
  }
  async function removeAuditFilter(id: string) {
    await apiRequest('/api/saved-filters', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await load(filters);
  }
  const numberField =
    (key: keyof RetentionSettings) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setSettings(
        settings
          ? { ...settings, [key]: Number(event.target.value) }
          : settings,
      );

  return (
    <section aria-labelledby="governance-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Records governance</span>
          <h1 id="governance-heading">Audit, trash, and retention</h1>
          <p>
            Recover deleted records during retention and review immutable
            business history.
          </p>
        </div>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="notice success" role="status">
          {message}
        </p>
      ) : null}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Trash</h2>
            <p>
              Permanent deletion stays blocked until the displayed eligibility
              date.
            </p>
          </div>
          <span className="count-badge">{trash.length}</span>
        </div>
        <div className="record-list">
          {trash.length ? (
            trash.map((item) => (
              <article
                className="record-card"
                key={`${item.recordType}-${item.id}`}
              >
                <div className="record-summary">
                  <div>
                    <span className="eyebrow">
                      {item.recordType} · {item.subtype}
                    </span>
                    <h3>{item.label}</h3>
                    <p>
                      {item.recordDate} · trashed{' '}
                      {new Date(item.deletedAt).toLocaleDateString('en-NZ')}
                    </p>
                  </div>
                </div>
                <p>
                  Retain through{' '}
                  {new Date(item.retentionUntil).toLocaleDateString('en-NZ')}.
                  Purge eligible{' '}
                  {new Date(item.purgeEligibleAt).toLocaleDateString('en-NZ')}.
                </p>
                {item.purgePending ? (
                  <p className="notice error">Purge is pending completion.</p>
                ) : null}
                {user?.role === 'OWNER' ? (
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={item.purgePending}
                      onClick={() => void restore(item)}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={!item.purgeEligible}
                      onClick={() => void purge(item)}
                    >
                      Permanently purge
                    </button>
                  </div>
                ) : (
                  <p>Only the owner can restore or purge records.</p>
                )}
              </article>
            ))
          ) : (
            <p>Trash is empty.</p>
          )}
        </div>
      </section>
      {settings ? (
        <section className="panel">
          <h2>Retention policy</h2>
          <p>
            Policy changes apply to future record calculations and never shorten
            dates already stored on evidence.
          </p>
          <form
            className="work-session-form"
            onSubmit={(event) => void saveSettings(event)}
          >
            <div className="form-pair">
              <label>
                Retention tax years
                <input
                  type="number"
                  min="7"
                  max="100"
                  disabled={user?.role !== 'OWNER'}
                  value={settings.retentionTaxYears}
                  onChange={numberField('retentionTaxYears')}
                />
              </label>
              <label>
                Backup reminder days
                <input
                  type="number"
                  min="1"
                  max="366"
                  disabled={user?.role !== 'OWNER'}
                  value={settings.backupReminderDays}
                  onChange={numberField('backupReminderDays')}
                />
              </label>
            </div>
            <div className="form-pair">
              <label>
                Tax year end month
                <input
                  type="number"
                  min="1"
                  max="12"
                  disabled={user?.role !== 'OWNER'}
                  value={settings.taxYearEndMonth}
                  onChange={numberField('taxYearEndMonth')}
                />
              </label>
              <label>
                Tax year end day
                <input
                  type="number"
                  min="1"
                  max="31"
                  disabled={user?.role !== 'OWNER'}
                  value={settings.taxYearEndDay}
                  onChange={numberField('taxYearEndDay')}
                />
              </label>
            </div>
            {user?.role === 'OWNER' ? (
              <button>Save policy</button>
            ) : (
              <p>Only the owner can change retention rules.</p>
            )}
          </form>
        </section>
      ) : null}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Audit log</h2>
            <p>Read-only meaningful changes, newest first.</p>
          </div>
          <span className="count-badge">{auditEvents.length}</span>
        </div>
        <form
          className="work-session-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadAudit(filters);
          }}
        >
          <div className="form-pair">
            <label>
              User
              <select
                value={filters.userId}
                onChange={(event) =>
                  setFilters({ ...filters, userId: event.target.value })
                }
              >
                <option value="">All users</option>
                {[
                  ...new Map(
                    auditEvents.map((item) => [item.userId, item.userEmail]),
                  ).entries(),
                ].map(([id, email]) => (
                  <option key={id} value={id}>
                    {email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Business activity
              <select
                value={filters.activityId}
                onChange={(event) =>
                  setFilters({ ...filters, activityId: event.target.value })
                }
              >
                <option value="">All activities</option>
                {[
                  ...new Map(
                    auditEvents
                      .filter((item) => item.businessActivityId)
                      .map((item) => [
                        item.businessActivityId!,
                        item.activityName ?? item.businessActivityId!,
                      ]),
                  ).entries(),
                ].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-pair">
            <label>
              Action
              <input
                value={filters.action}
                onChange={(event) =>
                  setFilters({ ...filters, action: event.target.value })
                }
              />
            </label>
            <label>
              Entity type
              <input
                value={filters.entityType}
                onChange={(event) =>
                  setFilters({ ...filters, entityType: event.target.value })
                }
              />
            </label>
          </div>
          <div className="form-pair">
            <label>
              From
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  setFilters({ ...filters, dateFrom: event.target.value })
                }
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) =>
                  setFilters({ ...filters, dateTo: event.target.value })
                }
              />
            </label>
          </div>
          <button>Filter audit log</button>
        </form>
        <form
          className="inline-form saved-filter-form"
          onSubmit={(event) => void saveAuditFilter(event)}
        >
          <label>
            Save current audit filters
            <input
              required
              maxLength={100}
              value={filterName}
              onChange={(event) => setFilterName(event.target.value)}
            />
          </label>
          <button>Save filter</button>
        </form>
        <div className="saved-filter-list">
          {savedFilters.map((item) => (
            <div key={item.id}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void applyAuditFilter(item)}
              >
                {item.name}
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => void removeAuditFilter(item.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="record-list">
          {auditEvents.map((event) => (
            <article className="reference-card" key={event.id}>
              <strong>{event.summary}</strong>
              <p>
                {event.action} · {event.entityType} ·{' '}
                {event.activityName ?? 'No activity'}
              </p>
              <small>
                {event.userEmail} ·{' '}
                {new Date(event.createdAt).toLocaleString('en-NZ')}
              </small>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
