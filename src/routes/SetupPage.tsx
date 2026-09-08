import { ActivityManager } from '../features/setup/ActivityManager';
import { VehicleManager } from '../features/setup/VehicleManager';
import { CategoryManager } from '../features/setup/CategoryManager';
import { ClientManager } from '../features/setup/ClientManager';
import { useAuth } from '../features/auth/AuthContext';

export function SetupPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'OWNER';

  return (
    <section aria-labelledby="setup-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Reference data</span>
          <h1 id="setup-heading">
            Activities, vehicles, categories, and clients
          </h1>
          <p>
            Keep reusable business context current without removing historical
            links.
          </p>
        </div>
      </div>
      {!canManage ? (
        <p className="notice">
          Accountants can view this setup. Only the owner can change it.
        </p>
      ) : null}
      <div className="reference-grid">
        <ActivityManager canManage={canManage} />
        <VehicleManager canManage={canManage} />
        <CategoryManager canManage={canManage} />
        <ClientManager canManage={canManage} />
      </div>
    </section>
  );
}
