import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  apiRequest,
  type AuthUser,
  useAuth,
} from '../features/auth/AuthContext';

interface Invitation {
  id: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  expires_at: string;
}

export function UserManagementPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [userResult, invitationResult] = await Promise.all([
      apiRequest<{ users: AuthUser[] }>('/api/users'),
      apiRequest<{ invitations: Invitation[] }>('/api/invitations'),
    ]);
    setUsers(userResult.users);
    setInvitations(invitationResult.invitations);
  }, []);

  useEffect(() => {
    if (user?.role === 'OWNER') {
      // Loading remote state is the synchronization performed by this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load().catch((caught: unknown) =>
        setError(
          caught instanceof Error ? caught.message : 'Unable to load users.',
        ),
      );
    }
  }, [load, user?.role]);

  if (user?.role !== 'OWNER') return <Navigate to="/" replace />;

  async function invite(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiRequest('/api/invitations', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setEmail('');
      setMessage('Invitation created and queued for delivery.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to invite user.',
      );
    }
  }

  async function disable(userId: string) {
    setError('');
    try {
      await apiRequest('/api/users/disable', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to disable user.',
      );
    }
  }

  return (
    <section aria-labelledby="users-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Owner settings</span>
          <h1 id="users-heading">Users and invitations</h1>
          <p>
            Invite accountants and revoke future access without removing
            history.
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>Invite an accountant</h2>
        <form className="inline-form" onSubmit={(event) => void invite(event)}>
          <label htmlFor="accountant-email">Email address</label>
          <input
            id="accountant-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit">Send invitation</button>
        </form>
        {message ? (
          <p role="status" className="notice success">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="notice error">
            {error}
          </p>
        ) : null}
      </section>

      <section className="panel table-wrap">
        <h2>Accounts</h2>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((account) => (
              <tr key={account.id}>
                <td>{account.email}</td>
                <td>{account.role}</td>
                <td>{account.status}</td>
                <td>
                  {account.role !== 'OWNER' && account.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => void disable(account.id)}
                    >
                      Disable
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel table-wrap">
        <h2>Invitation history</h2>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td>{invitation.email}</td>
                <td>{invitation.status}</td>
                <td>
                  {new Date(invitation.expires_at).toLocaleString('en-NZ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
