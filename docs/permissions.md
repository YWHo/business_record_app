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
creation, invitations, and database constraints still support the existing
roles; defining an auditor bundle must not enable auditor sign-in before
membership scope, time-window checks, and route enforcement are ready.

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
