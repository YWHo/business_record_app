import { Link } from 'react-router-dom';
import type { BusinessSummary } from '../features/business/BusinessDirectoryContext';

const entityTypeLabels: Record<
  NonNullable<BusinessSummary['currentLegalEntity']>['entityType'],
  string
> = {
  SOLE_TRADER: 'Sole trader',
  LIMITED_COMPANY: 'Limited company',
  PARTNERSHIP: 'Partnership',
  TRUST: 'Trust',
  OTHER: 'Other entity',
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function updatedLabel(value: string | null): string {
  if (!value) return 'No records yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Update date unavailable';
  return `Updated ${new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)}`;
}

export function BusinessCard({ business }: { business: BusinessSummary }) {
  const entity = business.currentLegalEntity;
  const entityName = entity
    ? entity.legalName || entity.tradingName || 'Legal entity needs review'
    : 'Legal entity not configured';
  const description =
    business.description ||
    (business.businessType
      ? titleCase(business.businessType)
      : 'Business details');
  const needsAttention =
    !entity || entity.attributionReviewRequired || entity.status !== 'ACTIVE';

  return (
    <article
      aria-labelledby={`business-${business.id}-heading`}
      className={`business-card${needsAttention ? ' needs-attention' : ''}`}
    >
      <Link
        aria-label={`Open ${business.name}`}
        to={`/app/businesses/${business.id}`}
      >
        <header className="business-card-heading">
          <span aria-hidden="true" className="business-avatar">
            {initials(business.name)}
          </span>
          <span>
            <h2 id={`business-${business.id}-heading`}>{business.name}</h2>
            <small>{description}</small>
          </span>
          <span aria-hidden="true" className="business-card-arrow">
            →
          </span>
        </header>

        <div className="business-card-entity">
          <span>Current legal entity</span>
          <strong>{entityName}</strong>
          <small>
            {entity ? entityTypeLabels[entity.entityType] : 'Needs attention'}
          </small>
        </div>

        <footer className="business-card-summary">
          <span>
            {business.recordCount}{' '}
            {business.recordCount === 1 ? 'record' : 'records'}
          </span>
          <span>{updatedLabel(business.lastRecordUpdatedAt)}</span>
          {business.status !== 'ACTIVE' ? (
            <span className="status-badge inactive">Inactive</span>
          ) : null}
        </footer>
      </Link>
    </article>
  );
}
