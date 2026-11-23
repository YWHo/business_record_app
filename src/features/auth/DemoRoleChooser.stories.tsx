import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { DemoRoleChooser } from './DemoRoleChooser';

const meta = {
  title: 'Access/Public demo roles',
  component: DemoRoleChooser,
  args: { onSelect: fn() },
} satisfies Meta<typeof DemoRoleChooser>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllRoles: Story = {};
export const AuditorEntry: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Continue as Demo Auditor' }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith('AUDITOR');
  },
};
export const Phone: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};
