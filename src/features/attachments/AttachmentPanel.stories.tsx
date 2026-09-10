import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { AttachmentPanel } from './AttachmentPanel';

const successResponse = () =>
  Promise.resolve(
    new Response(JSON.stringify({ attachments: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

const meta = {
  title: 'Workflows/Supporting documents',
  component: AttachmentPanel,
  args: {
    recordType: 'EXPENSE',
    recordId: 'storybook-expense',
    canManage: true,
  },
  decorators: [
    (Story, context) => {
      globalThis.fetch = context.parameters.loadError
        ? () => Promise.reject(new Error('Network unavailable.'))
        : successResponse;
      return (
        <section className="panel story-record-card">
          <h3>Harbour Stationery</h3>
          <p>9 September 2026 · NZD $48.30</p>
          <Story />
        </section>
      );
    },
  ],
} satisfies Meta<typeof AttachmentPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const ReadOnlyAccountant: Story = {
  args: { canManage: false },
};

export const LoadError: Story = {
  parameters: { loadError: true },
};

export const SelectedPhoto: Story = {
  play: async ({ canvas, userEvent }) => {
    const photo = new File(
      [new Uint8Array([0xff, 0xd8, 0xff])],
      'very-long-mobile-receipt-name.jpg',
      { type: 'image/jpeg' },
    );
    await userEvent.upload(canvas.getByLabelText('Take a photo'), photo);
    await userEvent.click(canvas.getByRole('button', { name: 'Rotate right' }));
    await expect(
      canvas.getByAltText('Preview of very-long-mobile-receipt-name.jpg'),
    ).toHaveStyle({ transform: 'rotate(90deg)' });
  },
};

export const SelectedPdf: Story = {
  play: async ({ canvas, userEvent }) => {
    const pdf = new File(['%PDF-1.7'], 'supplier-statement.pdf', {
      type: 'application/pdf',
    });
    await userEvent.upload(
      canvas.getByLabelText('Choose existing photo or PDF'),
      pdf,
    );
    await expect(
      canvas.getByLabelText('Preview of supplier-statement.pdf'),
    ).toBeInTheDocument();
  },
};

export const MobileCapture: Story = {
  ...SelectedPhoto,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
