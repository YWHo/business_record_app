import type { ReactNode } from 'react';

export type StatusTone =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'NEW'
  | 'MISSING_INFORMATION'
  | 'READY_FOR_REVIEW'
  | 'REVIEWED'
  | 'PROCESSED'
  | 'VOIDED'
  | 'TRASHED';

const statusLabel = (status: StatusTone) =>
  status
    .toLocaleLowerCase('en-NZ')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toLocaleUpperCase('en-NZ'));

export function StatusBadge({
  status,
  children,
}: {
  status: StatusTone;
  children?: ReactNode;
}) {
  return (
    <span className={`status-badge ${status.toLocaleLowerCase('en-NZ')}`}>
      {children ?? statusLabel(status)}
    </span>
  );
}
