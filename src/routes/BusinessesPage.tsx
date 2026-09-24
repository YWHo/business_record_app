import { Link } from 'react-router-dom';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';

export function BusinessesPage() {
  const { businesses, error, loading, reload } = useBusinessDirectory();

  return (
    <section aria-labelledby="businesses-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Account home</span>
          <h1 id="businesses-heading">My businesses</h1>
          <p>Choose a business to enter its bookkeeping workspace.</p>
        </div>
      </div>
      {loading ? <p role="status">Loading businesses…</p> : null}
      {error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : null}
      {!loading && !error ? (
        <div className="business-entry-list">
          {businesses.map((business) => (
            <Link key={business.id} to={`/app/businesses/${business.id}`}>
              <span>
                <strong>{business.name}</strong>
                {business.description ? (
                  <small>{business.description}</small>
                ) : null}
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
          {!businesses.length ? (
            <p>No businesses are available for this account.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
