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

## Phase 6: Mileage and work sessions

Status: Complete

Commit: `740661b`

Acceptance criteria completed:

- Added authenticated work-session list, create, and edit APIs with owner-only mutations and accountant read access.
- Required active activities and vehicles for new sessions while allowing historical sessions to retain subsequently inactive references.
- Added strict server validation for timezone-qualified instants, valid calendar values, chronological order, odometer order/range, notes, currencies, and decimal revenue.
- Kept business distance authoritative as the existing D1 generated column; caller-provided distance values are ignored.
- Converted optional gross revenue into integer minor units before persistence.
- Derived session duration, business kilometres, revenue/hour, and revenue/km from persisted source values after every create or edit.
- Added aggregate mileage analytics that suppress rates when revenue is incomplete, distance is zero, or currencies differ.
- Applied configured tax-year retention dates and activity-linked audit events to work-session changes.
- Added a responsive Mileage screen with owner entry/edit forms, computed summaries, session history, and a read-only accountant presentation.
- Added calculation, validation, retention, and component tests and extended the local acceptance suite through inactive-reference rejection, odometer rejection, authoritative distance, recalculation, aggregation, and role denial.

Notes: Phase 7 will extend work sessions with fuel records, full-tank confirmations, optional receipt linkage, and fuel-efficiency/cost analytics. Phase 6 deliberately does not claim GPS or trip-level tracking.

## Phase 7: Fuel tracking and full-tank workflow

Status: Complete

Commit: `1e8a8a1`

Acceptance criteria completed:

- Added authenticated fuel-expense list, create, and edit APIs backed by the common expense record and one-to-one fuel details.
- Required owner authorization for mutations while retaining accountant read access and server-side validation of references, timestamps, money, GST, measurements, fill type, and text limits.
- Kept fuel price and litres optional, returning a non-blocking confirmation response when either is omitted.
- Added a material receipt-total comparison using the greater of one currency unit or two percent, with explicit save-anyway confirmation instead of silent rejection.
- Stored receipt and GST amounts as integer minor units and pump price as integer millionths per litre; applied the configured New Zealand tax-year retention policy and audit history to fuel changes.
- Added same-vehicle starting/ending receipt linkage to work sessions, with an optional starting receipt and an ending full-fill receipt as the calculation evidence.
- Required explicit tank-full-at-start, no-personal-driving, and tank-full-at-end confirmations before any result can be labelled exact.
- Derived business distance, ending-refill litres/cost, km/L, and fuel cost/km from persisted source values; incomplete confirmations are clearly labelled estimates and insufficient ending evidence is unavailable.
- Added responsive Fuel entry/history and Mileage full-tank workflow interfaces, including Go back and Save anyway warning actions and read-only accountant presentation.
- Added unit/component coverage and extended the local acceptance suite through warning confirmation, material mismatch, exact/estimated analytics, linkage, and role denial.

Notes: The Phase 3 schema already included fuel details and session linkage fields, so no migration was required. Phase 8 adds parking and general expenses.

## Phase 8: Parking and general expenses

Status: Complete

Commit: `17e5402`

Acceptance criteria completed:

- Added authenticated parking and general-expense list, create, and edit APIs with owner-only mutations and accountant read access.
- Persisted both record families through the common expense model with activity, category, merchant, purchase instant, amount, currency, GST, description, recurrence, status, creator, audit, and retention fields.
- Added specialised parking details for optional vehicle/provider/start/end/reference plus required location.
- Required timezone-qualified parking instants, rejected reversed intervals, and derived duration from persisted start/end values without storing a second authoritative duration.
- Added flexible general expenses using configurable active categories, supporting software, hosting, training, professional services, and future unstructured costs without new detail tables.
- Added authenticated category listing and owner-only create, rename, activate, and deactivate operations with case-insensitive uniqueness and audit history.
- Kept the specialised Fuel and Parking categories active so their workflows cannot be disabled accidentally, while custom and other seeded categories remain lifecycle-managed.
- Added explicit one-off/recurring controls and displays to parking and general expenses.
- Replaced the Records placeholder with responsive parking/general entry, editing, and history views, and added category management to Setup.
- Added validation/component tests and extended the local acceptance suite through category lifecycle, recurrence, parking duration/recalculation, general-expense editing, normalization, and role denial.

