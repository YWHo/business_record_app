# Auditor feature test matrix

Phase 10 records the acceptance coverage accumulated across the feature phases.
The private Worker is authoritative; browser hiding and local demo simulations
are tested separately from persisted membership enforcement.

## Roles and mutations

| Requirement                                                                                                                         | Behavioral coverage                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact Owner/Accountant/Auditor grants; unsupported roles fail closed                                                                | [Permission policy tests](../src/lib/permissions.test.ts), [authorization tests](../worker/services/accessControlService.test.ts)                           |
| Owner can operate source records and administer access                                                                              | [Critical browser workflows](../e2e/critical-workflows.spec.ts), [membership browser flow](../e2e/auditor-membership.spec.ts)                               |
| Accountant keeps comments, review/processing, reconciliation, attributed allocation adjustments, evidence downloads and CSV reports | [Accountant comparison](../e2e/accountant-review.spec.mjs), [HTTP integration](../scripts/auditor-api.integration.test.mjs)                                 |
| Accountant cannot administer auditor memberships or users                                                                           | [HTTP mutation matrix](../scripts/auditor-api.integration.test.mjs)                                                                                         |
| Auditor cannot create/edit/classify/review/comment/upload/trash/restore/purge/administer                                            | [HTTP mutation matrix](../scripts/auditor-api.integration.test.mjs) asserts 403 and unchanged retained database state, with no R2 get/put/head/delete calls |
| Headers, query parameters and JSON role claims cannot expand authority                                                              | [HTTP tampering and mutation cases](../scripts/auditor-api.integration.test.mjs)                                                                            |
| Auditor inspection remains usable without mutation controls                                                                         | [Auditor browser walkthrough](../e2e/auditor-ui.spec.mjs), [route guards](../src/features/auth/AuditorRouteGate.test.tsx)                                   |

## Scope, evidence and reporting

| Requirement                                                                                                                       | Behavioral coverage                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account, business and historical legal-entity attribution isolate records                                                         | [SQL-backed access checks](../scripts/access-control.integration.test.mjs), [HTTP lists/details/reports](../scripts/auditor-api.integration.test.mjs)                             |
| Date restrictions apply before counts, totals and pagination                                                                      | [SQL scope predicates](../scripts/access-control.integration.test.mjs), [HTTP report checks](../scripts/auditor-api.integration.test.mjs)                                         |
| Each additive grant keeps its own dates                                                                                           | [Central authorization tests](../worker/services/accessControlService.test.ts), [SQL integration](../scripts/access-control.integration.test.mjs)                                 |
| Date edges include the granted day across 23/25-hour Auckland days                                                                | [SQL/record agreement](../scripts/access-control.integration.test.mjs) for expense/work-session instants and income calendar dates, with independent before/at/after expectations |
| Attachments, comments, adjustments and audit events inherit source visibility                                                     | [HTTP child-resource checks](../scripts/auditor-api.integration.test.mjs), [live D1/R2 smoke](../e2e/auditor-enforcement.spec.mjs)                                                |
| Preview is separate from download; report viewing is separate from CSV and ZIP                                                    | [HTTP preview/export checks](../scripts/auditor-api.integration.test.mjs), [auditor browser flow](../e2e/auditor-ui.spec.mjs)                                                     |
| Old evidence URLs are reauthorized after scope narrowing, expiry, disabled identity/membership, missing grants or a future window | [HTTP repeated-request tests](../scripts/auditor-api.integration.test.mjs) assert rejection before bucket access and retain the original evidence                                 |

## Access lifecycle and sessions

| Requirement                                                                                                         | Behavioral coverage                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitations copy only persisted grants; token replay/concurrent acceptance fail; audit and state changes are atomic | [Lifecycle integration](../scripts/auditor-lifecycle.integration.test.mjs)                                                                                                                |
| Owner changes invalidate existing sessions; revocation/expiry preserves historical identities and audit references  | [Lifecycle integration](../scripts/auditor-lifecycle.integration.test.mjs), [membership browser flow](../e2e/auditor-membership.spec.ts)                                                  |
| Future, expired, disabled, missing-scope and wrong-account sessions fail server-side                                | [HTTP enforcement](../scripts/auditor-api.integration.test.mjs), [local auditor integration](../scripts/local-auditor.integration.test.mjs)                                               |
| A mounted private workspace expires without focus or navigation                                                     | [Timer regression](../src/features/auth/AuditorSessionLifecycle.test.tsx), [real-expiry browser scenario](../e2e/auditor-expiry.spec.ts)                                                  |
| Late responses cannot reopen expired/signed-out access or overwrite a newer authorization result                    | [Deferred-response regressions](../src/features/auth/AuditorSessionLifecycle.test.tsx)                                                                                                    |
| Transient refresh failures do not imply revocation                                                                  | [Session refresh tests](../src/features/auth/AuditorSession.test.tsx)                                                                                                                     |
| Recovery guidance remains accessible and usable on phones                                                           | [Login UI tests](../src/routes/LoginPage.test.tsx), [session-ended stories](../src/features/auth/AccessEndedNotice.stories.tsx), [expiry browser scenario](../e2e/auditor-expiry.spec.ts) |

## Local development and public demo

| Requirement                                                                                               | Behavioral coverage                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local auditor uses a real expiring grant, loads scope immediately and stays loopback-only                 | [Local SQLite integration](../scripts/local-auditor.integration.test.mjs), [local browser entry](../e2e/local-auditor.spec.ts), [local helper guards](../worker/auth/localOnly.test.ts) |
| Repeating the additive seed cannot restore or widen an existing grant                                     | [Local seed regression](../scripts/local-auditor.integration.test.mjs)                                                                                                                  |
| Demo personas create no real session/cookie and cannot change shared data                                 | [Demo boundary tests](../worker/auth/demoOnly.test.ts), [Worker demo guards](../worker/index.test.ts), [browser demo workflows](../e2e/demo-workflows.spec.ts)                          |
| Demo Auditor survives reload/focus, denies overlay mutation/reset and preserves Owner/Accountant behavior | [Demo session tests](../src/features/auth/DemoSession.test.tsx), [browser demo workflows](../e2e/demo-workflows.spec.ts)                                                                |

## Running the checks

`pnpm test` includes unit/component tests and the in-memory SQLite integration
files under `scripts/`. It needs no Cloudflare account or remote database.
`pnpm test:e2e` resets only the isolated `.wrangler/state/e2e` profile and runs
the API smoke and functional browser suites. Use `pnpm storybook:build` to verify
the role, access, preview, adjustment and session-ended stories.

Functional browser tests check behavior and responsive usability. Pixel snapshot
comparisons remain a separate optional command, `pnpm test:e2e:visual`; this phase
does not create or replace platform-specific images.
