# Permission policy

Auditor screens use a dedicated read-only navigation and a persistent notice of
the current grant labels, record-date limits and New Zealand access expiry.
`/api/auth/me` returns only displayable grant information for this notice, without
internal authorization objects. Metadata is refreshed on window focus and the
workspace closes at its known expiry. A failed current-session check removes
the workspace; temporary network/service failures do not imply revocation.

Auditors can search, filter, paginate, inspect records and read existing comments.
Saved-filter mutations, comment composers, review controls, source editing,
uploads, retention, trash and administration are hidden. Direct form/settings
URLs redirect to read-only destinations before those workflows mount. These
are presentation guards; the Worker remains authoritative on every request.

Reports use `/api/reports/summary`, without archive status or download requests.
The dedicated `/app/audit-trail` and business `/audit-trail` screens read bounded
financial audit history. A business filter matches persisted attribution or a
surviving legacy parent, then intersects the existing server-enforced grant.
Evidence is previewed inline through scoped private preview URLs; owner and
accountant download permissions are preserved. Browser saving and screenshots
cannot be prevented by a preview-only UI.

Owner membership management now includes Auditor invitations and grants under
Account settings. `/api/auditor-access` and `/api/auditor-invitations` require
MEMBER_MANAGE and an active owner; the public demo rejects them. Invites require
one to sixteen validated account/business/entity scopes and a future expiry.
Record-date windows narrow each scope; multiple scopes grant additive access.

Acceptance preserves the invited role, scopes, and access window, consumes the
hashed token once, and creates no session. Existing account memberships cannot be
overwritten or reactivated through an invitation. Eligible auditors use normal
email sign-in with the existing production challenge and rate limits. Access
cannot begin before its configured start and ends at its exclusive expiry.

Owners can edit scopes/windows, expire access now, revoke access, or revoke a
pending invitation. Changes use optimistic revisions, atomic audit writes and
session invalidation. Editing preserves membership status; restoration requires
explicit owner selection and an active global identity. Identities, scopes and
historical references remain retained. See [ADR 018](adr/018-auditor-membership-lifecycle.md).

Status: Phase 5 backend enforcement implemented. Auditor invitation/session
creation and the dedicated auditor UI remain later phases.

`src/lib/permissions.ts` defines the shared permission vocabulary, immutable
predefined role bundles, `permissionsForRole`, and `hasPermission`. It has no
browser or Worker dependencies and can be imported by both runtimes. Do not
duplicate these bundles in UI components or backend routes.

| Permission           | Owner | Accountant | Auditor |
| -------------------- | ----- | ---------- | ------- |
| RECORD_VIEW          | Yes   | Yes        | Yes     |
| RECORD_CREATE        | Yes   | No         | No      |
| RECORD_EDIT          | Yes   | No         | No      |
| RECORD_DELETE        | Yes   | No         | No      |
| ACCOUNTING_ADJUST    | Yes   | Yes        | No      |
| REVIEW_UPDATE        | Yes   | Yes        | No      |
| COMMENT_CREATE       | Yes   | Yes        | No      |
| ATTACHMENT_VIEW      | Yes   | Yes        | Yes     |
| ATTACHMENT_UPLOAD    | Yes   | No         | No      |
| ATTACHMENT_DOWNLOAD  | Yes   | Yes        | No      |
| REPORT_VIEW          | Yes   | Yes        | Yes     |
| REPORT_EXPORT        | Yes   | Yes        | No      |
| ARCHIVE_EXPORT       | Yes   | No         | No      |
| AUDIT_VIEW           | Yes   | Yes        | Yes     |
| BUSINESS_MANAGE      | Yes   | No         | No      |
| ENTITY_MANAGE        | Yes   | No         | No      |
| MEMBER_MANAGE        | Yes   | No         | No      |
| RETENTION_MANAGE     | Yes   | No         | No      |
| RETENTION_VIEW       | Yes   | Yes        | No      |
| ARCHIVE_HISTORY_VIEW | Yes   | Yes        | No      |
| FILTER_MANAGE        | Yes   | Yes        | No      |

ATTACHMENT_UPLOAD extends the plan's suggested vocabulary to distinguish
source evidence writes from record writes and evidence reads. Optional auditor
download and report-export policy grants are not enabled. Reserved database
roles (ADMIN, BOOKKEEPER, MEMBER), malformed values, and unknown roles have no
permissions. Returned bundles are frozen; callers cannot modify shared policy.

The Worker recognizes AUDITOR on existing sessions and validates current grants
and access windows before data access. Session creation, email login requests,
and accountant invitation acceptance remain guarded until Phase 6 adds the
auditor lifecycle. No public signup or self-registration is enabled.

