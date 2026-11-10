import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExportDownloadLink } from './ExportDownloadLink';
const meta = {
  title: 'Exports/Download permissions',
  component: ExportDownloadLink,
  args: { role: 'OWNER', href: '/api/exports/archive?scope=FULL' },
} satisfies Meta<typeof ExportDownloadLink>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Owner: Story = {};
export const Accountant: Story = {
  args: { role: 'ACCOUNTANT', href: '/api/reports/export?scope=FULL' },
};
export const Auditor: Story = {
  args: { role: 'AUDITOR', href: '/api/reports/export?scope=FULL' },
};
export const UnknownRole: Story = { args: { role: 'UNKNOWN' } };
