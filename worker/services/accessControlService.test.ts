import { describe, expect, it } from 'vitest';
import {
  assertPermission,
  assertRecordAccess,
  canAccessRecord,
  hasPermission,
  isAccessWindowActive,
  loadAuthorizationContext,
  maximumAccessScopes,
  recordAccessPredicate,
  type AuthorizationContext,
  type AccessScope,
} from './accessControlService';

const now = new Date('2026-11-10T00:00:00.000Z');
const grant = (overrides: Partial<AccessScope> = {}): AccessScope => ({
  businessAccountId: 'account',
  userId: 'user',
  scopeType: 'ACCOUNT',
  businessId: null,
  legalEntityId: null,
  dateFrom: null,
  dateTo: null,
  ...overrides,
});
const context = (
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext => ({
  userId: 'user',
  businessAccountId: 'account',
  role: 'AUDITOR',
  membershipStatus: 'ACTIVE',
  userStatus: 'ACTIVE',
  accountStatus: 'ACTIVE',
  accessStartsAt: null,
  accessExpiresAt: '2027-01-01T00:00:00.000Z',
  scopes: [grant()],
  ...overrides,
});
const record = {
  businessAccountId: 'account',
  businessId: 'business',
  legalEntityId: 'entity',
  effectiveDate: '2026-11-10',
};

describe('membership access windows', () => {
  it('includes the start and excludes the expiry instant', () => {
    const window = {
      accessStartsAt: now.toISOString(),
      accessExpiresAt: '2026-11-10T00:00:01.000Z',
    };
    expect(isAccessWindowActive(window, now)).toBe(true);
    expect(isAccessWindowActive(window, new Date(now.getTime() - 1))).toBe(
      false,
    );
    expect(isAccessWindowActive(window, new Date(window.accessExpiresAt))).toBe(
      false,
    );
  });
  it.each([
    { accessStartsAt: 'invalid', accessExpiresAt: null },
    { accessStartsAt: null, accessExpiresAt: '2027-02-30T00:00:00.000Z' },
    { accessStartsAt: '2026-01-01', accessExpiresAt: null },
    {
      accessStartsAt: '2027-01-01T00:00:00.000Z',
      accessExpiresAt: '2026-01-01T00:00:00.000Z',
    },
    { accessStartsAt: now.toISOString(), accessExpiresAt: now.toISOString() },
  ])('rejects invalid or inverted windows %j', (window) => {
    expect(isAccessWindowActive(window, now)).toBe(false);
  });
  it('allows unbounded legacy access but requires auditor expiry', () => {
    expect(
      hasPermission(
        context({ role: 'OWNER', accessExpiresAt: null }),
        'RECORD_VIEW',
        now,
      ),
    ).toBe(true);
    expect(
      hasPermission(
        context({ role: 'ACCOUNTANT', accessExpiresAt: null }),
        'RECORD_VIEW',
        now,
      ),
    ).toBe(true);
    expect(
      hasPermission(context({ accessExpiresAt: null }), 'RECORD_VIEW', now),
    ).toBe(false);
    expect(isAccessWindowActive(context(), new Date('invalid'))).toBe(false);
  });
});

describe('active role permissions', () => {
  it('separates read-only audit, accountant review, and owner administration', () => {
    expect(hasPermission(context(), 'AUDIT_VIEW', now)).toBe(true);
    for (const permission of [
      'RECORD_CREATE',
      'RECORD_EDIT',
      'RECORD_DELETE',
      'REVIEW_UPDATE',
      'COMMENT_CREATE',
      'ATTACHMENT_UPLOAD',
      'ATTACHMENT_DOWNLOAD',
      'REPORT_EXPORT',
      'ARCHIVE_EXPORT',
      'MEMBER_MANAGE',
    ] as const) {
      expect(hasPermission(context(), permission, now)).toBe(false);
    }
    expect(
      hasPermission(context({ role: 'ACCOUNTANT' }), 'REVIEW_UPDATE', now),
    ).toBe(true);
    expect(
      hasPermission(context({ role: 'ACCOUNTANT' }), 'ARCHIVE_EXPORT', now),
    ).toBe(false);
    expect(
      hasPermission(context({ role: 'OWNER' }), 'ARCHIVE_EXPORT', now),
    ).toBe(true);
    expect(() => assertPermission(context(), 'COMMENT_CREATE', now)).toThrow(
      'permission',
    );
  });
  it.each([
    { membershipStatus: 'INVITED' },
    { membershipStatus: 'DISABLED' },
    { membershipStatus: 'EXPIRED' },
    { userStatus: 'DISABLED' },
    { accountStatus: 'SUSPENDED' },
    { scopes: [] },
    { accessExpiresAt: now.toISOString() },
    { userId: '' },
    { businessAccountId: '' },
    { scopes: Array.from({ length: maximumAccessScopes + 1 }, () => grant()) },
  ])('fails closed for unavailable access %j', (overrides) => {
    expect(hasPermission(context(overrides), 'RECORD_VIEW', now)).toBe(false);
    expect(
      recordAccessPredicate(context(overrides), 'EXPENSE', 'e', now),
    ).toEqual({ sql: '0=1', bindings: [] });
  });
  it.each([
    { businessAccountId: 'foreign' },
    { userId: 'another' },
    { scopeType: 'BUSINESS' as const },
    { scopeType: 'LEGAL_ENTITY' as const },
    { businessId: 'unexpected' },
    { dateFrom: '2026-02-30' },
    { dateTo: 'not-a-date' },
    { dateFrom: '2026-12-01', dateTo: '2026-01-01' },
  ])(
    'rejects malformed grant %j without retaining other grants',
    (overrides) => {
      expect(
        hasPermission(
          context({ scopes: [grant(), grant(overrides)] }),
          'RECORD_VIEW',
          now,
        ),
      ).toBe(false);
    },
  );
  it('rejects absent context and returns not-found for an unauthorized record', () => {
    expect(hasPermission(null, 'RECORD_VIEW', now)).toBe(false);
    expect(() =>
      assertRecordAccess(
        context(),
        { ...record, businessAccountId: 'foreign' },
        now,
      ),
    ).toThrow('not found');
  });
});

describe('persisted record scopes', () => {
  it('matches each grant with its own dates instead of combining restrictions', () => {
    const actor = context({
      scopes: [
        grant({
          scopeType: 'BUSINESS',
          businessId: 'business',
          dateFrom: '2026-04-01',
          dateTo: '2026-04-30',
        }),
        grant({
          scopeType: 'LEGAL_ENTITY',
          legalEntityId: 'other',
          dateFrom: '2026-11-01',
          dateTo: '2026-11-30',
        }),
      ],
    });
    expect(canAccessRecord(actor, record, now)).toBe(false);
    expect(
      canAccessRecord(actor, { ...record, effectiveDate: '2026-04-01' }, now),
    ).toBe(true);
    expect(
      canAccessRecord(actor, { ...record, effectiveDate: '2026-04-30' }, now),
    ).toBe(true);
    expect(
      canAccessRecord(actor, { ...record, effectiveDate: '2026-05-01' }, now),
    ).toBe(false);
    expect(
      canAccessRecord(
        actor,
        { ...record, businessId: 'unrelated', legalEntityId: 'other' },
        now,
      ),
    ).toBe(true);
  });
  it('checks historical entity attribution even for the same business', () => {
    const actor = context({
      scopes: [grant({ scopeType: 'LEGAL_ENTITY', legalEntityId: 'entity' })],
    });
    expect(canAccessRecord(actor, record, now)).toBe(true);
    expect(
      canAccessRecord(
        actor,
        { ...record, legalEntityId: 'previous-operator' },
        now,
      ),
    ).toBe(false);
    expect(
      canAccessRecord(actor, { ...record, businessAccountId: 'foreign' }, now),
    ).toBe(false);
    expect(
      canAccessRecord(actor, { ...record, effectiveDate: 'invalid' }, now),
    ).toBe(false);
  });
  it('uses Auckland calendar days for timezone-qualified source instants', () => {
    const actor = context({
      scopes: [grant({ dateFrom: '2026-09-27', dateTo: '2026-09-27' })],
    });
    expect(
      canAccessRecord(
        actor,
        { ...record, effectiveDate: '2026-09-26T12:00:00.000Z' },
        now,
      ),
    ).toBe(true);
    expect(
      canAccessRecord(
        actor,
        { ...record, effectiveDate: '2026-09-27T10:59:59.999Z' },
        now,
      ),
    ).toBe(true);
    expect(
      canAccessRecord(
        actor,
        { ...record, effectiveDate: '2026-09-27T11:00:00.000Z' },
        now,
      ),
    ).toBe(false);
  });
  it('binds malicious-looking scope IDs as values and rejects SQL alias injection', () => {
    const malicious = "x' OR 1=1 --";
    const actor = context({
      scopes: [grant({ scopeType: 'BUSINESS', businessId: malicious })],
    });
    const predicate = recordAccessPredicate(actor, 'EXPENSE', 'e', now);
    expect(predicate.sql).not.toContain(malicious);
    expect(predicate.bindings).toContain(malicious);
    expect(() =>
      recordAccessPredicate(actor, 'EXPENSE', 'e; DROP TABLE users', now),
    ).toThrow();
  });

  it('keeps a maximum-sized predicate bounded and denies access after expiry', () => {
    const actor = context({
      scopes: Array.from({ length: maximumAccessScopes }, (_, index) =>
        grant({
          scopeType: 'BUSINESS',
          businessId: `business-${index}`,
          dateFrom: '2026-04-01',
          dateTo: '2027-03-31',
        }),
      ),
    });
    expect(
      recordAccessPredicate(actor, 'EXPENSE', 'e', now).bindings,
    ).toHaveLength(1 + 3 * maximumAccessScopes);
    expect(
      recordAccessPredicate(
        actor,
        'EXPENSE',
        'e',
        new Date(actor.accessExpiresAt!),
      ),
    ).toEqual({ sql: '0=1', bindings: [] });
  });
});

describe('fresh authorization context loading', () => {
  it('loads current membership and bounded grants with independent account predicates', async () => {
    const actor = context();
    const queries: { sql: string; values: unknown[] }[] = [];
    const db = {
      prepare(sql: string) {
        const query = { sql, values: [] as unknown[] };
        queries.push(query);
        return {
          bind(...values: unknown[]) {
            query.values = values;
            return {
              first: () => Promise.resolve(actor),
              all: () => Promise.resolve({ results: actor.scopes }),
            };
          },
        };
      },
    } as unknown as D1Database;
    const loaded = await loadAuthorizationContext(
      db,
      { id: 'user', businessAccountId: 'account' },
      now,
    );
    expect(queries[0].values).toEqual(['user', 'account']);
    expect(queries[1].values).toEqual([
      'account',
      'user',
      maximumAccessScopes + 1,
    ]);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.scopes[0])).toBe(true);
    expect(loaded.role).toBe('AUDITOR');
  });
});