`hasPermission(context, permission)` evaluates only a predefined role grant.
It does not establish authentication or check active membership, access dates,
tenant ownership, record visibility, or a business/entity/date scope. The Worker
performs those checks independently at the API boundary. Never authorize a
private request from a browser-supplied role or permission list.

These bundles describe target coarse capabilities, not a replacement for domain
rules. REVIEW_UPDATE preserves existing role-specific status transitions.
ACCOUNTING_ADJUST does not grant owners access to the dedicated accountant-only
insurance adjustment endpoint: owners retain their existing allocation editing
workflow. RECORD_DELETE does not bypass retention or purge safeguards.

Phase 5 wires the policy into the API router. Accountants retain review,
individual evidence downloads, and bounded CSV summary exports; full ZIP
archives now require owner permission and unrestricted account scope. The
summary is a separate report, not an evidence archive. Later auditor UI phases
use the same definitions for visibility, with server checks authoritative.

Policy tests live in `src/lib/permissions.test.ts`. They check every role against
every permission, unknown and reserved roles, missing user context, unknown
permissions, and immutable, duplicate-free grants. Existing browser workflows
remain the owner/accountant behavior regression suite. Phase 5 adds HTTP/SQLite
integration coverage, a real-D1 auditor API scenario, and export-action unit
tests and Storybook states. The original Phase 2 introduced only policy code.

## Worker authorization service (Phase 4)

`worker/services/accessControlService.ts` supplies central membership-aware
permission and visibility checks. It is implemented and tested separately from
route enforcement, applied in Phase 5. Auditor session creation remains
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

## API enforcement (Phase 5)

The Worker registry assigns every protected handler an explicit permission.
Unknown policy mappings fail closed. Public authentication, invitation-token
acceptance, and secret-backed bootstrap retain their own guards. Private
requests load current membership/scopes once into a request-local environment;
role/scope claims in browser headers or JSON are ignored. Existing status
transitions, owner-only source mutation, accountant-only allocation adjustment,
and retention safeguards still apply after the capability check.

Auditor reads use `scopedReadDatabase`: a read-only binding supplies filtered
SQL CTEs with the original table names. Nested queries, counts, aggregates,
pagination, legacy APIs, and business routes all see the same filtered roots.
Typed details, evidence versions, comments, and reconciliations inherit parent
visibility; reference data and business/entity periods are filtered as well.
The prefix binds the account and scope JSON once, avoiding repeated per-root
scope bindings in UNION queries. It does not fetch all records into the browser.

This binding accepts only existing SELECT query shapes. Caller SQL cannot
override CTEs, address physical `main` tables, inspect schema, use numbered binds,
or contain a second statement. Its exec/batch/session interfaces reject writes.
New query shapes/tables require an explicit scope review rather than silently
bypassing the filtered views. Scope JSON is data, not SQL. Account-wide owner/
accountant source workflows retain the original D1 binding; restricted non-auditor
memberships may read scoped reports but cannot mutate or use account-wide admin
and archive capabilities.

Financial audit events follow visible source records and their known persisted
attribution. Unattributed legacy events inherit their surviving parent. Purged
record events without a surviving parent require an unbounded date grant and
matching retained attribution; unknown historical attribution is omitted for
restricted grants. New purge events retain business/entity attribution. Private
member/authentication events are excluded from auditor audit views.

`GET /api/attachments/preview?id=...` requires ATTACHMENT_VIEW and an authorized
parent. It streams supported images/PDFs inline, with private/no-store responses
and same-origin embedding only. The separate `/api/attachments/file` requires
ATTACHMENT_DOWNLOAD. Auditor metadata includes a preview URL and a null download
URL, never a raw R2 key/URL. Viewing necessarily transfers bytes; this does not
promise prevention of screenshots or browser saving.

`GET /api/reports/summary` requires REPORT_VIEW. `/api/reports/export` requires
REPORT_EXPORT and returns at most 100 grouped currency/subtype rows, with source
record counts and integer minor-unit totals. These are not cash flow, profit,
or final tax treatment; insurance totals are full premiums. Month/tax-year
filters use Auckland boundaries for source instants. Report downloads contain
no evidence, raw transaction archive, or administrative audit data. Full ZIPs
remain owner-only. The public demo retains its independent read-only/cost
boundary and disables report downloads as well as archive generation.

Unit coverage lives in `worker/services/accessControlService.test.ts`. Real
SQLite tests in `scripts/access-control.integration.test.mjs` exercise current
membership changes, scoped directory identity, database-side counts/pagination,
and agreement between SQL predicates and per-record checks at DST boundaries.
