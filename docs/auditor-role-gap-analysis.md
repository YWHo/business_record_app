# Auditor role gap analysis

Status: Phase 1 complete. This is the pre-implementation baseline; Phase 2 policy
definitions are documented separately in [permissions.md](permissions.md).

Baseline: repository inspected on 9 November 2026 against
`../business_records_auditor_role_feature_plan.md`. This document describes
observed behavior and the work required, not implemented auditor capabilities.
The user's phase workflow supersedes the plan's commit instructions: stop after
each phase, suggest a commit message, and wait for the user to commit and request
the next phase.

## Current authorization and identity

| Area | Observed implementation | Required change |
| --- | --- | --- |
| Runtime roles | `worker/types.ts` and `src/features/auth/AuthContext.tsx` support OWNER and ACCOUNTANT only. | Add shared explicit permission identifiers and predefined bundles before enabling AUDITOR. Unknown roles must fail closed. |
| Membership roles | Migration 0006 permits OWNER, ACCOUNTANT, ADMIN, BOOKKEEPER, and MEMBER, though only the first two are supported by runtime types. | Add AUDITOR without activating the reserved roles or granting them fallback permissions. |
| Legacy identity roles | Migration 0001 restricts `users.role` to OWNER/ACCOUNTANT; invitations allow ACCOUNTANT only. | Update all relevant constraints and acceptance writes, not just membership types. Membership remains the authority. |
| Membership state | `business_account_members` has ACTIVE/DISABLED status and account/user identity, but no access window or scope rows. | Add access start/expiry and validated account/business/entity/date scopes; retain historical identity. |
| Request authentication | `worker/auth/authorization.ts` hashes the session cookie and joins current user, membership, and account on every protected request. Active status and session expiry are checked. | Preserve these checks and include current membership identity, window, and scope in the authorization context. |
| Session creation | `worker/services/authService.ts` selects an active membership; session creation and login-link handling have no membership-window checks. | Reject future/expired auditor memberships during login/session creation and on every subsequent request. |
| Authorization helper | `requireRole` compares a role allowlist. Many reads and some mutations use `requireUser` alone. | Introduce central permission assertions and scope-aware queries. Adding AUDITOR to a type alone would expose authenticated-only mutations. |
| Tenant boundary | Queries bind `businessAccountId`; `businessContextService.ts` checks business ownership and resolves effective-dated entity attribution. | Keep account predicates and add access-scope predicates. Existing account ownership is not sufficient for a restricted auditor. |

Do not rewrite applied migrations 0001–0008. The next ordered migration starts
at 0009. SQLite CHECK constraints require a carefully tested table rebuild or
equivalent safe migration; `ALTER TABLE ADD COLUMN` alone cannot extend role
constraints. Preserve foreign keys, unique token hashes, active-owner uniqueness,
indexes, existing sessions, and audit actor references. Test populated upgrades
with foreign keys enabled. Backfill existing memberships to account-wide access
without introducing expiry for current owners/accountants.

## Existing capability matrix

This is the current behavior to preserve except for the explicitly planned
archive restriction. It is narrower than a generic full-control role bundle.

| Capability | OWNER today | ACCOUNTANT today | AUDITOR target |
| --- | --- | --- | --- |
| Read records, dashboard, business/entity history | Account-wide | Account-wide | Scope/date constrained |
| Create/edit source records and reference data | Yes | No | No |
| Upload/replace attachments | Yes | No | No |
| Read attachment metadata and download evidence | Yes | Yes | View only by default |
| Comment and reconcile income | Yes | Yes | No |
| Update workflow state | Owner transition set | Reviewer transition set | No |
| Dedicated accountant allocation adjustment | No; owner edits source/allocation through owner workflow | Yes | No |
| Read audit history and retained trash | Yes | Yes | Permitted history only |
| Trash/restore/purge | Yes, with existing safeguards | No | No |
| Read retention settings | Yes | Yes | No administrative exposure by default |
| Change retention, members, business/entity structure | Yes | No | No |
| Generate portable ZIP archive | Yes | Yes | No |
| Separately export a report without evidence archive | No separate endpoint | No separate endpoint | Denied by default |

`worker/services/reviewService.ts` defines different status transitions for
owners and accountants. A broad REVIEW_UPDATE permission must preserve those
transition rules. `adjustInsuranceAllocation` in
`worker/routes/insuranceRecords.ts` is specifically accountant-only; do not
silently broaden that route to owners when introducing ACCOUNTING_ADJUST.
The current feature is an attributed insurance allocation adjustment, not a
general tax-classification editor.

