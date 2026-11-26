import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceEntryLink } from './WorkspaceEntryLink';

const meta = {
  title: 'Navigation/Public and private entry',
  component: WorkspaceEntryLink,
  args: { demo: false },
  render: (args) => (
    <section className="panel">
      <p>
        {args.demo
          ? 'Explore fictional records without changing your private workspace.'
          : 'Sign in for your own records, or explore the fictional demonstration.'}
      </p>
      <WorkspaceEntryLink {...args} />
    </section>
  ),
} satisfies Meta<typeof WorkspaceEntryLink>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PrivateSignIn: Story = {};
export const DemoRoleChooser: Story = { args: { demo: true } };
export const LeaveDemo: Story = { args: { demo: true, workspace: true } };
