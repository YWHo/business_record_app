import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

interface MoreLink {
  description: string;
  label: string;
  to: string;
}

function MoreLinks({ links }: { links: MoreLink[] }) {
  return (
    <div className="more-link-grid">
      {links.map((link) => (
        <Link key={link.to} to={link.to}>
          <span>
            <strong>{link.label}</strong>
            <small>{link.description}</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}

export function AccountMorePage() {
  const { configuration, user } = useAuth();
  const links: MoreLink[] = [
    {
      to: '/app/reports',
      label: 'Reports and exports',
      description: 'Download reports and portable backups.',
    },
  ];
  if (user?.role === 'OWNER' && !configuration?.demoHelper)
    links.push({
      to: '/app/settings/account',
      label: 'Account settings',
      description: 'Manage users and accountant invitations.',
    });

  return (
    <section aria-labelledby="account-more-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Account navigation</span>
          <h1 id="account-more-heading">More</h1>
          <p>Reports, backups, and account administration.</p>
        </div>
      </div>
      <MoreLinks links={links} />
    </section>
  );
}

export function BusinessMorePage() {
  const { businessId = '' } = useParams();
  const { configuration, user } = useAuth();
  const base = `/app/businesses/${businessId}`;
  const links: MoreLink[] = [
    {
      to: `${base}/transactions`,
      label: 'Transactions',
      description: 'Search records and continue review conversations.',
    },
    {
      to: `${base}/mileage`,
      label: 'Mileage',
      description: 'Review work sessions and vehicle evidence.',
    },
    {
      to: `${base}/documents`,
      label: 'Documents',
      description: 'Find receipts and other supporting evidence.',
    },
    {
      to: `${base}/reports`,
      label: 'Reports and exports',
      description: 'Download business reports and backups.',
    },
    {
      to: `${base}/settings`,
      label: 'Business settings',
      description: 'View business details and reference data.',
    },
    {
      to: `${base}/governance`,
      label: 'Governance',
      description: 'Review retention, audit history, and trash.',
    },
    {
      to: '/app/businesses',
      label: 'My businesses',
      description: 'Switch to another business workspace.',
    },
  ];
  if (user?.role === 'OWNER' && !configuration?.demoHelper)
    links.push({
      to: '/app/settings/account',
      label: 'Account settings',
      description: 'Manage users and accountant invitations.',
    });

  return (
    <section aria-labelledby="business-more-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Business navigation</span>
          <h1 id="business-more-heading">More</h1>
          <p>Records, reports, settings, and account destinations.</p>
        </div>
      </div>
      <MoreLinks links={links} />
    </section>
  );
}
