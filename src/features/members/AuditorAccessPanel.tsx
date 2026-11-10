import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuditorInvitation, AuditorMember } from '../../lib/auditorAccess';
import { apiRequest } from '../auth/AuthContext';
import { AuditorAccessSummary } from './AuditorAccessSummary';
import type { AccessOption } from './AuditorAccessForm';
import { FormError } from '../../components/FormError';
import { useBusinessDirectory } from '../business/BusinessDirectoryContext';

interface Directory {
  members: AuditorMember[];
  invitations: AuditorInvitation[];
  hasMoreMembers: boolean;
  hasMoreInvitations: boolean;
}
export function AuditorAccessPanel() {
  const [data, setData] = useState<Directory>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [entities, setEntities] = useState<AccessOption[]>([]);
  const { businesses } = useBusinessDirectory();
  const load = useCallback(async () => {
    const [directory, entityResult] = await Promise.all([
      apiRequest<Directory>('/api/auditor-access'),
      apiRequest<{
        legalEntities: {
          id: string;
          legalName: string | null;
          tradingName: string | null;
        }[];
      }>('/api/legal-entities'),
    ]);
    setData(directory);
    setEntities(
      entityResult.legalEntities.map((entity) => ({
        id: entity.id,
        name: entity.legalName ?? entity.tradingName ?? 'Unnamed legal entity',
      })),
    );
  }, []);
  useEffect(() => {
    // Synchronize the owner directory with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load auditor access.',
      ),
    );
  }, [load]);
  async function end(path: string, revision: number) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(path, {
        method: 'POST',
        body: JSON.stringify({ revision }),
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to end access. Reload before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-labelledby="auditor-access-heading">
      <h2 id="auditor-access-heading">Auditor access</h2>
      <p>
        Time-limited, read-only access to selected records. Expiring or revoking
        access ends current sessions and retains history.
      </p>
      <Link className="button-link" to="/app/settings/account/auditors/new">
        Invite an auditor
      </Link>
      <FormError message={error} />
      {!data && !error && <p role="status">Loading auditor access…</p>}
      {data?.members.length === 0 && <p>No auditor memberships.</p>}
      {data?.members.map((member) => (
        <article
          className="panel"
          key={member.id}
          aria-label={`Auditor ${member.email}`}
        >
          <h3>{member.email}</h3>
          <p>Auditor · Read-only · {member.accessState}</p>
          <AuditorAccessSummary
            grant={member}
            businesses={businesses}
            entities={entities}
          />
          <div className="button-row">
            <Link
              to={`/app/settings/account/auditors/${encodeURIComponent(member.id)}`}
            >
              Manage access
            </Link>
            {(member.accessState === 'ACTIVE' ||
              member.accessState === 'SCHEDULED') && (
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  void end(
                    `/api/auditor-access/${encodeURIComponent(member.id)}/expire`,
                    member.revision,
                  )
                }
              >
                Expire access now
              </button>
            )}
            {member.status !== 'DISABLED' && (
              <button
                className="danger-button"
                disabled={busy}
                type="button"
                onClick={() =>
                  void end(
                    `/api/auditor-access/${encodeURIComponent(member.id)}/revoke`,
                    member.revision,
                  )
                }
              >
                Revoke access
              </button>
            )}
          </div>
        </article>
      ))}
      <h3>Auditor invitations</h3>
      {data?.invitations.length === 0 && <p>No auditor invitations.</p>}
      {data?.invitations.map((invitation) => (
        <article
          className="panel"
          key={invitation.id}
          aria-label={`Invitation ${invitation.email}`}
        >
          <h4>{invitation.email}</h4>
          <p>
            {invitation.status} · Invitation link expires{' '}
            {new Date(invitation.expiresAt).toLocaleString('en-NZ')}
          </p>
          <AuditorAccessSummary
            grant={invitation}
            businesses={businesses}
            entities={entities}
          />
          {invitation.status === 'PENDING' && (
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={() =>
                void end(
                  `/api/auditor-invitations/${encodeURIComponent(invitation.id)}/revoke`,
                  invitation.revision,
                )
              }
            >
              Revoke invitation
            </button>
          )}
        </article>
      ))}
      {(data?.hasMoreMembers || data?.hasMoreInvitations) && (
        <p>Showing the most recent 200 entries in each list.</p>
      )}
    </section>
  );
}
