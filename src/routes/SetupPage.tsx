import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { ActivityManager } from '../features/setup/ActivityManager';
import { VehicleManager } from '../features/setup/VehicleManager';
import { CategoryManager } from '../features/setup/CategoryManager';
import { ClientManager } from '../features/setup/ClientManager';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';

interface BusinessDetailsRecord {
  id: string;
  name: string;
  description: string | null;
  businessType: string | null;
  defaultCurrency: string;
}

interface LegalEntityRecord {
  id: string;
  entityType:
    'SOLE_TRADER' | 'LIMITED_COMPANY' | 'PARTNERSHIP' | 'TRUST' | 'OTHER';
  legalName: string | null;
  tradingName: string | null;
}

interface OperatingPeriod {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  legalEntity: LegalEntityRecord | null;
}

interface BusinessDetailsResponse {
  business: BusinessDetailsRecord;
  operatingPeriods: OperatingPeriod[];
  currentLegalEntity: LegalEntityRecord | null;
}

const entityTypeLabels: Record<LegalEntityRecord['entityType'], string> = {
  SOLE_TRADER: 'Sole trader',
  LIMITED_COMPANY: 'Limited company',
  PARTNERSHIP: 'Partnership',
  TRUST: 'Trust',
  OTHER: 'Other',
};

function businessPath(businessId: string, suffix: string) {
  return `/app/businesses/${businessId}/settings/${suffix}`;
}

function useSettingsPermission() {
  const { user } = useAuth();
  return user?.role === 'OWNER';
}

function ReadOnlyNotice() {
  return (
    <p className="notice">
      Accountants can view these business settings. Only the owner can change
      them.
    </p>
  );
}

export function BusinessSettingsLayout() {
  const { businessId = '' } = useParams();
  const canManage = useSettingsPermission();
  const links = [
    ['details', 'Details'],
    ['legal-entity', 'Legal entity'],
    ['activities', 'Activities'],
    ['vehicles', 'Vehicles'],
    ['categories', 'Categories'],
    ['clients', 'Clients'],
    ['members', 'Members'],
  ] as const;

  return (
    <section aria-labelledby="business-settings-heading">
      <div className="page-heading settings-heading">
        <div>
          <span className="eyebrow">Business settings</span>
          <h1 id="business-settings-heading">Business settings</h1>
          <p>Manage one part of this business at a time.</p>
        </div>
      </div>
      <nav className="settings-navigation" aria-label="Business settings">
        {links.map(([suffix, label]) => (
          <NavLink key={suffix} to={businessPath(businessId, suffix)}>
            {label}
          </NavLink>
        ))}
      </nav>
      {!canManage ? <ReadOnlyNotice /> : null}
      <Outlet />
    </section>
  );
}

