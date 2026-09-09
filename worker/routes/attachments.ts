import { requireRole, requireUser } from '../auth/authorization';
import { HttpError, json } from '../lib/http';
import {
  attachmentRecordType,
  attachmentRotation,
  safeDownloadFilename,
  sha256Hex,
  validateAttachmentFile,
  type AttachmentRecordType,
} from '../services/attachmentService';
import { writeAudit } from '../services/auditService';
import type { Env } from '../types';

interface ParentRow {
  id: string;
  business_activity_id: string | null;
  retention_until: string;
  purge_eligible_at: string;
  deleted_at: string | null;
}
interface AttachmentRow {
  id: string;
  record_type: AttachmentRecordType;
  record_id: string;
  version_group_id: string;
  object_key: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  created_at: string;
  version_number: number;
  is_current: number;
  display_rotation_degrees: number;
  creator_email: string;
}
const attachmentSelect = `SELECT attachments.id, attachments.record_type,
  attachments.record_id, attachments.version_group_id, attachments.object_key,
  attachments.original_filename, attachments.mime_type, attachments.file_size,
  attachments.sha256, attachments.created_at, attachments.version_number,
  attachments.is_current, attachments.display_rotation_degrees,
  users.email AS creator_email
  FROM attachments JOIN users ON users.id = attachments.created_by`;
const serialize = (row: AttachmentRow) => ({
  id: row.id,
  recordType: row.record_type,
  recordId: row.record_id,
  versionGroupId: row.version_group_id,
  originalFilename: row.original_filename,
  mimeType: row.mime_type,
  fileSize: row.file_size,
  sha256: row.sha256,
  createdAt: row.created_at,
  createdByEmail: row.creator_email,
  versionNumber: row.version_number,
  isCurrent: row.is_current === 1,
  displayRotationDegrees: row.display_rotation_degrees,
  downloadUrl: `/api/attachments/file?id=${encodeURIComponent(row.id)}`,
});

async function parent(
  env: Env,
  recordType: AttachmentRecordType,
  recordId: string,
) {
  const sources = {
    EXPENSE: 'expenses',
    INCOME: 'income_records',
    WORK_SESSION: 'work_sessions',
  } as const;
  const row = await env.DB.prepare(
    `SELECT id, business_activity_id, retention_until, purge_eligible_at, deleted_at FROM ${sources[recordType]} WHERE id = ? AND purged_at IS NULL`,
  )
    .bind(recordId)
    .first<ParentRow>();
  if (!row) throw new HttpError(404, 'Record not found.');
  return row;
}

function queryValue(url: URL, name: string) {
  const value = url.searchParams.get(name)?.trim();
  if (!value) throw new HttpError(400, `${name} is required.`);
  return value;
}

export async function listAttachments(request: Request, env: Env) {
  await requireUser(request, env);
  const url = new URL(request.url);
  const recordType = attachmentRecordType(url.searchParams.get('recordType'));
  const recordId = queryValue(url, 'recordId');
  await parent(env, recordType, recordId);
  const rows = await env.DB.prepare(
    `${attachmentSelect} WHERE attachments.record_type = ? AND attachments.record_id = ? AND attachments.purged_at IS NULL ORDER BY attachments.created_at DESC, attachments.version_number DESC`,
  )
    .bind(recordType, recordId)
    .all<AttachmentRow>();
  return json({ attachments: rows.results.map(serialize) });
}

