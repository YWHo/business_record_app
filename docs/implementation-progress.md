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

Commit: Pending phase commit

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

Status: Not started
