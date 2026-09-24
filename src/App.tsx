import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AccountShell, BusinessShell } from './components/ShellLayouts';
import { PwaStatus } from './features/pwa/PwaStatus';
import { useAuth } from './features/auth/AuthContext';
import { BusinessDirectoryProvider } from './features/business/BusinessDirectoryContext';
import { AcceptInvitationPage } from './routes/AcceptInvitationPage';
import { BusinessesPage } from './routes/BusinessesPage';
import { DashboardPage } from './routes/DashboardPage';
import { DocumentsPage } from './routes/DocumentsPage';
import { ExportsPage } from './routes/ExportsPage';
import { FuelPage } from './routes/FuelPage';
import { GovernancePage } from './routes/GovernancePage';
import { IncomePage } from './routes/IncomePage';
import { InsurancePage } from './routes/InsurancePage';
import { LoginPage } from './routes/LoginPage';
import { MileagePage } from './routes/MileagePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { RecordsPage } from './routes/RecordsPage';
import { SetupPage } from './routes/SetupPage';
import { TransactionsPage } from './routes/TransactionsPage';
import { UserManagementPage } from './routes/UserManagementPage';
import { VerifyLoginPage } from './routes/VerifyLoginPage';

function WorkspaceGate() {
  const { loading, user } = useAuth();

  if (loading)
    return (
      <main className="auth-page">
        <p role="status">Loading secure workspace…</p>
      </main>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function DirectoryLayout() {
  return <BusinessDirectoryProvider />;
}

export function App() {
  return (
    <>
      <PwaStatus />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-login" element={<VerifyLoginPage />} />
        <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

        <Route element={<WorkspaceGate />}>
          <Route element={<DirectoryLayout />}>
            <Route path="/app" element={<AccountShell />}>
              <Route index element={<Navigate to="businesses" replace />} />
              <Route path="businesses" element={<BusinessesPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="reports" element={<ExportsPage />} />
              <Route path="settings/account" element={<UserManagementPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route
              path="/app/businesses/:businessId"
              element={<BusinessShell />}
            >
              <Route index element={<DashboardPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="expenses" element={<RecordsPage />} />
              <Route path="expenses/fuel" element={<FuelPage />} />
              <Route path="expenses/insurance" element={<InsurancePage />} />
              <Route path="income" element={<IncomePage />} />
              <Route path="mileage" element={<MileagePage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="reports" element={<ExportsPage />} />
              <Route path="settings" element={<SetupPage />} />
              <Route path="governance" element={<GovernancePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/app/businesses" replace />} />
          {[
            '/records',
            '/mileage',
            '/fuel',
            '/insurance',
            '/income',
            '/transactions',
            '/governance',
            '/exports',
            '/setup',
            '/settings/users',
          ].map((path) => (
            <Route
              key={path}
              path={path}
              element={<Navigate to="/app/businesses" replace />}
            />
          ))}
          <Route path="*" element={<Navigate to="/app/businesses" replace />} />
        </Route>
      </Routes>
    </>
  );
}
