import type { Meta, StoryObj } from '@storybook/react-vite';
import { faker } from '@faker-js/faker';
import { expect } from 'storybook/test';
import { EvidencePreview } from './EvidencePreview';
// Keep remote sample photos confined to Storybook, away from app/test fixtures.
const photoUrl = faker.image.urlPicsumPhotos({
  width: 960,
  height: 640,
  blur: 0,
  grayscale: false,
});
const meta = {
  title: 'Evidence/Preview access',
  component: EvidencePreview,
  args: {
    canDownload: false,
    file: {
      originalFilename: 'sample-evidence-photo.jpg',
      mimeType: 'image/jpeg',
      downloadUrl: null,
      previewUrl: photoUrl,
    },
  },
} satisfies Meta<typeof EvidencePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
const openPreview: NonNullable<Story['play']> = async ({
  canvas,
  userEvent,
  args,
}) => {
  await userEvent.click(
    canvas.getByRole('button', {
      name: `Preview ${args.file.originalFilename}`,
    }),
  );
  await expect(
    canvas.getByRole('img', {
      name: `Preview of ${args.file.originalFilename}`,
    }),
  ).toBeVisible();
};
export const Auditor: Story = { play: openPreview };
export const Accountant: Story = {
  play: openPreview,
  args: {
    canDownload: true,
    file: {
      ...meta.args.file,
      downloadUrl: photoUrl,
    },
  },
};
export const Unavailable: Story = {
  args: { file: { ...meta.args.file, previewUrl: undefined } },
};
export const LongFilenameOnPhone: Story = {
  globals: { viewport: { value: 'phonePortrait', isRotated: false } },
  args: {
    file: {
      ...meta.args.file,
      originalFilename:
        'supplier-statement-with-supporting-evidence-for-september-2026.jpg',
    },
  },
  play: openPreview,
};
