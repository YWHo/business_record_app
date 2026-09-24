import { BusinessCard } from '../components/BusinessCard';
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
        <div className="business-card-grid">
          {businesses.map((business) => (
            <BusinessCard business={business} key={business.id} />
          ))}
          {!businesses.length ? (
            <p>No businesses are available for this account.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
