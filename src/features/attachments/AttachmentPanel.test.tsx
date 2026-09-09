import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttachmentPanel } from './AttachmentPanel';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('AttachmentPanel mobile capture', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ attachments: [] })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:receipt-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers camera and file pickers with preview rotation', async () => {
    render(
      <AttachmentPanel recordType="EXPENSE" recordId="expense-1" canManage />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const camera = screen.getByLabelText('Take a photo');
    expect(camera).toHaveAttribute('accept', 'image/*');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(
      screen.getByLabelText('Choose existing photo or PDF'),
    ).toHaveAttribute('accept', expect.stringContaining('application/pdf'));

    const photo = new File(
      [new Uint8Array([0xff, 0xd8, 0xff])],
      'receipt.jpg',
      {
        type: 'image/jpeg',
      },
    );
    fireEvent.change(camera, { target: { files: [photo] } });

    expect(await screen.findByAltText('Preview of receipt.jpg')).toHaveStyle({
      transform: 'rotate(0deg)',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    expect(screen.getByAltText('Preview of receipt.jpg')).toHaveStyle({
      transform: 'rotate(90deg)',
    });
    expect(
      screen.getByText(/original evidence file is stored unchanged/i),
    ).toBeInTheDocument();
  });

  it('keeps a selected file available for an explicit failed-upload retry', async () => {
    let uploadAttempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (path === '/api/attachments' && init?.method === 'POST') {
          uploadAttempts += 1;
          return uploadAttempts === 1
            ? jsonResponse({ error: 'Temporary upload failure.' }, 503)
            : jsonResponse({ attachment: { id: 'attachment-1' } }, 201);
        }
        return jsonResponse({ attachments: [] });
      }),
    );
    render(
      <AttachmentPanel recordType="EXPENSE" recordId="expense-1" canManage />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const file = new File(['%PDF-1.7'], 'receipt.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText('Choose existing photo or PDF'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Upload document' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Temporary upload failure.',
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry upload' })[0]);
    await waitFor(() => expect(uploadAttempts).toBe(2));
    await waitFor(() =>
      expect(
        screen.queryByText('Preview: receipt.pdf'),
      ).not.toBeInTheDocument(),
    );
  });
});
