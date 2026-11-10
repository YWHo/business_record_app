import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import {
  AuditorAccessForm,
  type AccessOption,
} from '../features/members/AuditorAccessForm';
import type { AuditorMember } from '../lib/auditorAccess';
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard';
import { FormError } from '../components/FormError';

export function AuditorAccessPage() {
  const { user, configuration } = useAuth();
  const { userId } = useParams();
  const allowed = user?.role === 'OWNER' && !configuration?.demoHelper;
  const [data, setData] = useState<{
    businesses: AccessOption[];
    entities: AccessOption[];
    member?: AuditorMember;
  }>();
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void Promise.all([
      apiRequest<{ businesses: AccessOption[] }>('/api/businesses'),
      apiRequest<{
        legalEntities: {
          id: string;
          legalName: string | null;
          tradingName: string | null;
        }[];
      }>('/api/legal-entities'),
      userId
        ? apiRequest<{ member: AuditorMember }>(
            `/api/auditor-access/${encodeURIComponent(userId)}`,
          )
        : Promise.resolve(undefined),
    ])
      .then(([businesses, entities, membership]) => {
        if (active)
          setData({
            businesses: businesses.businesses,
            entities: entities.legalEntities.map((entity) => ({
              id: entity.id,
              name: entity.legalName ?? entity.tradingName ?? entity.id,
            })),
            member: membership?.member,
          });
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load auditor access.',
          );
      });
    return () => {
      active = false;
    };
  }, [allowed, userId]);
  if (!allowed) return <Navigate to="/app/businesses" replace />;
  if (saved) return <Navigate to="/app/settings/account" replace />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Owner settings</span>
          <h1>{userId ? 'Manage auditor access' : 'Invite an auditor'}</h1>
          <Link to="/app/settings/account">Back to users and invitations</Link>
        </div>
      </div>
      <UnsavedChangesGuard when={dirty && !saved} />
      <FormError message={error} />
      {!data && !error && <p role="status">Loading access options…</p>}
      {data && (
        <AuditorAccessForm
          key={userId ?? 'new'}
          {...data}
          onDirtyChange={setDirty}
          onSubmit={async (value) => {
            await apiRequest(
              userId
                ? `/api/auditor-access/${encodeURIComponent(userId)}`
                : '/api/auditor-invitations',
              {
                method: userId ? 'PATCH' : 'POST',
                body: JSON.stringify({
                  ...value,
                  revision: data.member?.revision,
                }),
              },
            );
            setDirty(false);
            setSaved(true);
          }}
        />
      )}
    </section>
  );
}
