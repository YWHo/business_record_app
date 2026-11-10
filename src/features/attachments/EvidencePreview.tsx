import { useId, useState } from 'react';
export interface EvidenceFile {
  originalFilename: string;
  mimeType: string;
  downloadUrl: string | null;
  previewUrl?: string | null;
  displayRotationDegrees?: number;
}
export function EvidencePreview({
  file,
  canDownload = true,
}: {
  file: EvidenceFile;
  canDownload?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const supported = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ].includes(file.mimeType);
  return (
    <div className="evidence-viewer">
      <div className="evidence-heading">
        <div className="evidence-filename">
          {canDownload && file.downloadUrl ? (
            <a href={file.downloadUrl}>{file.originalFilename}</a>
          ) : (
            <strong>{file.originalFilename}</strong>
          )}
        </div>
        {file.previewUrl && supported && (
          <button
            type="button"
            className="secondary-button evidence-preview-toggle"
            aria-label={`${open ? 'Close preview' : 'Preview'} ${file.originalFilename}`}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Close preview' : 'Preview'}
          </button>
        )}
      </div>
      {file.previewUrl && supported ? (
        <>
          {open && (
            <div id={id} className="evidence-preview">
              {file.mimeType === 'application/pdf' ? (
                <iframe
                  title={`Preview of ${file.originalFilename}`}
                  src={file.previewUrl}
                />
              ) : (
                <img
                  src={file.previewUrl}
                  alt={`Preview of ${file.originalFilename}`}
                  style={{
                    transform: `rotate(${file.displayRotationDegrees ?? 0}deg)`,
                  }}
                />
              )}
            </div>
          )}
        </>
      ) : (
        !canDownload && <p>Preview unavailable for this file.</p>
      )}
    </div>
  );
}
