import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { LocalRoleChooser } from './LocalRoleChooser';

const meta = {
  title: 'Access/Local development roles',
  component: LocalRoleChooser,
  args: { onSelect: fn() },
} satisfies Meta<typeof LocalRoleChooser>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllRoles: Story = {};
export const AuditorEntry: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Continue as local auditor' }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith('auditor@local.test');
  },
};
export const Phone: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};
