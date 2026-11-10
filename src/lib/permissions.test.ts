import { describe, expect, it } from 'vitest';
import {
  hasPermission,
  permissions,
  permissionsForRole,
  type Permission,
  type PermissionRole,
} from './permissions';

// Explicit policy expectations: new grants require a deliberate matrix change.
const expectedGrants: Record<PermissionRole, readonly Permission[]> = {
  OWNER: [
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
  ],
  ACCOUNTANT: [
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
  ],
  AUDITOR: ['RECORD_VIEW', 'ATTACHMENT_VIEW', 'REPORT_VIEW', 'AUDIT_VIEW'],
};

describe('predefined permission policy', () => {
  for (const role of ['OWNER', 'ACCOUNTANT', 'AUDITOR'] as const) {
    it(`${role} has exactly its intended grants`, () => {
      expect([...permissionsForRole(role)].sort()).toEqual(
        [...expectedGrants[role]].sort(),
      );
      for (const permission of permissions) {
        expect(hasPermission({ role }, permission)).toBe(
          expectedGrants[role].includes(permission),
        );
      }
    });
  }

  it.each(
    [
      'ADMIN',
      'BOOKKEEPER',
      'MEMBER',
      'owner',
      'constructor',
      'toString',
      '__proto__',
      '',
      null,
      undefined,
      1,
      {},
      ['OWNER'],
    ].map((role) => ({ role })),
  )('denies every grant for unsupported role $role', ({ role }) => {
    expect(permissionsForRole(role)).toEqual([]);
    for (const permission of permissions) {
      expect(hasPermission({ role }, permission)).toBe(false);
    }
  });

  it('denies grants without a user context', () => {
    for (const permission of permissions) {
      expect(hasPermission(null, permission)).toBe(false);
      expect(hasPermission(undefined, permission)).toBe(false);
    }
  });

  it('denies unknown permissions even for owners', () => {
    expect(hasPermission({ role: 'OWNER' }, 'UNKNOWN' as Permission)).toBe(
      false,
    );
  });

  it('keeps returned policy immutable and free of duplicate grants', () => {
    expect(Object.isFrozen(permissions)).toBe(true);
    for (const role of ['OWNER', 'ACCOUNTANT', 'AUDITOR', 'UNKNOWN']) {
      const grants = permissionsForRole(role);
      expect(Object.isFrozen(grants)).toBe(true);
      expect(new Set(grants).size).toBe(grants.length);
      expect(() => (grants as Permission[]).push('ARCHIVE_EXPORT')).toThrow();
    }
    expect(hasPermission({ role: 'AUDITOR' }, 'ARCHIVE_EXPORT')).toBe(false);
  });
});
