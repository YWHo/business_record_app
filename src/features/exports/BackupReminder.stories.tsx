import type { Meta, StoryObj } from '@storybook/react-vite';
import { BackupReminderView } from './BackupReminder';

const meta = {
  title: 'Components/Backup reminder',
  component: BackupReminderView,
  args: {
    backup: {
      reminderDays: 30,
      lastSuccessfulExportAt: null,
      due: true,
    },
  },
} satisfies Meta<typeof BackupReminderView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeverBackedUp: Story = {};

export const Due: Story = {
  args: {
    backup: {
      reminderDays: 14,
      lastSuccessfulExportAt: '2026-08-01T08:30:00.000Z',
      due: true,
    },
  },
};

export const Current: Story = {
  args: {
    backup: {
      reminderDays: 30,
      lastSuccessfulExportAt: '2026-09-09T08:30:00.000Z',
      due: false,
    },
  },
};

export const Mobile: Story = {
  ...Due,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
