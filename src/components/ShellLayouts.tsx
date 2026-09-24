import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { AppShell, type ShellNavigationItem } from './AppShell';
import { useAuth } from '../features/auth/AuthContext';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';

const accountNavigation: ShellNavigationItem[] = [
  { to: '/app/businesses', label: 'My businesses', icon: '⌂', end: true },
  { to: '/app/transactions', label: 'All transactions', icon: '▤' },
  { to: '/app/reports', label: 'Reports', icon: '▥' },
];

export function AccountShell() {
  const { configuration, user } = useAuth();
  const settings =
    user?.role === 'OWNER' && !configuration?.demoHelper
      ? [
          {
            to: '/app/settings/account',
            label: 'Account settings',
            icon: '⚙',
          },
        ]
      : [];

  return (
    <AppShell
      contextLabel="Account"
      navigation={accountNavigation}
      secondaryNavigation={settings}
      mobileNavigation={[...accountNavigation, ...settings]}
    />
  );
}

export function BusinessShell() {
  const { configuration, user } = useAuth();
  const { businessId = '' } = useParams();
  const { businesses, error, loading, reload } = useBusinessDirectory();
  const location = useLocation();
  const navigate = useNavigate();
  const business = businesses.find((candidate) => candidate.id === businessId);

  if (loading)
    return (
      <main className="auth-page">
        <p role="status">Loading business workspace…</p>
      </main>
    );
  if (error)
    return (
      <main className="auth-page">
        <section className="empty-state" role="alert">
          <div>
            <h1>Unable to open this business</h1>
            <p>{error}</p>
            <button type="button" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        </section>
      </main>
    );
  if (!business) return <Navigate to="/app/businesses" replace />;

  const base = `/app/businesses/${business.id}`;
  const navigation: ShellNavigationItem[] = [
    { to: base, label: 'Dashboard', icon: '⌂', end: true },
    { to: `${base}/transactions`, label: 'Transactions', icon: '▤' },
    { to: `${base}/expenses`, label: 'Expenses', icon: '▣', end: true },
    {
      to: `${base}/expenses/fuel`,
      label: 'Fuel',
      icon: '·',
      subItem: true,
    },
    {
      to: `${base}/expenses/insurance`,
      label: 'Insurance',
      icon: '·',
      subItem: true,
    },
    { to: `${base}/income`, label: 'Income', icon: '$' },
    { to: `${base}/mileage`, label: 'Mileage', icon: '◇' },
    { to: `${base}/documents`, label: 'Documents', icon: '▧' },
    { to: `${base}/reports`, label: 'Reports', icon: '▥' },
  ];
  const settings: ShellNavigationItem[] = [
    {
      to: `${base}/settings`,
      label: 'Business settings',
      icon: '⚙',
    },
    { to: `${base}/governance`, label: 'Governance', icon: '✓' },
  ];
  const switchBusiness = (nextBusinessId: string) => {
    if (!nextBusinessId || nextBusinessId === business.id) return;
    const currentSuffix = location.pathname.slice(base.length);
    const safeSuffix = [
      '/transactions',
      '/expenses',
      '/income',
      '/mileage',
      '/documents',
      '/reports',
      '/settings',
      '/governance',
    ].includes(currentSuffix)
      ? currentSuffix
      : '';
    void navigate(`/app/businesses/${nextBusinessId}${safeSuffix}`);
  };

  return (
    <AppShell
      contextLabel={business.name}
      contextControl={
        <label className="business-switcher">
          <span className="sr-only">Current business</span>
          <select
            aria-label="Current business"
            value={business.id}
            onChange={(event) => switchBusiness(event.target.value)}
          >
            {businesses.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
      }
      navigation={navigation}
      secondaryNavigation={[
        {
          to: '/app/businesses',
          label: 'My businesses',
          icon: '←',
          end: true,
        },
        ...settings,
        ...(user?.role === 'OWNER' && !configuration?.demoHelper
          ? [
              {
                to: '/app/settings/account',
                label: 'Account settings',
                icon: '♙',
              },
            ]
          : []),
      ]}
      mobileNavigation={[
        navigation[0],
        navigation[2],
        navigation[5],
        settings[0],
      ]}
    />
  );
}
