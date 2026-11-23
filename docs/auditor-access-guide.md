# Auditor access guide

Use Auditor for temporary inspection of permitted records, evidence previews,
financial history and report summaries. Use Accountant for comments,
reconciliation, review/processing, attributed insurance adjustments and
evidence/CSV downloads. See the [permission matrix](permissions.md).

## Invite a private auditor

1. Sign in as Owner. Open **Account settings → Auditor access → Invite an auditor**.
2. Enter the recipient's email and choose one to sixteen scopes: a business,
   historical legal entity, or Whole account. Choose the breadth needed for the
   review. An account scope grants neither administration nor exports.
3. Optionally set each scope's **Record dates from/to**. Dates are inclusive.
   Multiple scopes add access: a record must match identity and dates within at
   least one complete scope. A narrow scope does not reduce a broader one.
4. Optionally set an access start and always choose a future expiry after it.
   These fields use browser-local time; the workspace notice displays expiry in
   New Zealand time. Record dates and the membership window are separate limits.
5. Add an optional reason and choose **Send auditor invitation**.

The recipient accepts using the invited email, then requests an email sign-in
link. Acceptance creates no session. The invitation expires after the earlier
of 72 hours or access expiry. Scheduled access may be accepted early, but sign-in
must wait for its start. Production challenge and rate limits still apply. An
invitation cannot overwrite a membership or enable a globally disabled identity.

## Inspect records

The notice lists scope labels, record dates and expiry. Counts, totals, search,
pagination, historical attribution, existing comments/adjustments and financial
audit history are filtered server-side. A visible business does not grant every
historical record or related entity. Source lifecycle rules still apply.

Auditors have no source editors, uploads, comment/review controls, saved-filter
writes or administration. Supported images/PDFs can be previewed through an
authorized parent. Individual downloads, report CSVs and full ZIPs are denied.
The fixed roles have no per-auditor optional download/export grant editor.
Previewing transfers bytes and cannot prevent browser saving or screenshots.

## Change or end access

Locate the auditor in **Account settings → Auditor access** and choose
**Manage access** to edit scopes/window. Saving invalidates existing workspace
sessions; sign-in is needed again. Reload a stale form before retrying a conflict.

- **Expire access now** sets stored status to EXPIRED and ends sessions.
- **Revoke access** sets status to DISABLED and ends sessions.
- Revoke a pending invitation before acceptance; manage accepted recipients
  through their memberships instead.

Ordinary edits preserve stored status. To restore an explicitly DISABLED or
EXPIRED membership, choose **Restore auditor access with this grant** and a valid
window. A globally disabled identity cannot be enabled this way. If only time
elapsed while stored status remained ACTIVE, an owner-approved window extension
can make that grant active again. Status changes preserve identities, configured
windows, evidence and audit references.

The Worker checks current grants on every protected request. Known expiry closes
a mounted workspace without navigation; a failed focus/session check also removes
it. Late responses cannot reopen ended access. Revocation rejects future requests
immediately but cannot erase delivered data; no live push revocation is promised.

## Local and public-demo entry

| Entry                     | Access                                                                                               | Persistence                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Continue as local auditor | `auditor@local.test`; real local session, IT Contracting scope, expiry 30 days after initial seeding | Local D1/R2; normal Worker authorization                               |
| Continue as Demo Auditor  | All fictional businesses/dates and existing browser edits; no membership expiry                      | Tab-local persona and overlay; no real session/cookie or shared writes |

For an existing migrated local database, run `pnpm db:seed:local:auditor`. It does
not reset records, extend an existing expiry, restore disabled status or recreate
removed scopes. Normal local/test seed/reset commands include it. Local shortcuts
require the explicitly enabled local environment and loopback hostname.

Demo Auditor cannot edit or reset browser data. Sign out and choose Demo Owner
or Demo Accountant for their browser-local editing/reset workflow. Switching roles
grants no private access. Shared demo evidence has no R2 binding; the Worker keeps
independent read, mutation, download and export restrictions.

## Troubleshooting

| Symptom                                    | Check                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Invitation fails                           | Invited email, token expiry/revocation, existing membership and global identity status. Request a new invitation where appropriate. |
| Accepted but cannot sign in                | Membership/identity status, start/expiry and valid scopes. Acceptance is not sign-in.                                               |
| Missing record or a direct URL returns 404 | Account, business/entity scope, historical attribution, record dates and lifecycle filters.                                         |
| Access ends while working                  | Sign in during an active window or ask Owner to review the grant. A new link cannot bypass expiry/revocation.                       |
| Local Auditor is unavailable               | Apply migrations; use the additive seed if missing, or inspect status/window/scopes as local Owner if already seeded.               |
| No download/export control                 | Auditor has preview/report viewing only. A date filter does not grant exports.                                                      |

Implementation and acceptance evidence: [architecture](architecture.md),
[data model](data-model.md), [policy](permissions.md) and
[test matrix](auditor-test-matrix.md).
