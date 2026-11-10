import type { AuditorAccessDetails } from '../../lib/accessPresentation';
const date = (value: string) =>
  new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'UTC',
    dateStyle: 'medium',
  }).format(new Date(value + 'T00:00:00Z'));
export function AuditorAccessNotice({
  access,
}: {
  access?: AuditorAccessDetails;
}) {
  return (
    <aside className="auditor-access-notice" aria-label="Auditor access">
      <strong>Auditor access · Read-only</strong>
      <p>
        You can inspect permitted records, evidence, reports and audit history.
        Changes and downloads are unavailable.
      </p>
      {access ? (
        <>
          <ul>
            {access.scopes.map((scope, index) => (
              <li key={index}>
                <strong>{scope.label}</strong> ·{' '}
                {scope.dateFrom ? date(scope.dateFrom) : 'All earlier dates'} to{' '}
                {scope.dateTo ? date(scope.dateTo) : 'all later dates'}
              </li>
            ))}
          </ul>
          <p>
            Access expires{' '}
            <time dateTime={access.accessExpiresAt}>
              {new Intl.DateTimeFormat('en-NZ', {
                timeZone: 'Pacific/Auckland',
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(access.accessExpiresAt))}
            </time>{' '}
            (New Zealand time). Record dates above use New Zealand accounting
            dates; any matching scope grants access.
          </p>
        </>
      ) : (
        <p>
          Scope details are unavailable. Refresh to check your current access.
        </p>
      )}
    </aside>
  );
}
