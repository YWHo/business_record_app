import { HttpError } from '../lib/http';

export type ReviewRecordType = 'EXPENSE' | 'INCOME' | 'WORK_SESSION';
export type RecordStatus =
  | 'NEW'
  | 'MISSING_INFORMATION'
  | 'READY_FOR_REVIEW'
  | 'REVIEWED'
  | 'PROCESSED'
  | 'VOIDED';

export function reviewRecordType(value: unknown): ReviewRecordType {
  if (
    typeof value !== 'string' ||
    !['EXPENSE', 'INCOME', 'WORK_SESSION'].includes(value)
  )
    throw new HttpError(400, 'Record type is invalid.');
  return value as ReviewRecordType;
}

export function reviewStatus(value: unknown): RecordStatus {
  if (
    typeof value !== 'string' ||
    ![
      'NEW',
      'MISSING_INFORMATION',
      'READY_FOR_REVIEW',
      'REVIEWED',
      'PROCESSED',
      'VOIDED',
    ].includes(value)
  )
    throw new HttpError(400, 'Status is invalid.');
  return value as RecordStatus;
}

export function ensureStatusPermission(
  role: 'OWNER' | 'ACCOUNTANT',
  current: string,
  next: RecordStatus,
) {
  if (current === 'VOIDED' && next !== 'VOIDED')
    throw new HttpError(400, 'Voided records preserve their final status.');
  if (next === 'REVIEWED' && current !== 'READY_FOR_REVIEW')
    throw new HttpError(400, 'Only a record ready for review can be reviewed.');
  if (next === 'PROCESSED' && current !== 'REVIEWED')
    throw new HttpError(400, 'Only a reviewed record can be processed.');
  const allowed =
    role === 'OWNER'
      ? ['NEW', 'MISSING_INFORMATION', 'READY_FOR_REVIEW', 'VOIDED']
      : ['MISSING_INFORMATION', 'READY_FOR_REVIEW', 'REVIEWED', 'PROCESSED'];
  if (!allowed.includes(next))
    throw new HttpError(403, 'Your role cannot assign this status.');
}

export function savedFilterType(value: unknown) {
  if (
    typeof value !== 'string' ||
    !['TRANSACTIONS', 'RECEIPTS', 'AUDIT'].includes(value)
  )
    throw new HttpError(400, 'Saved filter type is invalid.');
  return value as 'TRANSACTIONS' | 'RECEIPTS' | 'AUDIT';
}
