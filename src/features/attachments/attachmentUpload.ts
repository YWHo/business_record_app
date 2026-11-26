import { ApiError, type apiRequest } from '../auth/AuthContext';

export interface AttachmentUpload {
  recordType: 'EXPENSE' | 'INCOME' | 'WORK_SESSION';
  recordId: string;
  file: File;
  rotation: 0 | 90 | 180 | 270;
  replaceAttachmentId?: string;
  confirmDuplicate: boolean;
}

export function attachmentUploadError(
  file: File,
  localOnly: boolean,
): string | null {
  if (localOnly && file.size > 5 * 1024 * 1024) {
    return 'Demo files must be 5 MB or smaller because they stay only in this browser.';
  }
  if (!navigator.onLine) {
    return 'You are offline. Reconnect, then retry this upload; the selected file will remain here.';
  }
  return null;
}

// A confirmation response keeps the selected file in the component for retry.
export async function uploadAttachment(
  {
    recordType,
    recordId,
    file,
    rotation,
    replaceAttachmentId,
    confirmDuplicate,
  }: AttachmentUpload,
  request: typeof apiRequest,
): Promise<string[] | null> {
  const form = new FormData();
  form.set('recordType', recordType);
  form.set('recordId', recordId);
  form.set('file', file);
  form.set('displayRotationDegrees', String(rotation));
  if (replaceAttachmentId) {
    form.set('replaceAttachmentId', replaceAttachmentId);
  }
  if (confirmDuplicate) {
    form.set('confirmDuplicate', 'true');
  }
  try {
    await request('/api/attachments', { method: 'POST', body: form });
    return null;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      error.body?.requiresConfirmation === true
    ) {
      return Array.isArray(error.body.warnings)
        ? error.body.warnings.filter(
            (item): item is string => typeof item === 'string',
          )
        : [];
    }
    throw error;
  }
}
