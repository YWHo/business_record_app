import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { AccessEndedNotice } from './AccessEndedNotice';

const meta = {
  title: 'Access/Session ended',
  component: AccessEndedNotice,
} satisfies Meta<typeof AccessEndedNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const EndedSession: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'contact the account owner',
    );
  },
};
export const Phone: Story = {
  ...EndedSession,
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};
