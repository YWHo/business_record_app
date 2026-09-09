import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../auth/AuthContext';

type RecordType = 'EXPENSE' | 'INCOME' | 'WORK_SESSION';
type Rotation = 0 | 90 | 180 | 270;

interface Attachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdByEmail: string;
  versionNumber: number;
  isCurrent: boolean;
  displayRotationDegrees: Rotation;
  downloadUrl: string;
}

const acceptedDocuments = 'image/jpeg,image/png,image/webp,application/pdf';

export function AttachmentPanel({
  recordType,
  recordId,
  canManage,
}: {
  recordType: RecordType;
  recordId: string;
  canManage: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [rotation, setRotation] = useState<Rotation>(0);
  const [replace, setReplace] = useState<Attachment | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [uploadFailed, setUploadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const result = await apiRequest<{ attachments: Attachment[] }>(
      `/api/attachments?recordType=${recordType}&recordId=${encodeURIComponent(recordId)}`,
    );
    setAttachments(result.attachments ?? []);
  }, [recordId, recordType]);

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load documents.',
      ),
    );
  }, [load]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setPreviewUrl(
      nextFile && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(nextFile)
        : '',
    );
    setRotation(0);
    setWarnings([]);
    setError('');
    setUploadFailed(false);
  }

  async function upload(confirmDuplicate = false) {
    if (!file) return;
    if (!navigator.onLine) {
      setError(
        'You are offline. Reconnect, then retry this upload; the selected file will remain here.',
      );
      setUploadFailed(true);
      return;
    }
    setSaving(true);
    setError('');
    setUploadFailed(false);
    const form = new FormData();
    form.set('recordType', recordType);
    form.set('recordId', recordId);
    form.set('file', file);
    form.set('displayRotationDegrees', String(rotation));
    if (replace) form.set('replaceAttachmentId', replace.id);
    if (confirmDuplicate) form.set('confirmDuplicate', 'true');
    try {
      await apiRequest('/api/attachments', { method: 'POST', body: form });
      selectFile(null);
      setReplace(null);
      await load();
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.status === 409 &&
        caught.body?.requiresConfirmation === true
      ) {
        setWarnings(
          Array.isArray(caught.body.warnings)
            ? caught.body.warnings.filter(
                (item): item is string => typeof item === 'string',
              )
            : [],
        );
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to upload document.',
        );
        setUploadFailed(true);
      }
    } finally {
      setSaving(false);
    }
  }

  const isImage = file?.type.startsWith('image/') ?? false;

  return (
    <section className="attachment-panel" aria-label="Supporting documents">
      <div className="section-heading">
        <div>
          <h4>Supporting documents</h4>
          <p>JPEG, PNG, WebP, or PDF · up to 25 MB · immutable versions</p>
        </div>
        <span className="count-badge">
          {attachments.filter((item) => item.isCurrent).length}
        </span>
      </div>
      {error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
          {uploadFailed && file ? (
            <button type="button" onClick={() => void upload()}>
              Retry upload
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="attachment-list">
        {attachments.map((attachment) => (
          <div
            className={
              attachment.isCurrent
                ? 'attachment-row'
                : 'attachment-row attachment-history'
            }
            key={attachment.id}
          >
            <div>
              <a href={attachment.downloadUrl}>{attachment.originalFilename}</a>
              <small>
                Version {attachment.versionNumber} ·{' '}
                {(attachment.fileSize / 1024).toLocaleString('en-NZ', {
                  maximumFractionDigits: 1,
                })}{' '}
                KB · {attachment.createdByEmail}
                {attachment.displayRotationDegrees
                  ? ` · displayed at ${attachment.displayRotationDegrees}°`
                  : ''}
              </small>
            </div>
            {canManage && attachment.isCurrent ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setReplace(attachment);
                  selectFile(null);
                }}
              >
                Replace
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {canManage ? (
        <form
          className="attachment-form"
          onSubmit={(event) => {
            event.preventDefault();
            void upload();
          }}
        >
          {replace ? (
            <p>
              Creating version {replace.versionNumber + 1} of{' '}
              <strong>{replace.originalFilename}</strong>.{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setReplace(null);
                  setWarnings([]);
                }}
              >
                Cancel replacement
              </button>
            </p>
          ) : null}
          <fieldset className="capture-options">
            <legend>{replace ? 'Select replacement' : 'Add document'}</legend>
            <label className="capture-button">
              Take a photo
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) =>
                  selectFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <label>
              Choose existing photo or PDF
              <input
                type="file"
                accept={acceptedDocuments}
                onChange={(event) =>
                  selectFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
          </fieldset>
          {file ? (
            <div className="attachment-preview" aria-live="polite">
              <div className="preview-heading">
                <div>
                  <strong>Preview: {file.name}</strong>
                  <small>
                    {(file.size / 1024).toLocaleString('en-NZ', {
                      maximumFractionDigits: 1,
                    })}{' '}
                    KB
                  </small>
                </div>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => selectFile(null)}
                >
                  Remove
                </button>
              </div>
              {previewUrl && isImage ? (
                <div className="image-preview-frame">
                  <img
                    src={previewUrl}
                    alt={`Preview of ${file.name}`}
                    style={{ transform: `rotate(${rotation}deg)` }}
                  />
                </div>
              ) : null}
              {previewUrl && file.type === 'application/pdf' ? (
                <object
                  className="pdf-preview"
                  data={previewUrl}
                  type="application/pdf"
                  aria-label={`Preview of ${file.name}`}
                >
                  <p>PDF preview is unavailable in this browser.</p>
                </object>
              ) : null}
              {isImage ? (
                <div
                  className="rotation-controls"
                  aria-label="Preview rotation"
                >
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setRotation(((rotation + 270) % 360) as Rotation)
                    }
                  >
                    Rotate left
                  </button>
                  <span aria-live="polite">{rotation}°</span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setRotation(((rotation + 90) % 360) as Rotation)
                    }
                  >
                    Rotate right
                  </button>
                </div>
              ) : null}
              <p className="preview-note">
                Rotation changes how the document is displayed. The original
                evidence file is stored unchanged.
              </p>
            </div>
          ) : null}
          {warnings.length ? (
            <div className="notice">
              <strong>Possible duplicate</strong>
              <p>
                {warnings.includes('FILE_HASH_DUPLICATE')
                  ? 'The same file content is already stored. '
                  : ''}
                {warnings.includes('FILENAME_DUPLICATE')
                  ? 'A current document on this record has the same filename.'
                  : ''}
              </p>
              <button type="button" onClick={() => void upload(true)}>
                Upload anyway
              </button>
            </div>
          ) : (
            <button disabled={saving || !file}>
              {saving
                ? 'Uploading…'
                : uploadFailed
                  ? 'Retry upload'
                  : replace
                    ? 'Store new version'
                    : 'Upload document'}
            </button>
          )}
        </form>
      ) : null}
    </section>
  );
}