## Backend enforcement inventory

| Surface | Current boundary | Work required before auditor activation |
| --- | --- | --- |
| `expenseRecords`, `fuelRecords`, `insuranceRecords`, `incomeRecords`, `workSessions` routes | Account-scoped source reads; owner-only source writes; specialized review mutations | Check explicit permissions and scope on both legacy and business-scoped APIs, including guessed record IDs. |
| `businesses` routes and business repositories | Account/business ownership; entity resolution from effective date | Restrict directory, details, periods, accountant groupings, dashboard aggregates, and reference lists to visible data. Preserve persisted historical entity attribution. |
| `review.ts` | Authenticated transactions, comments, status changes, reconciliations in income routes, and saved-filter operations | Deny auditor writes, including saved filters; scope search, pagination, counts, and comment targets server-side. |
| `attachments.ts` | Owner upload; authenticated metadata/file reads with account and parent checks | Separate ATTACHMENT_VIEW from ATTACHMENT_DOWNLOAD; scope every version through its authoritative parent. |
| `exports.ts` | Authenticated history/status and ZIP generation; demo ZIP denied | Separate REPORT_VIEW, REPORT_EXPORT, and ARCHIVE_EXPORT; scope history and summaries and reject forbidden requests before expensive work. |
| `governance.ts` | Authenticated audit/trash/retention reads; owner-only destructive actions/settings | Add AUDIT_VIEW and scoped history/trash checks; keep retention management and destructive controls unavailable. |
| `accounts.ts`, `invitationService.ts` | Owner-only membership administration; accountant-only invitations | Add dedicated auditor invitation/access lifecycle with validated scopes/windows and audit events. |
| Activities, vehicles, categories, clients | Account/business reads and owner-only lifecycle changes | Scope reference visibility and use BUSINESS_MANAGE for writes without weakening tenant checks. |
| Development helpers | Local environment plus loopback guards | Preserve guards. Add deterministic auditor fixtures only when authorization is safe. |

Review the complete route registry in `worker/index.ts` during Phase 5, including
development endpoints and GET routes with side effects. Do not rely on HTTP
method alone: archive generation is a GET that writes export/audit history.
Authenticated-only mutation routes must receive explicit permissions before
auditor invitations or demo auditor entry points are exposed.

## Evidence viewing and export policy

`GET /api/attachments/file?id=...` currently sends a private R2 stream with
`Content-Disposition: attachment`; metadata exposes its download URL. There is
no separate inline-view permission path. Add a controlled preview endpoint for
supported PDFs/images, validate parent scope before storage access, and omit
download actions/URLs when permission is absent. Unsupported files need a clear
unavailable-preview state. Never expose raw R2 object URLs or keys.

An inline preview necessarily transfers bytes to the browser. The product can
deny the explicit download endpoint and omit download controls, but cannot
prevent an authorized viewer from saving bytes, taking screenshots, or using
browser tools. Documentation and UI must not promise copy prevention.

The existing export is a portable ZIP containing records, evidence, audit data,
and a manifest. Month/tax-year filters do not make it a separate report export.
The plan explicitly changes accountant archive access: Phase 2 can define the
target bundles without changing route behavior; Phase 5 must deny accountant
ARCHIVE_EXPORT as well as auditor access and update existing tests/UI. Preserve
accountant individual downloads and add a distinct permitted report export
surface when enforcing that separation. Never relabel the current ZIP as a
report to bypass the policy. Auditor optional download/report grants remain
off by default; a general custom permission editor is outside scope.

## Scope, time, and revocation design requirements

- Scope rows belong to a membership in an account. Validate every referenced
  business/entity against that same account; prevent malformed scope variants.
- Multiple scope rows represent a union of grants. Within each grant, its
  business/entity and date restrictions all apply. No matching valid grant
  means no access. An account grant must be explicit, not inferred from nulls.
- Access windows use timezone-qualified instants: start is inclusive and expiry
  exclusive. Auditor expiry is required by default. Record date ranges use
  inclusive accounting-effective calendar dates and are distinct from the
  membership access window.
- Use existing effective-date semantics, including Auckland calendar dates for
  timezone-qualified expense/work-session timestamps and the relevant income
  transaction dates. Test timezone and boundary cases.
- Entity scopes filter persisted record attribution, not only a business's
  current entity. A business that changed operator must not reveal records from
  the wrong entity through details, totals, comments, or attachments.
