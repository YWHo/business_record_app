import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FormError } from '../components/FormError';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';

type EntityType =
  'SOLE_TRADER' | 'LIMITED_COMPANY' | 'PARTNERSHIP' | 'TRUST' | 'OTHER';

interface LegalEntity {
  id: string;
  entityType: EntityType;
  legalName: string | null;
  tradingName: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

interface BusinessPeriodDetails {
  business: { id: string; name: string };
  currentLegalEntity: LegalEntity | null;
}

const entityTypeLabels: Record<EntityType, string> = {
  SOLE_TRADER: 'Sole trader',
  LIMITED_COMPANY: 'Limited company',
  PARTNERSHIP: 'Partnership',
  TRUST: 'Trust',
  OTHER: 'Other',
};

function entityName(entity: LegalEntity | null) {
  return entity?.legalName ?? entity?.tradingName ?? 'Entity unavailable';
}

function entityLabel(entity: LegalEntity | null) {
  return entity
    ? `${entityName(entity)} — ${entityTypeLabels[entity.entityType]}`
    : 'Entity unavailable';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function LegalEntityChangePage() {
  const { businessId = '' } = useParams();
  const { user } = useAuth();
  const { reload } = useBusinessDirectory();
  const navigate = useNavigate();
  const [details, setDetails] = useState<BusinessPeriodDetails | null>(null);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [step, setStep] = useState(1);
  const [legalEntityId, setLegalEntityId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const settingsPath = `/app/businesses/${businessId}/settings/legal-entity`;

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<BusinessPeriodDetails>(`/api/businesses/${businessId}`),
      apiRequest<{ legalEntities: LegalEntity[] }>('/api/legal-entities'),
    ])
      .then(([businessDetails, legalEntityResult]) => {
        if (!active) return;
        setDetails(businessDetails);
        setEntities(legalEntityResult.legalEntities);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load legal entities.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [businessId]);

  const availableEntities = useMemo(
    () =>
      entities.filter(
        (entity) =>
          entity.status === 'ACTIVE' &&
          entity.id !== details?.currentLegalEntity?.id,
      ),
    [details?.currentLegalEntity?.id, entities],
  );
  const selectedEntity =
    entities.find((entity) => entity.id === legalEntityId) ?? null;

  function continueFromDetails(event: FormEvent) {
    event.preventDefault();
    if (!legalEntityId || !effectiveFrom) return;
    setStep(2);
  }

  async function confirmChange() {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/businesses/${businessId}/legal-entity-periods`, {
        method: 'POST',
        body: JSON.stringify({ legalEntityId, effectiveFrom, notes }),
      });
      await reload();
      void navigate(settingsPath, {
        replace: true,
        state: { message: 'Legal-entity operating period added.' },
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to add the operating period.',
      );
      setSaving(false);
    }
  }

  if (user?.role !== 'OWNER')
    return (
      <section className="panel settings-panel" role="alert">
        <h2>Owner access required</h2>
        <p>Only the account owner can change a business legal entity.</p>
        <Link to={settingsPath}>Back to legal entity</Link>
      </section>
    );
  if (loading) return <p role="status">Loading legal entities…</p>;

  return (
    <section
      className="panel settings-panel legal-entity-change"
      aria-labelledby="change-entity-heading"
    >
      <UnsavedChangesGuard
        when={
          !saving && Boolean(legalEntityId || effectiveFrom || notes.trim())
        }
      />
      <div className="section-heading">
        <div>
          <h2 id="change-entity-heading">Change legal entity</h2>
          <p>Create a new operating period for this business.</p>
        </div>
        <Link to={settingsPath}>Back to legal entity</Link>
      </div>

      <ol className="workflow-steps" aria-label="Change legal entity progress">
        {['Details', 'Transfer information', 'Confirm'].map((label, index) => (
          <li
            className={step === index + 1 ? 'current' : undefined}
            aria-current={step === index + 1 ? 'step' : undefined}
            key={label}
          >
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <FormError message={error} />

      {step === 1 ? (
        <form
          className="settings-form"
          onSubmit={(event) => continueFromDetails(event)}
        >
          <h3>Details</h3>
          <label htmlFor="new-legal-entity">New legal entity</label>
          <select
            id="new-legal-entity"
            required
            value={legalEntityId}
            onChange={(event) => setLegalEntityId(event.target.value)}
          >
            <option value="">Select a legal entity</option>
            {availableEntities.map((entity) => (
              <option value={entity.id} key={entity.id}>
                {entityLabel(entity)}
              </option>
            ))}
          </select>
          {!availableEntities.length ? (
            <p className="notice">
              No other active legal entity is available for this account.
            </p>
          ) : null}
          <label htmlFor="entity-effective-from">Effective from</label>
          <input
            id="entity-effective-from"
            type="date"
            required
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
          <div className="button-row">
            <Link className="secondary-button button-link" to={settingsPath}>
              Cancel
            </Link>
            <button type="submit" disabled={!availableEntities.length}>
              Continue
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            setStep(3);
          }}
        >
          <h3>Transfer information</h3>
          <p className="notice">
            This creates an accounting boundary only. It does not transfer
            assets, balances, receivables, payables, GST registrations, or legal
            ownership records.
          </p>
          <label htmlFor="entity-change-notes">Notes (optional)</label>
          <textarea
            id="entity-change-notes"
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Reason or reference for this change"
          />
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button type="submit">Continue</button>
          </div>
        </form>
      ) : null}

      {step === 3 ? (
        <div className="confirmation-panel">
          <h3>Confirm</h3>
          <dl className="confirmation-summary">
            <div>
              <dt>Business</dt>
              <dd>{details?.business.name}</dd>
            </div>
            <div>
              <dt>Current entity</dt>
              <dd>{entityLabel(details?.currentLegalEntity ?? null)}</dd>
            </div>
            <div>
              <dt>New entity</dt>
              <dd>{entityLabel(selectedEntity)}</dd>
            </div>
            <div>
              <dt>Effective</dt>
              <dd>{formatDate(effectiveFrom)}</dd>
            </div>
            {notes ? (
              <div>
                <dt>Notes</dt>
                <dd>{notes}</dd>
              </div>
            ) : null}
          </dl>
          <p className="notice">
            Records dated before this boundary remain with the current legal
            entity and are not changed.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void confirmChange()}
            >
              {saving ? 'Saving…' : 'Confirm change'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