export function BusinessDetailsSettingsPage() {
  const { businessId = '' } = useParams();
  const canManage = useSettingsPermission();
  const { reload } = useBusinessDirectory();
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    defaultCurrency: 'NZD',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await apiRequest<BusinessDetailsResponse>(
        `/api/businesses/${businessId}`,
      );
      setDraft({
        name: result.business.name,
        description: result.business.description ?? '',
        defaultCurrency: result.business.defaultCurrency,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load business details.',
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

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/api/businesses/${businessId}`, {
        method: 'PATCH',
        body: JSON.stringify(draft),
      });
      setMessage('Business details saved.');
      await Promise.all([load(), reload()]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save business details.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p role="status">Loading business details…</p>;

  return (
    <section className="panel settings-panel" aria-labelledby="details-heading">
      <div className="section-heading">
        <div>
          <h2 id="details-heading">Details</h2>
          <p>Basic information used throughout this business workspace.</p>
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
      <form className="settings-form" onSubmit={(event) => void save(event)}>
        <label htmlFor="business-name">Business name</label>
        <input
          id="business-name"
          required
          maxLength={100}
          disabled={!canManage}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <label htmlFor="business-description">Description (optional)</label>
        <textarea
          id="business-description"
          maxLength={500}
          disabled={!canManage}
          value={draft.description}
          onChange={(event) =>
            setDraft({ ...draft, description: event.target.value })
          }
        />
        <label htmlFor="business-currency">Default currency</label>
        <input
          id="business-currency"
          required
          minLength={3}
          maxLength={3}
          pattern="[A-Za-z]{3}"
          disabled={!canManage}
          value={draft.defaultCurrency}
          onChange={(event) =>
            setDraft({
              ...draft,
              defaultCurrency: event.target.value.toUpperCase(),
            })
          }
        />
        {canManage ? (
          <div className="button-row">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function entityName(entity: LegalEntityRecord | null) {
  return entity?.tradingName ?? entity?.legalName ?? 'Entity unavailable';
}

export function LegalEntitySettingsPage() {
  const { businessId = '' } = useParams();
  const [periods, setPeriods] = useState<OperatingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest<BusinessDetailsResponse>(`/api/businesses/${businessId}`)
      .then((result) => {
        if (active) setPeriods(result.operatingPeriods);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load operating periods.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [businessId]);

  return (
    <section
      className="panel settings-panel"
      aria-labelledby="legal-entity-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="legal-entity-heading">Legal entity</h2>
          <p>View which legal entity operated this business over time.</p>
        </div>
      </div>
      <p className="notice">
        When a business changes legal entity, a new operating period is created.
        Historical records remain with the original entity and are not changed.
      </p>
      {loading ? <p role="status">Loading operating periods…</p> : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error ? (
        <div className="table-wrap">
          <table className="responsive-record-table">
            <caption>Operating periods</caption>
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Legal entity</th>
                <th scope="col">Entity type</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.id}>
                  <td data-label="From">{formatDate(period.effectiveFrom)}</td>
                  <td data-label="To">
                    {period.effectiveTo
                      ? formatDate(period.effectiveTo)
                      : 'Present'}
                  </td>
                  <td data-label="Legal entity">
                    {entityName(period.legalEntity)}
                  </td>
                  <td data-label="Entity type">
                    {period.legalEntity
                      ? entityTypeLabels[period.legalEntity.entityType]
                      : 'Unavailable'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!periods.length ? <p>No operating periods are available.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function ReferenceSettingsPage({ children }: { children: ReactNode }) {
  return <div className="settings-reference-page">{children}</div>;
}

export function ActivitiesSettingsPage() {
  return (
    <ReferenceSettingsPage>
      <ActivityManager canManage={useSettingsPermission()} />
    </ReferenceSettingsPage>
  );
}

export function VehiclesSettingsPage() {
  return (
    <ReferenceSettingsPage>
      <VehicleManager canManage={useSettingsPermission()} />
    </ReferenceSettingsPage>
  );
}

export function CategoriesSettingsPage() {
  return (
    <ReferenceSettingsPage>
      <CategoryManager canManage={useSettingsPermission()} />
    </ReferenceSettingsPage>
  );
}

export function ClientsSettingsPage() {
  return (
    <ReferenceSettingsPage>
      <ClientManager canManage={useSettingsPermission()} />
    </ReferenceSettingsPage>
  );
}

export function MembersSettingsPage() {
  const { configuration, user } = useAuth();
  const canOpenAccountSettings =
    user?.role === 'OWNER' && !configuration?.demoHelper;
  return (
    <section className="panel settings-panel" aria-labelledby="members-heading">
      <div className="section-heading">
        <div>
          <h2 id="members-heading">Members</h2>
          <p>
            Member access currently applies to every business in this private
            account.
          </p>
        </div>
      </div>
      {canOpenAccountSettings ? (
        <Link className="button-link" to="/app/settings/account">
          Manage account members
        </Link>
      ) : (
        <p>Only the account owner can manage members.</p>
      )}
    </section>
  );
}
