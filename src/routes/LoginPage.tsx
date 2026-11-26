import { type SubmitEvent, useState } from 'react';
import { Navigate, useNavigate } from '../lib/workspaceRouting';
import {
  useAuth,
  useApiRequest,
  ApiError,
  type DemoRole,
} from '../features/auth/AuthContext';
import { DemoRoleChooser } from '../features/auth/DemoRoleChooser';
import { LocalRoleChooser } from '../features/auth/LocalRoleChooser';
import { AccessEndedNotice } from '../features/auth/AccessEndedNotice';
import { WorkspaceEntryLink } from '../components/WorkspaceEntryLink';
import { TurnstileWidget } from '../features/auth/TurnstileWidget';

export function LoginPage() {
  const apiRequest = useApiRequest();
  const {
    configuration,
    configurationError,
    accessEnded,
    demoLogin,
    localLogin,
    user,
  } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (user) {
    return <Navigate to="/app/businesses" replace />;
  }

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      const result = await apiRequest<{ message: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, turnstileToken }),
      });
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.');
    }
  };

  const loginWithLocalIdentity = async (identity: string) => {
    setError('');
    try {
      await localLogin(identity);
      await navigate('/app/businesses');
    } catch (caught) {
      setError(
        identity === 'auditor@local.test' &&
          caught instanceof ApiError &&
          caught.status === 401
          ? 'Local auditor access is unavailable. On an existing setup, run pnpm db:seed:local:auditor once. If already seeded, check the membership scope, status and expiry as the owner.'
          : caught instanceof Error
            ? caught.message
            : 'Unable to sign in.',
      );
    }
  };

  const loginWithDemoRole = async (role: DemoRole) => {
    setError('');
    try {
      await demoLogin(role);
      await navigate('/app/businesses');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to open the demo.',
      );
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <span className="eyebrow">
          {configuration?.demoHelper
            ? 'Public demonstration'
            : 'Invitation only'}
        </span>
        <h1 id="login-heading">
          {configuration?.demoHelper ? 'Explore the demo' : 'Sign in'}
        </h1>
        {accessEnded && <AccessEndedNotice />}
        <p>
          {configuration?.demoHelper
            ? 'Explore fictional New Zealand business records. Your changes stay only in this browser until you reset them.'
            : 'We will send a single-use sign-in link to your registered email.'}
        </p>
        {configurationError ? (
          <p role="alert" className="notice error">
            {configurationError} Refresh this page to try again.
          </p>
        ) : null}
        <p>
          <WorkspaceEntryLink demo={configuration?.demoHelper === true} />
        </p>
        {configuration && !configuration.demoHelper ? (
          <form onSubmit={(event) => void submit(event)} className="stack-form">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {configuration?.turnstileRequired &&
            configuration.turnstileSiteKey ? (
              <TurnstileWidget
                siteKey={configuration.turnstileSiteKey}
                onToken={setTurnstileToken}
              />
            ) : null}
            <button
              type="submit"
              disabled={
                configuration?.turnstileRequired === true && !turnstileToken
              }
            >
              Email sign-in link
            </button>
          </form>
        ) : null}
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

        {configuration?.localHelper ? (
          <LocalRoleChooser
            onSelect={(identity) => void loginWithLocalIdentity(identity)}
          />
        ) : null}

        {configuration?.demoHelper ? (
          <DemoRoleChooser onSelect={(role) => void loginWithDemoRole(role)} />
        ) : null}
      </section>
    </main>
  );
}
