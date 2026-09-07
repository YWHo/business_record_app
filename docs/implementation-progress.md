# Implementation progress

## Phase 1: Project scaffold

Status: Complete

Commit: `f1486a1`

Acceptance criteria completed:

- React and strict TypeScript application scaffolded with Vite.
- Client routing includes dashboard, records, and not-found routes.
- pnpm scripts cover development, linting, formatting, type checking, tests, and builds.
- Initial mobile-first accessible visual shell added.
- Installable PWA manifest and generated service worker configured.
- Vitest and React Testing Library smoke coverage added.

Notes: The private AI development specification remains outside this repository. Cloudflare local runtime bindings begin in Phase 2.

## Phase 2: Cloudflare application foundation and fully local runtime

Status: Complete

Commit: `f873cf2`

Acceptance criteria completed:

- Cloudflare Worker API and explicit browser/server trust boundary added.
- Vite and Miniflare run simulated D1 and R2 bindings without a Cloudflare account.
- Local state persists under ignored `.wrangler/state/` and has a guarded reset command.
- Local migration, seed, reset, and inspection commands added.
- Local owner/accountant sessions retain backend role enforcement.
- Hashed, expiring, single-use invitations can be exercised through a local outbox.
- Local authentication helpers require both local environment configuration and a loopback hostname.
- Demo and production declare distinct D1 and R2 resources with local helpers disabled.
- A protected R2 probe verifies local object persistence without introducing attachment behaviour early.

Notes: Production authentication remains intentionally unavailable until Phase 4. Demo and production resource identifiers are documented placeholders.

## Phase 3: Database schema and migrations

Status: Complete

Commit: `4ff2b6b`

Acceptance criteria completed:

- Added normalized business activities, vehicles, categories, clients, expenses, and specialised expense detail tables.
- Added allocations, work sessions, generated odometer distance, and full-tank workflow linkage fields.
- Added common income records with platform, contract, and subscription detail tables plus reconciliation.
- Added versioned attachments, comment threads, audit history, and saved filters.
- Added retention fields and configurable ten-tax-year/31 March retention defaults.
- Stored monetary values as integer minor units and measurements in explicit metric units.
- Added restrictive foreign keys, status/domain checks, indexes, and generated calculation columns.
- Seeded configurable expense categories and deterministic local activities, vehicles, and a synthetic client.
- Added a repeatable D1 quick-check, foreign-key check, and schema/seed verification command.

Notes: Polymorphic attachment and comment targets require Worker validation in their feature phases. Business feature APIs and screens remain intentionally deferred to their numbered phases.

## Phase 4: Authentication and roles

Status: Complete

Commit: `dbe8aed`

Acceptance criteria completed:

- Added idempotent, deployment-configured first-owner bootstrap without creating an authenticated session or permitting silent ownership transfer.
- Added passwordless email login with hashed, 15-minute, single-use challenges and eight-hour HTTP-only sessions.
- Added server-verified Turnstile for production login plus separate route-specific rate limit bindings for authentication and invitation operations.
- Added provider-neutral production email delivery and protected local authentication/invitation outboxes.
- Added owner-only user and invitation management with backend role checks.
- Added 72-hour accountant invitations with email matching, expiry, hash-only token storage, and atomic replay prevention.
- Added account disabling that preserves history and immediately revokes every active session; the owner cannot be disabled.
- Added public login, login verification, and invitation-acceptance screens plus protected application routes and owner-only management UI.
- Extended the local smoke flow across bootstrap, login links, invitations, role denial, expiry/replay rejection, disable/revocation, and R2 persistence.

Notes: Production requires real D1/R2 identifiers, `APP_ORIGIN`, Turnstile credentials, an HTTPS email relay, and secret-backed bootstrap values. Setup and relay contracts are documented in the README. Business activity and vehicle workflows begin in Phase 5.

## Phase 5: Business activities and vehicles

Status: Complete

Commit: `a91f1d5`

Acceptance criteria completed:

- Added authenticated business activity and vehicle collection APIs with owner-only create and update operations.
- Added server-side normalization, length, format, valid-calendar-date, and lifecycle-order validation.
- Kept names and registrations case-insensitively unique with clear duplicate responses.
- Added owner-controlled rename/edit, activation, and deactivation while deliberately exposing no hard-delete path.
- Preserved start/end and acquisition/retirement history, including automatic closing dates and clearing them on reactivation.
- Allowed accountants to read all active and inactive reference data while denying every mutation at the Worker boundary.
- Recorded creates, edits, activations, and deactivations in the audit log.
- Added a responsive Setup screen with owner forms and controls plus an explicitly read-only accountant presentation.
- Added unit/component coverage and extended the local smoke flow through activity and vehicle creation, normalization, duplicates, editing, lifecycle transitions, and role denial.

Notes: The Phase 3 schema already provided the required restrictive historical foreign keys, so Phase 5 required no schema migration. Mileage and work-session workflows begin in Phase 6.