- Filter in SQL before aggregation, pagination, and limits. Apply the same
  predicate to directory counts, missing-evidence summaries, search, audit,
  reference data, reports, attachment versions, and direct-ID lookups.
- Audit events without clear permitted attribution need an explicit safe
  visibility rule; do not expose account-wide membership/security payloads to
  a business-scoped auditor. Never return tokens or implementation secrets.
- Re-read membership/window/scope on every protected request. Owner revocation
  must invalidate sessions immediately; scope/expiry changes cannot rely on a
  cached browser role. Retain memberships and audit references.
- Expiry denies access even if no scheduled process materializes an EXPIRED
  status. If expiry events are recorded, make them idempotent and avoid logging
  every rejected request or ordinary page view.

## Membership and client gaps

`src/routes/UserManagementPage.tsx` has an inline accountant invitation form,
user role/status table, disable action, and invitation history. It has no scope,
access dates, revocation/expiry editing, or auditor invitation page. Keep owner
administration separate and introduce the requested dedicated auditor form.
Invitation token expiry (currently 72 hours) is distinct from auditor access
expiry. Acceptance must atomically retain the invited grant and must not
reactivate a disabled identity or silently expand an existing membership.

`AuthContext.tsx`, `ShellLayouts.tsx`, record/detail pages, `AttachmentPanel`,
`TransactionsPage`, `GovernancePage`, and `ExportsPage` use role checks and
assume authenticated non-owners can review. Replace action visibility with
shared permissions, preserving business URLs and unsaved-change protection.
Auditors need textual role/scope/expiry indicators, permission-safe direct
routes, read-only adjustment/history displays, and no composers or mutation
controls. Accountants retain review access and must not be labelled read-only.

## Public demo

The demo Worker uses a fixed synthetic ACCOUNTANT read principal. The UI stores
OWNER/ACCOUNTANT simulation in sessionStorage and applies visitor changes using
the IndexedDB overlay in `src/features/demo/demoStore.ts`. No server login or
session exists. The backend independently rejects writes and has no R2 binding.

Phase 9 should add a browser-local auditor persona only after UI permission
checks exist. Reject auditor overlay mutations centrally as well as hiding
controls. Keep reset browser-local and retain all demo rate limits, read caps,
cache behavior, no-email/no-archive restrictions, and environment isolation.
Never trust the demo role to authorize private backend requests.

## Delivery and validation gates

Follow the plan's eleven phases, stopping for user commit after each. Phase 1
only creates this inventory and updates progress; there is no runtime or UI
change to exercise with new unit/e2e tests or stories.

| Phase | Deliverable and required validation |
| --- | --- |
| 2: Permission model | Central definitions/bundles and fail-closed unit matrix; preserve current route behavior until enforcement. |
| 3: Schema | Populated migration regression, constraints/indexes, foreign-key checks, existing memberships/session/audit preservation. Do not expose auditor login yet. |
| 4: Authorization | Unit tests for status, windows, scope unions, invalid grants, tenant mismatch, effective dates, and direct-record access. |
| 5: Backend | Real local Worker/D1/R2 API e2e for auditor reads, every mutation family, GET side effects, ID tampering, query scope, attachment preview/download, report/archive separation, and owner/accountant regression. |
| 6: Membership | Unit/API and Playwright invitation acceptance, scope/window validation, replay, scope/expiry changes, immediate revocation; stories for new reusable membership UI. |
| 7: Auditor UI | Component tests, Storybook role/scope/expiry/empty/error states, and Playwright read-only navigation/direct routes across phone/tablet/desktop. |
| 8: Accountant cleanup | Review/comment/reconciliation/allocation and export regression tests; stories distinguish review from audit access. |
| 9: Demo Auditor | Browser-local persona, overlay write rejection, reload/reset/isolation e2e, and demo backend protections. |
| 10: Certification | Consolidate full role/permission/scope/window matrix, API tampering, expiry/revocation, visual/responsive checks; coverage must already accompany earlier features. |
| 11: Documentation | Reconcile README, architecture, data model, role matrix, operations and progress with verified final behavior. |

Use pnpm throughout. Run relevant unit/component, migration, API/browser e2e,
and Storybook checks as their surfaces change, plus lint/typecheck/build gates
appropriate to each phase. E2e must use `.wrangler/state/e2e/`, preserving the
development showcase. Do not deploy or modify remote resources as part of this
implementation. Record actual verification outcomes; do not describe planned
coverage as passing tests.
