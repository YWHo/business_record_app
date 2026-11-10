import { fireEvent, render, screen } from '@testing-library/react';
import { EvidencePreview } from './EvidencePreview';
const file = {
  originalFilename: 'receipt.png',
  mimeType: 'image/png',
  downloadUrl: '/download',
  previewUrl: '/preview',
  displayRotationDegrees: 90,
};
describe('EvidencePreview', () => {
  it('offers inline viewing without a download or modification control for an auditor', () => {
    render(<EvidencePreview file={file} canDownload={false} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview receipt.png' }),
    );
    expect(screen.getByAltText('Preview of receipt.png')).toHaveAttribute(
      'src',
      '/preview',
    );
    expect(screen.getByAltText('Preview of receipt.png')).toHaveStyle({
      transform: 'rotate(90deg)',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Close preview receipt.png' }),
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('retains an explicit download for authorized owner/accountant callers', () => {
    render(<EvidencePreview file={file} canDownload />);
    expect(screen.getByRole('link', { name: 'receipt.png' })).toHaveAttribute(
      'href',
      '/download',
    );
  });
  it('renders a titled PDF preview without a download link', () => {
    render(
      <EvidencePreview
        file={{ ...file, mimeType: 'application/pdf' }}
        canDownload={false}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTitle('Preview of receipt.png')).toHaveAttribute(
      'src',
      '/preview',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('explains unavailable previews without creating a null file link', () => {
    render(
      <EvidencePreview
        file={{ ...file, previewUrl: undefined, downloadUrl: null }}
        canDownload={false}
      />,
    );
    expect(
      screen.getByText('Preview unavailable for this file.'),
    ).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