Notes: The Phase 3 tables already contained all Phase 8 columns, so no migration was required. Attachments remain deferred to Phase 11. Phase 9 adds insurance and mixed-use allocations.

## Phase 9: Insurance and mixed-use allocation

Status: Complete

Commit: `878c696`

Acceptance criteria completed:

- Added authenticated insurance list, create, and edit APIs using common expense fields plus specialised policy details.
- Supported professional/liability, vehicle, and other insurance with validated provider, policy number, policy period, full premium, optional GST, recurrence, activity, and vehicle references.
- Required a business activity for professional liability cover and a vehicle for vehicle cover while preserving full premium independently from business allocation.
- Implemented 100% business, manual percentage, business-km-over-total-km, accountant adjustment, and undetermined allocation methods.
- Derived percentage-based allocated amounts from the authoritative premium, stored percentages as basis points, and required a dated calculation period for kilometres-based allocations.
- Added a narrowly scoped adjustment endpoint for accountants without granting them source policy or premium mutation rights.
- Attributed adjustments to the reviewing user and preserved before/after methods, percentages, and allocated minor-unit amounts in immutable audit summaries.
- Recalculated percentage allocations when the owner changes a premium while keeping source and allocated values separately visible.
- Added an Insurance screen for owner policy entry/editing and owner/accountant adjustment, with explicit wording that allocations are estimates rather than final accounting or tax treatment.
- Added calculation and component tests and extended the clean local acceptance suite through policy requirements, full/manual allocation, premium recalculation, accountant adjustment, reviewer attribution, audit history, retention, and role denial.

Notes: The Phase 3 schema already provided insurance detail and allocation tables, so no migration was required. Specialised insurance categories now remain active alongside Fuel and Parking. Phase 10 adds income tracking.

## Phase 10: Income

Status: Complete

Commit: `8119b0b`

Acceptance criteria completed:

- Added one authenticated income collection API with owner-only source mutation and accountant read access across platform, contract, subscription, and general income.
- Kept platform providers configurable and retained payout periods, gross earnings, tips, promotions, flat-rate credit, fees, signed adjustments, net payment, currency, activity, and notes.
- Added reusable lifecycle-managed clients plus unique per-client contract invoices with invoice/service dates, subtotal, GST, total, due date, received amount, payment status, and derived outstanding value.
- Kept subscription records at period-summary level with gross revenue, refunds, platform/payment fees, net payment, and optional aggregate subscriber counts; no subscriber database was introduced.
- Supported general section 23 income through the common model without requiring a specialised detail table.
- Added append-only manual expected-versus-actual reconciliation for both roles with D1-derived difference, match status, reviewer attribution, and audit history; no bank API was introduced.
- Preserved each family's reporting meaning in the common value: net payout for platform/subscription, invoice value for contracts, and entered value for general income.
- Added an Income workspace with dynamic owner entry/editing, contract payment visibility, summaries, and reconciliation controls; accountants receive an explicitly read-only source view.
- Added client management to Setup while preserving inactive historical references and exposing no hard-delete path.
- Added validation/component tests and extended the clean local acceptance suite across all income types, duplicate invoice/client protection, contract part-payment, reconciliation, summaries, and role denial.

Notes: The Phase 3 schema already included income, typed detail, client, reconciliation, retention, and audit structures, so no migration was required. Phase 11 adds private versioned attachments.

## Phase 11: Attachments and duplicate detection

Status: Complete

Commit: `d686f3f`

Acceptance criteria completed:

