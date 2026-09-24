import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export interface ShellNavigationItem {
  end?: boolean;
  icon: string;
  label: string;
  subItem?: boolean;
  to: string;
}

interface AppShellProps {
  contextControl?: ReactNode;
  contextLabel: string;
  mobileNavigation: ShellNavigationItem[];
  navigation: ShellNavigationItem[];
  secondaryNavigation?: ShellNavigationItem[];
}

function NavigationLinks({ items }: { items: ShellNavigationItem[] }) {
  return items.map((item) => (
    <NavLink
      end={item.end}
      key={item.to}
      to={item.to}
      className={({ isActive }) =>
        [isActive ? 'active' : '', item.subItem ? 'sub-item' : '']
          .filter(Boolean)
          .join(' ') || undefined
      }
    >
      <span aria-hidden="true" className="nav-icon">
        {item.icon}
      </span>
      <span>{item.label}</span>
    </NavLink>
  ));
}

function UserMenu() {
  const { logout, user } = useAuth();
  const initials = user?.email.slice(0, 2).toUpperCase() ?? 'ME';

  return (
    <details className="user-menu">
      <summary aria-label="Open account menu">
        <span aria-hidden="true">{initials}</span>
      </summary>
      <div className="user-menu-panel">
        <strong>{user?.email}</strong>
        <button type="button" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    </details>
  );
}

export function AppShell({
  contextControl,
  contextLabel,
  mobileNavigation,
  navigation,
  secondaryNavigation = [],
}: AppShellProps) {
  const { configuration, resetDemo } = useAuth();

  return (
    <div className="app-shell">
      <header className="shell-topbar">
        <Link
          aria-label="Business Records home"
          className="brand"
          to="/app/businesses"
        >
          <span aria-hidden="true" className="brand-mark">
            BR
          </span>
          <span>Business Records</span>
        </Link>
        {contextControl ? (
          <div className="shell-context-control">{contextControl}</div>
        ) : null}
        {configuration?.environment === 'demo' ? (
          <button
            type="button"
            className="demo-reset-quick secondary-button"
            title="Clear changes stored only in this browser and restore the synthetic demo"
            onClick={() => void resetDemo()}
          >
            Reset demo data
          </button>
        ) : null}
        <UserMenu />
      </header>

      <div className="shell-grid">
        <aside className="shell-sidebar">
          <p className="sidebar-context">{contextLabel}</p>
          <nav aria-label={`${contextLabel} navigation`}>
            <NavigationLinks items={navigation} />
          </nav>
          {secondaryNavigation.length ? (
            <nav
              aria-label={`${contextLabel} settings`}
              className="sidebar-secondary"
            >
              <NavigationLinks items={secondaryNavigation} />
            </nav>
          ) : null}
        </aside>

        <main className="shell-main">
          {configuration?.environment === 'demo' ? (
            <p className="demo-banner">
              <strong>Demo</strong> · Changes are saved only in this browser
            </p>
          ) : null}
          <div className="page-content">
            <Outlet />
          </div>
        </main>
      </div>

      <nav aria-label="Mobile navigation" className="mobile-bottom-nav">
        <NavigationLinks items={mobileNavigation} />
      </nav>
    </div>
  );
}
