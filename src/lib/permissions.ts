/** Shared policy only: the Worker must also verify membership, scope and time. */
export const permissions = Object.freeze([
  'RECORD_VIEW',
  'RECORD_CREATE',
  'RECORD_EDIT',
  'RECORD_DELETE',
  'ACCOUNTING_ADJUST',
  'REVIEW_UPDATE',
  'COMMENT_CREATE',
  'ATTACHMENT_VIEW',
  'ATTACHMENT_UPLOAD',
  'ATTACHMENT_DOWNLOAD',
  'REPORT_VIEW',
  'REPORT_EXPORT',
  'ARCHIVE_EXPORT',
  'AUDIT_VIEW',
  'BUSINESS_MANAGE',
  'ENTITY_MANAGE',
  'MEMBER_MANAGE',
  'RETENTION_MANAGE',
  'RETENTION_VIEW',
  'ARCHIVE_HISTORY_VIEW',
  'FILTER_MANAGE',
] as const);

export type Permission = (typeof permissions)[number];

// Reserved database roles are deliberately unsupported until defined here.
// A role bundle alone never enables sign-in or bypasses membership checks.
export type PermissionRole = 'OWNER' | 'ACCOUNTANT' | 'AUDITOR';

const rolePermissions: Readonly<Record<PermissionRole, readonly Permission[]>> =
  Object.freeze({
    OWNER: permissions,
    ACCOUNTANT: Object.freeze([
      'RECORD_VIEW',
      'ACCOUNTING_ADJUST',
      'REVIEW_UPDATE',
      'COMMENT_CREATE',
      'ATTACHMENT_VIEW',
      'ATTACHMENT_DOWNLOAD',
      'REPORT_VIEW',
      'REPORT_EXPORT',
      'AUDIT_VIEW',
      'RETENTION_VIEW',
      'ARCHIVE_HISTORY_VIEW',
      'FILTER_MANAGE',
    ] as const),
    AUDITOR: Object.freeze([
      'RECORD_VIEW',
      'ATTACHMENT_VIEW',
      'REPORT_VIEW',
      'AUDIT_VIEW',
    ] as const),
  });

const noPermissions: readonly Permission[] = Object.freeze([]);

/** Unrecognized/reserved roles have no grants, including prototype property names. */
export function permissionsForRole(role: unknown): readonly Permission[] {
  switch (role) {
    case 'OWNER':
    case 'ACCOUNTANT':
    case 'AUDITOR':
      return rolePermissions[role];
    default:
      return noPermissions;
  }
}

/** A role grant alone never establishes authentication or record access. */
export function hasPermission(
  context: { readonly role: unknown } | null | undefined,
  permission: Permission,
): boolean {
  return permissionsForRole(context?.role).includes(permission);
}
