import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { AccountShell, BusinessShell } from './components/ShellLayouts';
import { PwaStatus } from './features/pwa/PwaStatus';
import { useAuth } from './features/auth/AuthContext';
import { BusinessDirectoryProvider } from './features/business/BusinessDirectoryContext';
import { AcceptInvitationPage } from './routes/AcceptInvitationPage';
import { AccountantPage } from './routes/AccountantPage';
import { BusinessesPage } from './routes/BusinessesPage';
import { DashboardPage } from './routes/DashboardPage';
import { DocumentsPage } from './routes/DocumentsPage';
import { ExpenseDetailPage } from './routes/ExpenseDetailPage';
import { ExpenseFormPage } from './routes/ExpenseFormPage';
import { ExpensesPage } from './routes/ExpensesPage';
import { ExportsPage } from './routes/ExportsPage';
import { GovernancePage } from './routes/GovernancePage';
import { IncomeDetailPage } from './routes/IncomeDetailPage';
import { IncomeFormPage } from './routes/IncomeFormPage';
import { IncomeListPage } from './routes/IncomeListPage';
import { LoginPage } from './routes/LoginPage';
import { LegalEntityChangePage } from './routes/LegalEntityChangePage';
import { MileageListPage } from './routes/MileageListPage';
import { AccountMorePage, BusinessMorePage } from './routes/MorePage';
import { NotFoundPage } from './routes/NotFoundPage';
import {
  ActivitiesSettingsPage,
  BusinessDetailsSettingsPage,
  BusinessSettingsLayout,
  CategoriesSettingsPage,
  ClientsSettingsPage,
  LegalEntitySettingsPage,
  MembersSettingsPage,
  VehiclesSettingsPage,
} from './routes/SetupPage';
import { TransactionsPage } from './routes/TransactionsPage';
import { UserManagementPage } from './routes/UserManagementPage';
import { VerifyLoginPage } from './routes/VerifyLoginPage';
import { WorkSessionDetailPage } from './routes/WorkSessionDetailPage';
import { WorkSessionFormPage } from './routes/WorkSessionFormPage';

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

function LegacyExpenseFilterRedirect({ type }: { type: string }) {
  const { businessId = '' } = useParams();
  return (
    <Navigate
      replace
      to={`/app/businesses/${businessId}/expenses?type=${type}`}
    />
  );
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
              <Route path="accountant" element={<AccountantPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="reports" element={<ExportsPage />} />
              <Route path="more" element={<AccountMorePage />} />
              <Route path="settings/account" element={<UserManagementPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route
              path="/app/businesses/:businessId"
              element={<BusinessShell />}
            >
              <Route index element={<DashboardPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route
                path="expenses/new"
                element={<ExpenseFormPage mode="create" />}
              />
              <Route
                path="expenses/:expenseId"
                element={<ExpenseDetailPage />}
              />
              <Route
                path="expenses/:expenseId/edit"
                element={<ExpenseFormPage mode="edit" />}
              />
              <Route
                path="expenses/fuel"
                element={<LegacyExpenseFilterRedirect type="FUEL" />}
              />
              <Route
                path="expenses/insurance"
                element={<LegacyExpenseFilterRedirect type="INSURANCE" />}
              />
              <Route path="income" element={<IncomeListPage />} />
              <Route
                path="income/new"
                element={<IncomeFormPage mode="create" />}
              />
              <Route path="income/:incomeId" element={<IncomeDetailPage />} />
              <Route
                path="income/:incomeId/edit"
                element={<IncomeFormPage mode="edit" />}
              />
              <Route path="mileage" element={<MileageListPage />} />
              <Route
                path="mileage/new"
                element={<WorkSessionFormPage mode="create" />}
              />
              <Route
                path="mileage/:sessionId"
                element={<WorkSessionDetailPage />}
              />
              <Route
                path="mileage/:sessionId/edit"
                element={<WorkSessionFormPage mode="edit" />}
              />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="reports" element={<ExportsPage />} />
              <Route path="more" element={<BusinessMorePage />} />
              <Route path="settings" element={<BusinessSettingsLayout />}>
                <Route index element={<Navigate to="details" replace />} />
                <Route
                  path="details"
                  element={<BusinessDetailsSettingsPage />}
                />
                <Route
                  path="legal-entity"
                  element={<LegalEntitySettingsPage />}
                />
                <Route
                  path="legal-entity/change"
                  element={<LegalEntityChangePage />}
                />
                <Route path="activities" element={<ActivitiesSettingsPage />} />
                <Route path="vehicles" element={<VehiclesSettingsPage />} />
                <Route path="categories" element={<CategoriesSettingsPage />} />
                <Route path="clients" element={<ClientsSettingsPage />} />
                <Route path="members" element={<MembersSettingsPage />} />
              </Route>
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