export async function uploadAttachment(request: Request, env: Env) {
  let actor;
  try {
    actor = await requireUser(request, env);
  } catch (error) {
    await request.arrayBuffer();
    throw error;
  }
  if (actor.role !== 'OWNER') await request.arrayBuffer();
  requireRole(actor, ['OWNER']);
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 27 * 1024 * 1024)
    throw new HttpError(413, 'Upload request is too large.');
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
    throw new HttpError(415, 'Upload must use multipart form data.');
  const form = await request.formData();
  const recordType = attachmentRecordType(form.get('recordType'));
  const recordIdValue = form.get('recordId');
  if (typeof recordIdValue !== 'string' || !recordIdValue.trim())
    throw new HttpError(400, 'Record ID is required.');
  const recordId = recordIdValue.trim();
  const displayRotationDegrees = attachmentRotation(
    form.get('displayRotationDegrees'),
  );
  const target = await parent(env, recordType, recordId);
  if (target.deleted_at)
    throw new HttpError(409, 'Restore the record before adding documents.');
  const file = form.get('file');
  if (!(file instanceof File))
    throw new HttpError(400, 'Select a file to upload.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateAttachmentFile(file.name, file.type, bytes);
  const sha256 = await sha256Hex(bytes);
  const replaceValue = form.get('replaceAttachmentId');
  const replaceAttachmentId =
    typeof replaceValue === 'string' && replaceValue.trim()
      ? replaceValue.trim()
      : null;
  let versionGroupId: string = crypto.randomUUID();
  let versionNumber = 1;
  let prior: AttachmentRow | null = null;
  if (replaceAttachmentId) {
    prior = await env.DB.prepare(
      `${attachmentSelect} WHERE attachments.id = ? AND attachments.record_type = ? AND attachments.record_id = ? AND attachments.is_current = 1 AND attachments.purged_at IS NULL`,
    )
      .bind(replaceAttachmentId, recordType, recordId)
      .first<AttachmentRow>();
    if (!prior)
      throw new HttpError(404, 'Current attachment version not found.');
    versionGroupId = prior.version_group_id;
    versionNumber = prior.version_number + 1;
  }
  const duplicates = await env.DB.prepare(
    `${attachmentSelect} WHERE attachments.purged_at IS NULL AND (attachments.sha256 = ? OR (attachments.record_type = ? AND attachments.record_id = ? AND attachments.is_current = 1 AND attachments.original_filename = ? COLLATE NOCASE)) ORDER BY attachments.created_at DESC LIMIT 10`,
  )
    .bind(sha256, recordType, recordId, validated.originalFilename)
    .all<AttachmentRow>();
  const hashDuplicate = duplicates.results.some(
    (item) => item.sha256 === sha256,
  );
  const filenameDuplicate = duplicates.results.some(
    (item) =>
      item.id !== prior?.id &&
      item.record_type === recordType &&
      item.record_id === recordId &&
      item.is_current === 1 &&
      item.original_filename.toLocaleLowerCase() ===
        validated.originalFilename.toLocaleLowerCase(),
  );
  if (
    (hashDuplicate || filenameDuplicate) &&
    form.get('confirmDuplicate') !== 'true'
  )
    return json(
      {
        error:
          'This file may already be stored. Review the warning before continuing.',
        requiresConfirmation: true,
        warnings: [
          ...(hashDuplicate ? ['FILE_HASH_DUPLICATE'] : []),
          ...(filenameDuplicate ? ['FILENAME_DUPLICATE'] : []),
        ],
        matches: duplicates.results.map((item) => ({
          id: item.id,
          recordType: item.record_type,
          recordId: item.record_id,
          originalFilename: item.original_filename,
          versionNumber: item.version_number,
          createdAt: item.created_at,
        })),
      },
      { status: 409 },
    );
  const id = crypto.randomUUID();
  const objectKey = `attachments/${recordType.toLowerCase()}/${recordId}/${versionGroupId}/v${versionNumber}-${id}`;
  const now = new Date().toISOString();
  await env.DOCUMENTS.put(objectKey, bytes, {
    httpMetadata: { contentType: validated.mimeType },
    customMetadata: { sha256, attachmentId: id },
  });
  try {
    await env.DB.batch([
      ...(prior
        ? [
            env.DB.prepare(
              'UPDATE attachments SET is_current = 0 WHERE id = ? AND is_current = 1',
            ).bind(prior.id),
          ]
        : []),
      env.DB.prepare(
        `INSERT INTO attachments (id, record_type, record_id, version_group_id, object_key, original_filename, mime_type, file_size, sha256, created_by, created_at, version_number, is_current, display_rotation_degrees, retention_until, purge_eligible_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      ).bind(
        id,
        recordType,
        recordId,
        versionGroupId,
        objectKey,
        validated.originalFilename,
        validated.mimeType,
        validated.fileSize,
        sha256,
        actor.id,
        now,
        versionNumber,
        displayRotationDegrees,
        target.retention_until,
        target.purge_eligible_at,
      ),
    ]);
  } catch (error) {
    await env.DOCUMENTS.delete(objectKey);
    throw error;
  }
  await writeAudit(
    env,
    actor,
    prior ? 'ATTACHMENT_VERSION_CREATED' : 'ATTACHMENT_CREATED',
    recordType,
    recordId,
    prior
      ? `Attachment replacement stored as version ${versionNumber}.`
      : 'Attachment stored.',
    target.business_activity_id,
  );
  const stored = await env.DB.prepare(
    `${attachmentSelect} WHERE attachments.id = ?`,
  )
    .bind(id)
    .first<AttachmentRow>();
  if (!stored)
    throw new HttpError(500, 'Attachment metadata could not be loaded.');
  return json({ attachment: serialize(stored) }, { status: 201 });
}

export async function downloadAttachment(request: Request, env: Env) {
  await requireUser(request, env);
  const id = queryValue(new URL(request.url), 'id');
  const row = await env.DB.prepare(
    `${attachmentSelect} WHERE attachments.id = ? AND attachments.purged_at IS NULL`,
  )
    .bind(id)
    .first<AttachmentRow>();
  if (!row) throw new HttpError(404, 'Attachment not found.');
  await parent(env, row.record_type, row.record_id);
  const object = await env.DOCUMENTS.get(row.object_key);
  if (!object) throw new HttpError(404, 'Attachment file is unavailable.');
  const encoded = encodeURIComponent(row.original_filename);
  const headers = new Headers();
  headers.set('content-type', row.mime_type);
  headers.set('content-length', String(row.file_size));
  headers.set(
    'content-disposition',
    `attachment; filename="${safeDownloadFilename(row.original_filename)}"; filename*=UTF-8''${encoded}`,
  );
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}
