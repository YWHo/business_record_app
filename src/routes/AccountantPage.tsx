import { Link, useSearchParams } from 'react-router-dom';
import { AccountantEntityCard } from '../components/WorkspacePatterns';
import {
  type BusinessSummary,
  useBusinessDirectory,
} from '../features/business/BusinessDirectoryContext';

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

function plural(value: number, singular: string, multiple = `${singular}s`) {
  return `${value} ${value === 1 ? singular : multiple}`;
}

function entityName(entity: BusinessSummary['currentLegalEntity']) {
  return (
    entity?.legalName || entity?.tradingName || 'Legal entity not configured'
  );
}

export function AccountantPage() {
  const { businesses, error, loading, reload } = useBusinessDirectory();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'business' ? 'business' : 'entity';
  const groups = new Map<
    string,
    {
      entity: BusinessSummary['currentLegalEntity'];
      businesses: BusinessSummary[];
    }
  >();

  for (const business of businesses) {
    const key = business.currentLegalEntity?.id ?? 'unconfigured';
    const group = groups.get(key) ?? {
      entity: business.currentLegalEntity,
      businesses: [],
    };
    group.businesses.push(business);
    groups.set(key, group);
  }

  return (
    <section aria-labelledby="accountant-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Account-level review</span>
          <h1 id="accountant-heading">Accountant view</h1>
          <p>Review records by legal entity or by operating business.</p>
        </div>
      </div>

      <div className="view-switch" role="group" aria-label="Group records">
        <button
          type="button"
          aria-pressed={view === 'entity'}
          className={view === 'entity' ? '' : 'secondary-button'}
          onClick={() => setSearchParams({ view: 'entity' })}
        >
          By legal entity
        </button>
        <button
          type="button"
          aria-pressed={view === 'business'}
          className={view === 'business' ? '' : 'secondary-button'}
          onClick={() => setSearchParams({ view: 'business' })}
        >
          By business
        </button>
      </div>

      {loading ? <p role="status">Loading accountant workspace…</p> : null}
      {error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : null}

      {!loading && !error && view === 'entity' ? (
        <div className="accountant-grid">
          {[...groups.entries()].map(([id, group]) => {
            return (
              <AccountantEntityCard
                key={id}
                entity={group.entity}
                businesses={group.businesses}
              />
            );
          })}
        </div>
      ) : null}

      {!loading && !error && view === 'business' ? (
        <div className="accountant-grid">
          {businesses.map((business) => (
            <article className="panel accountant-group" key={business.id}>
              <div className="section-heading">
                <div>
                  <h2>{business.name}</h2>
                  <p>
                    {entityName(business.currentLegalEntity)}
                    {business.currentLegalEntity
                      ? ` — ${entityTypeLabels[business.currentLegalEntity.entityType]}`
                      : ''}
                  </p>
                </div>
                <Link
                  className="secondary-button"
                  to={`/app/businesses/${business.id}/transactions?review=UNREVIEWED`}
                >
                  Review records
                </Link>
              </div>
              <p className="accountant-totals">
                <strong>
                  {plural(business.awaitingReviewCount, 'item')} awaiting review
                </strong>
                <span>
                  {plural(business.missingReceiptCount, 'missing receipt')}
                </span>
                <span>{plural(business.recordCount, 'record')} total</span>
              </p>
            </article>
          ))}
        </div>
      ) : null}

      {!loading && !error && businesses.length === 0 ? (
        <p className="empty-state">No businesses are available for review.</p>
      ) : null}
    </section>
  );
}