- Added authenticated attachment listing and controlled download routes for expenses, income, and work sessions without exposing public R2 object URLs.
- Added owner-only multipart uploads supporting multiple documents per record, with a 25 MB per-file limit and server validation of parent records, filenames, declared MIME types, and content signatures.
- Supported JPEG, PNG, WebP, and PDF while rejecting empty, unsupported, oversized, and MIME-spoofed uploads before storage.
- Calculated and persisted full SHA-256 hashes and returned confirmable warnings for identical content or repeated current filenames instead of automatically rejecting suspected duplicates.
- Generated every R2 object key server-side from verified record context and UUIDs, preventing caller-controlled paths and silent overwrites.
- Implemented immutable replacement versions with stable version groups, incrementing version numbers, exactly one current version per group, and continued retrieval of historical bytes.
- Copied retention and purge-eligibility dates from the parent record and wrote attachment/version audit events without logging filenames or contents.
- Forced authenticated downloads with attachment disposition, no-sniff protection, and private no-store caching.
- Embedded reusable document controls in parking, general expense, fuel, insurance, income, and work-session cards; accountants receive read/download access without mutation controls.
- Added signature/hash and component coverage and extended the clean local acceptance suite through authorization, upload validation, R2 retrieval, duplicate warning/override, multi-attachment storage, and immutable replacement history.

Notes: The Phase 3 schema and Phase 2 private R2 bindings already provided the required storage structures, so no migration was required. Phase 12 adds search, saved filters, comments, statuses, and review workflow.

## Phase 12: Search, filters, and review workflow

Status: Complete

Commit: `ec1aca8`

Acceptance criteria completed:

- Added a unified authenticated transaction projection over live income and expenses while retaining specialised source tables as authoritative.
- Added parameterized search and filters for text, date range, New Zealand tax year, activity, direction, subtype, category, status, vehicle, amount range, attachment presence, and review state.
- Added a receipt-focused log that includes both present and missing evidence and exposes the existing private attachment controls.
- Added per-user saved transaction/receipt filters with allow-listed criteria, scoped uniqueness, create, list, update, apply, and removal operations.
- Added append-only owner/accountant comment threads with validated messages, stable author identity, role, timestamp, and polymorphic record validation.
- Added backend-enforced owner preparation/voiding and accountant review/processing permissions with ready-before-review and reviewed-before-processed transitions.
- Preserved voided records as terminal history and recorded meaningful status/review changes in the audit log.
- Stored reviewer identity and time for financial records and automatically reset status/review attribution whenever an owner edits source data.
- Added a responsive Transactions workspace with transaction/receipt modes, result summaries, saved views, status controls, review attribution, and expandable comments.
- Added workflow/component tests and extended the clean local acceptance suite through combined search, evidence counts, tax-year/amount filtering, saved-view isolation, role denial, accountant attribution, comment history, and source-edit review reset.

Notes: The Phase 3 schema already included statuses, reviewer fields, comments, saved filters, and audit structures, so no migration was required. Phase 13 adds the audit log interface, trash/restore, and retention-enforced purge controls.

## Phase 13: Audit, trash, and retention

Status: Complete

Commit: Pending

Acceptance criteria completed:

- Added an authenticated, read-only audit-log API and workspace with user, action, entity, date, and activity filtering plus per-user saved audit views.
- Exposed actor identity, business activity, summary, entity reference, timestamp, and safe structured changed-field metadata without adding any audit mutation route.
- Added owner-only move-to-trash controls that retain typed detail, comments, documents, review attribution, retention dates, and the previous workflow status.
- Added owner-only restore that clears deletion state and recovers the pre-trash status from immutable audit history; purge-pending records cannot be restored.
- Added a shared trash view for expenses, income, and work sessions with stored retention dates, calculated purge eligibility, and interrupted-purge state; accountants retain read-only access.
- Enforced permanent deletion at the Worker boundary: only the owner, only a trashed record, only after its stored tax-year boundary, and only with an explicit irreversible confirmation.
- Removed eligible records' private R2 objects, polymorphic metadata/comments, specialised child rows, and source rows while retaining a permanent actor-attributed purge audit event.
- Protected fuel evidence still referenced by a work session and made cross-store purge interruption visible and safely retryable.
- Added authenticated retention-policy read access and owner-only validated settings changes with a seven-tax-year minimum and valid tax-year calendar boundary; existing evidence dates are never shortened retroactively.
- Added retention/service and governance component tests and extended the clean local acceptance suite through role denial, trash visibility, early-purge prevention, restore, explicit confirmation, eligible purge, audit filtering, and D1 integrity.

Notes: The stable Phase 3 schema already contained deletion, retention, purge, audit, saved-filter, and policy fields, so no migration was required. Automatic purge remains deliberately out of scope. Phase 14 adds portable exports and the backup-reminder workflow.
