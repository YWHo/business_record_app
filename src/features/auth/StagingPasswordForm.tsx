import { useState, type ReactNode, type SubmitEvent } from 'react';

export function StagingPasswordForm({
  onSubmit,
  challenge,
  challengeReady,
  onSettled,
}: {
  onSubmit: (email: string, password: string) => Promise<void>;
  challenge: ReactNode;
  challengeReady: boolean;
  onSettled: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !challengeReady) {
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit(email, password);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to sign in with those details.',
      );
    } finally {
      setPassword('');
      setSaving(false);
      onSettled();
    }
  };
  return (
    <form className="stack-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="staging-email">Email address</label>
      <input
        id="staging-email"
        type="email"
        autoComplete="username"
        maxLength={254}
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <label htmlFor="staging-password">Password</label>
      <input
        id="staging-password"
        type="password"
        autoComplete="current-password"
        minLength={16}
        maxLength={128}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {challenge}
      <button type="submit" disabled={saving || !challengeReady}>
        {saving ? 'Signing in…' : 'Sign in to staging'}
      </button>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </form>
  );
}
