import { Link } from '../lib/workspaceRouting';

export function NotFoundPage() {
  return (
    <section className="empty-state">
      <div>
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <Link to="/app/businesses">Return to My businesses</Link>
      </div>
    </section>
  );
}
