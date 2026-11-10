# Permission policy

Status: Phase 2 policy definitions implemented; route enforcement is pending.

`src/lib/permissions.ts` defines the shared permission vocabulary, immutable
predefined role bundles, `permissionsForRole`, and `hasPermission`. It has no
browser or Worker dependencies and can be imported by both runtimes. Do not
duplicate these bundles in UI components or backend routes.

| Permission          | Owner | Accountant | Auditor |
| ------------------- | ----- | ---------- | ------- |
| RECORD_VIEW         | Yes   | Yes        | Yes     |
| RECORD_CREATE       | Yes   | No         | No      |
| RECORD_EDIT         | Yes   | No         | No      |
| RECORD_DELETE       | Yes   | No         | No      |
| ACCOUNTING_ADJUST   | Yes   | Yes        | No      |
| REVIEW_UPDATE       | Yes   | Yes        | No      |
| COMMENT_CREATE      | Yes   | Yes        | No      |
| ATTACHMENT_VIEW     | Yes   | Yes        | Yes     |
| ATTACHMENT_UPLOAD   | Yes   | No         | No      |
| ATTACHMENT_DOWNLOAD | Yes   | Yes        | No      |
| REPORT_VIEW         | Yes   | Yes        | Yes     |
| REPORT_EXPORT       | Yes   | Yes        | No      |
| ARCHIVE_EXPORT      | Yes   | No         | No      |
| AUDIT_VIEW          | Yes   | Yes        | Yes     |
| BUSINESS_MANAGE     | Yes   | No         | No      |
| ENTITY_MANAGE       | Yes   | No         | No      |
| MEMBER_MANAGE       | Yes   | No         | No      |
| RETENTION_MANAGE    | Yes   | No         | No      |

ATTACHMENT_UPLOAD extends the plan's suggested vocabulary to distinguish
source evidence writes from record writes and evidence reads. Optional auditor
download and report-export policy grants are not enabled. Reserved database
roles (ADMIN, BOOKKEEPER, MEMBER), malformed values, and unknown roles have no
permissions. Returned bundles are frozen; callers cannot modify shared policy.

`PermissionRole` describes policy roles only. Authenticated user types, session
creation, and invitation acceptance still permit only the existing roles.
Migration 0009 adds database support for auditors, scopes, and expiry, while
explicit runtime guards keep auditor sign-in and accountant-path acceptance
unavailable until scope, time-window checks, and route enforcement are ready.

`hasPermission(context, permission)` evaluates only a predefined role grant.
It does not establish authentication or check active membership, access dates,
tenant ownership, record visibility, or a business/entity/date scope. The Worker
must perform those checks independently in later phases. Never authorize a
private request from a browser-supplied role or permission list.

These bundles describe target coarse capabilities, not a replacement for domain
rules. REVIEW_UPDATE preserves existing role-specific status transitions.
ACCOUNTING_ADJUST does not grant owners access to the dedicated accountant-only
insurance adjustment endpoint: owners retain their existing allocation editing
workflow. RECORD_DELETE does not bypass retention or purge safeguards.

Phase 2 deliberately does not wire the policy into routes or UI. Existing owner
and accountant behavior remains unchanged, including current accountant ZIP
archive access. Phase 5 must enforce the plan's archive restriction and separate
report exports from archives; it must not treat the existing evidence ZIP as a
report export. Later UI phases use these same definitions for action visibility,
with server checks remaining authoritative.

Policy tests live in `src/lib/permissions.test.ts`. They check every role against
every permission, unknown and reserved roles, missing user context, unknown
permissions, and immutable, duplicate-free grants. Existing browser workflows
remain the owner/accountant behavior regression suite. This phase introduces
no routed behavior or visual component requiring a new Playwright scenario or
Storybook story; those accompany backend enforcement and UI implementation.

## Worker authorization service (Phase 4)

`worker/services/accessControlService.ts` supplies central membership-aware
permission and visibility checks. It is implemented and tested separately from
route enforcement, which follows in Phase 5. Auditor session creation remains
blocked by the staged rollout guard.

After authenticating a private request, call `loadAuthorizationContext` with
the authenticated user's ID and account ID. It independently joins the current
membership, user, and account, then loads account/user-bound scopes. Do not
construct this context from request JSON, query parameters, browser storage,
or the role cached in a session; do not reuse it across requests. Loaded
contexts and grants are immutable. Missing/invalid grants or more than sixteen
scopes fail closed, rather than truncating to a potentially broader grant.
Membership administration must enforce this scope cap when it lands.

The Worker's `hasPermission` and `assertPermission` add active account/user/
membership checks and access-window validation to the shared role bundle.
Starts are inclusive, expiry is exclusive, malformed/inverted windows fail,
and auditors require an expiry. Missing access is forbidden (403).

`canAccessRecord` checks trusted persisted account, business, legal-entity, and
effective-date attribution. It combines grants as a union, while combining
each grant's identity and date restrictions as an intersection. It does not
substitute a business's current entity for the record's historical entity.
`assertRecordAccess` returns not-found (404) for inaccessible records.

`canAccessBusiness` and `canAccessLegalEntity` check the account-owned directory
entry and, when crossing business/entity scope, the operating periods that
overlap the grant's date range. These helpers authorize minimal identity only;
record lists, period histories, totals, reference lists, and current entity
details still need their own visibility checks. A visible business does not
make every historical record or related entity visible.

`recordAccessPredicate` produces SQL and bound values for EXPENSE, INCOME, and
WORK_SESSION roots. Apply it before returning rows, aggregating, counting, or
paginating. Pass a trusted SQL alias and retain existing lifecycle/tenant
conditions. Scope IDs are values, never SQL fragments. The sixteen-grant cap
limits a single predicate to at most 49 bindings; callers composing multiple
predicates must still respect D1's total query binding limit.

Income uses the persisted accounting-effective calendar date. Expense and
work-session source instants use Auckland calendar days: bounded grants become
inclusive midnight / exclusive next-midnight UTC ranges, calculated with the
timezone database. This handles both 23-hour and 25-hour daylight-saving days.
Attachments, comments, allocations, and reconciliations must inherit their
authoritative parent's predicate, rather than choosing a date independently.

The SQL builder and per-record checks do not authenticate sessions, authorize
mutations, or replace domain-specific rules. Callers still assert the action's
permission and validate persisted references. Demo requests need an explicit
read-only integration in Phase 5; the synthetic demo principal has no real
membership to load, and must never receive a private-authentication bypass.

Unit coverage lives in `worker/services/accessControlService.test.ts`. Real
SQLite tests in `scripts/access-control.integration.test.mjs` exercise current
membership changes, scoped directory identity, database-side counts/pagination,
and agreement between SQL predicates and per-record checks at DST boundaries.
