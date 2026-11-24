import type { Meta, StoryObj } from '@storybook/react-vite';
import { CopyrightFooter } from './CopyrightFooter';

const meta = {
  title: 'Components/Copyright footer',
  component: CopyrightFooter,
} satisfies Meta<typeof CopyrightFooter>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
};
