import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../auth/AuthContext';

type RecordType = 'EXPENSE' | 'INCOME' | 'WORK_SESSION';
interface Attachment {
  id: string;
  originalFilename: string;
  fileSize: number;
  createdByEmail: string;
  versionNumber: number;
  isCurrent: boolean;
  downloadUrl: string;
}

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
  const [replace, setReplace] = useState<Attachment | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
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
  async function upload(confirmDuplicate = false) {
    if (!file) return;
    setSaving(true);
    setError('');
    const form = new FormData();
    form.set('recordType', recordType);
    form.set('recordId', recordId);
    form.set('file', file);
    if (replace) form.set('replaceAttachmentId', replace.id);
    if (confirmDuplicate) form.set('confirmDuplicate', 'true');
    try {
      await apiRequest('/api/attachments', { method: 'POST', body: form });
      setFile(null);
      setReplace(null);
      setWarnings([]);
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
      }
    } finally {
      setSaving(false);
    }
  }
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
        <p className="notice error" role="alert">
          {error}
        </p>
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
              </small>
            </div>
            {canManage && attachment.isCurrent ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setReplace(attachment);
                  setFile(null);
                  setWarnings([]);
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
          <label>
            {replace ? 'Replacement file' : 'Add document'}
            <input
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setWarnings([]);
              }}
            />
          </label>
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
