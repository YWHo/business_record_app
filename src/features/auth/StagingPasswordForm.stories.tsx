import type { Meta, StoryObj } from '@storybook/react-vite';
import { StagingPasswordForm } from './StagingPasswordForm';

const meta = {
  title: 'Authentication/Staging password sign-in',
  component: StagingPasswordForm,
  args: {
    onSubmit: () => Promise.resolve(),
    onSettled: () => undefined,
    challengeReady: true,
    challenge: (
      <p role="status">Security challenge verified for this example.</p>
    ),
  },
  decorators: [
    (Story) => (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Sign in to staging</h1>
          <p>Use your staging account to work with disposable records.</p>
          <Story />
        </section>
      </main>
    ),
  ],
} satisfies Meta<typeof StagingPasswordForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const WaitingForChallenge: Story = {
  args: {
    challengeReady: false,
    challenge: (
      <p role="status">Complete the security challenge to continue.</p>
    ),
  },
};
export const RejectedCredentials: Story = {
  args: {
    onSubmit: () =>
      Promise.reject(new Error('Unable to sign in with those details.')),
  },
};
export const Phone: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};
