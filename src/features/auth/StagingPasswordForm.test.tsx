import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StagingPasswordForm } from './StagingPasswordForm';

describe('staging password form', () => {
  it('waits for the challenge before submitting credentials', () => {
    const onSubmit = vi.fn();
    render(
      <StagingPasswordForm
        onSubmit={onSubmit}
        challenge={<p>Challenge pending</p>}
        challengeReady={false}
        onSettled={vi.fn()}
      />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks duplicate requests and clears the password after a failed attempt', async () => {
    let rejectAttempt!: (error: Error) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectAttempt = reject;
        }),
    );
    const onSettled = vi.fn();
    render(
      <StagingPasswordForm
        onSubmit={onSubmit}
        challenge={<p>Challenge ready</p>}
        challengeReady
        onSettled={onSettled}
      />,
    );
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'tester@example.invalid' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'fictional-test-password-2026' },
    });
    const form = screen.getByLabelText('Password').closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      'tester@example.invalid',
      'fictional-test-password-2026',
    );
    expect(screen.getByRole('button')).toBeDisabled();
    rejectAttempt(new Error('Unable to sign in with those details.'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Unable to sign in with those details.',
      ),
    );
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'tester@example.invalid',
    );
    expect(onSettled).toHaveBeenCalledOnce();
  });
});
