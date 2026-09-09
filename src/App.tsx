import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext';
import { AcceptInvitationPage } from './routes/AcceptInvitationPage';
import { DashboardPage } from './routes/DashboardPage';
import { LoginPage } from './routes/LoginPage';
import { MileagePage } from './routes/MileagePage';
import { FuelPage } from './routes/FuelPage';
import { InsurancePage } from './routes/InsurancePage';
import { IncomePage } from './routes/IncomePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { RecordsPage } from './routes/RecordsPage';
import { SetupPage } from './routes/SetupPage';
import { UserManagementPage } from './routes/UserManagementPage';
import { TransactionsPage } from './routes/TransactionsPage';
import { GovernancePage } from './routes/GovernancePage';
import { VerifyLoginPage } from './routes/VerifyLoginPage';

function WorkspaceLayout() {
  const { loading, logout, user } = useAuth();

  if (loading) {
    return (
      <main className="auth-page">
        <p role="status">Loading secure workspace…</p>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const navItems = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/records', label: 'Records', end: false },
    { to: '/mileage', label: 'Mileage', end: false },
    { to: '/fuel', label: 'Fuel', end: false },
    { to: '/insurance', label: 'Insurance', end: false },
    { to: '/income', label: 'Income', end: false },
    { to: '/transactions', label: 'Transactions', end: false },
    { to: '/governance', label: 'Governance', end: false },
    { to: '/setup', label: 'Setup', end: false },
    ...(user.role === 'OWNER'
      ? [{ to: '/settings/users', label: 'Users', end: false }]
      : []),
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">Private workspace</span>
          <strong>Business Records</strong>
        </div>
        <div className="account-summary">
          <span>{user.email}</span>
          <button
            type="button"
            className="header-button"
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav aria-label="Primary navigation" className="primary-nav">
        {navItems.map((item) => (
          <NavLink
            end={item.end}
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify-login" element={<VerifyLoginPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
      <Route element={<WorkspaceLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/mileage" element={<MileagePage />} />
        <Route path="/fuel" element={<FuelPage />} />
        <Route path="/insurance" element={<InsurancePage />} />
        <Route path="/income" element={<IncomePage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/governance" element={<GovernancePage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/settings/users" element={<UserManagementPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
