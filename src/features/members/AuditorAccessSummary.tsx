import type { AuditorGrant } from '../../lib/auditorAccess';
import type { AccessOption } from './AuditorAccessForm';

export function AuditorAccessSummary({
  grant,
  businesses = [],
  entities = [],
}: {
  grant: AuditorGrant;
  businesses?: AccessOption[];
  entities?: AccessOption[];
}) {
  return (
    <div>
      <p>
        Access starts:{' '}
        {grant.accessStartsAt
          ? new Date(grant.accessStartsAt).toLocaleString('en-NZ')
          : 'Immediately'}
        <br />
        Configured expiry:{' '}
        {new Date(grant.accessExpiresAt).toLocaleString('en-NZ')}
      </p>
      <ul>
        {grant.scopes.map((scope, index) => (
          <li key={index}>
            {scope.scopeType === 'ACCOUNT'
              ? 'Whole account'
              : scope.scopeType === 'BUSINESS'
                ? `Business: ${businesses.find((item) => item.id === scope.businessId)?.name ?? scope.businessId}`
                : `Legal entity: ${entities.find((item) => item.id === scope.legalEntityId)?.name ?? scope.legalEntityId}`}
            {' · '}
            {scope.dateFrom ?? 'All earlier dates'} to{' '}
            {scope.dateTo ?? 'all later dates'}
          </li>
        ))}
      </ul>
    </div>
  );
}
