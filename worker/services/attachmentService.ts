import { HttpError } from '../lib/http';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export type AttachmentRecordType = 'EXPENSE' | 'INCOME' | 'WORK_SESSION';
export const supportedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type SupportedMimeType = (typeof supportedMimeTypes)[number];

export function attachmentRecordType(value: FormDataEntryValue | null) {
  if (
    typeof value !== 'string' ||
    !['EXPENSE', 'INCOME', 'WORK_SESSION'].includes(value)
  )
    throw new HttpError(400, 'Record type is invalid.');
  return value as AttachmentRecordType;
}

export function attachmentFilename(value: string) {
  const filename = value.trim();
  if (
    !filename ||
    filename.length > 255 ||
    [...filename].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    throw new HttpError(400, 'Filename is invalid.');
  return filename;
}

export function detectedMimeType(bytes: Uint8Array): SupportedMimeType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  if (
    bytes.length >= 5 &&
    String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
  )
    return 'application/pdf';
  return null;
}

export function validateAttachmentFile(
  filename: string,
  claimedMimeType: string,
  bytes: Uint8Array,
) {
  const originalFilename = attachmentFilename(filename);
  if (bytes.length === 0)
    throw new HttpError(400, 'Attachment must not be empty.');
  if (bytes.length > MAX_ATTACHMENT_BYTES)
    throw new HttpError(413, 'Attachment exceeds the 25 MB limit.');
  if (!supportedMimeTypes.includes(claimedMimeType as SupportedMimeType))
    throw new HttpError(415, 'Attachment type is not supported.');
  const mimeType = detectedMimeType(bytes);
  if (!mimeType || mimeType !== claimedMimeType)
    throw new HttpError(
      415,
      'Attachment contents do not match the selected file type.',
    );
  return { originalFilename, mimeType, fileSize: bytes.length };
}

export async function sha256Hex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function safeDownloadFilename(filename: string) {
  return filename.replace(/["\\\r\n]/g, '_');
}
