import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="empty-state">
      <div>
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <Link to="/">Return to dashboard</Link>
      </div>
    </section>
  );
}
