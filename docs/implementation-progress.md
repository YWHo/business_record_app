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

Commit: `a55b5ae`

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

## Phase 14: Exports and local backup

Status: Complete

Commit: `a57c56c`

Acceptance criteria completed:

- Added authenticated monthly, configurable tax-year, and complete retained-record ZIP exports that are repeatable and never mutate or archive cloud source data.
- Exported UTF-8 CSV projections for transactions, typed income, work sessions, fuel, parking, insurance/allocation, reconciliation, comments, audit history, attachment metadata, reference data, and retention policy.
- Included every matching immutable source-attachment version under stable record/version paths while sanitizing only the human filename component.
- Added a standalone HTML completion summary plus a versioned JSON manifest describing scope, dates, units, expected/exported counts, and every included file's byte size and SHA-256 digest.
- Preflighted each expected R2 object's size and stored hash metadata, verified generated-file hashes from actual bytes, and refused incomplete or inconsistent archives.
- Added a stored-entry streaming ZIP writer that loads one bounded attachment at a time instead of buffering the whole archive.
- Added immutable D1 export completion history with actor, scope, period, counts, manifest digest, and timestamp, plus corresponding audit events.
- Added the dashboard backup reminder using the configurable interval and latest successful export, along with an Exports workspace and completion history.
- Documented the versioned restore path, archive ordering, integrity verification, and isolated recovery expectations without claiming a version 1 importer.
- Added export range, CSV, path, CRC/ZIP, and reminder tests and extended clean local acceptance through manifest file/hash validation, monthly/tax-year/full/repeated exports, attachment inclusion, reminder completion, non-destructive behavior, and D1 integrity.

Notes: Migration 0004 adds only export completion history; generated archives remain client downloads and are not duplicated in cloud storage. Phase 15 adds dashboard and profitability analytics.

## Phase 15: Dashboard and analytics

Status: Complete

Commit: `aa80f9f`

Acceptance criteria completed:

- Replaced the placeholder dashboard with authenticated, server-derived tax-year metrics and optional business-activity filtering.
- Kept recorded revenue, received cash, recorded expenses, net cash movement, and income less recorded expenses as distinct values grouped by currency.
- Used actual received amounts for contract cash movement while retaining full invoice values in recorded revenue and open balances in outstanding-invoice indicators.
- Added fuel spending, recorded litres, parking spending, total/open review indicators, and direct links into the review workflow.
- Added delivery and ride-hailing analytics by activity and currency using authoritative session duration, generated distance, session revenue, fuel, and parking records.
- Derived revenue per session/hour/km, fuel cost/km, direct operating cost, and direct operating contribution without mixing currencies or presenting final profit.
- Kept allocated insurance visible but separate from direct fuel/parking cost and suppressed revenue-derived results whenever session revenue evidence is incomplete or absent.
- Excluded trashed, purged, and voided records from current operating metrics while retaining source and audit history elsewhere.
- Added responsive dashboard filters, metric cards, review/cost/invoice panels, platform activity summaries, careful unavailable states, and explicit non-tax wording.
- Added financial separation and operating calculation tests and extended clean local acceptance through owner/accountant access, tax-year/activity filters, exact platform rates, cost/contribution, outstanding invoices, validation, and D1 integrity.

Notes: Phase 15 requires no migration because every result is derived from the normalized source tables at request time. Phase 16 completes PWA and mobile capture workflows.

## Phase 16: PWA and mobile capture

Status: Complete

Commit: `888f46f`

Acceptance criteria completed:

- Completed the installable manifest metadata and generated Workbox service worker with a versioned offline application shell and an explicit `/api` fallback exclusion.
- Added clear online/offline messaging that states records and uploads require connectivity and that version 1 does not queue changes offline.
- Added user-controlled service-worker update prompts, focus-time update checks, offline-ready feedback, registration-error feedback, and browser-provided installation prompting.
- Added a dedicated mobile rear-camera picker alongside existing image and PDF selection without narrowing the established server-side upload validation.
- Added local image and PDF previews, accessible quarter-turn image controls, file size/name review, and removal before upload.
- Stored validated 0/90/180/270-degree presentation metadata separately from immutable R2 source bytes and included it in attachment APIs and portable export indexes.
- Retained selected files after offline, network, and server failures with explicit retry controls while deliberately avoiding an offline/background upload queue.
- Improved mobile navigation, touch target sizing, input sizing, capture layout, preview controls, page spacing, and PWA status layout at narrow widths.
- Preserved semantic fieldsets, labels, live status/error regions, keyboard focus visibility, descriptive preview alternatives, and non-colour status wording.
- Added service, component, PWA-status, schema, and local acceptance coverage for rotation validation, mobile picker semantics, preview rotation, failed-upload retry, immutable bytes, export metadata, and D1 integrity.

Notes: Migration 0005 adds non-destructive attachment display rotation and advances local schema metadata to Phase 16. The static shell contains no private API data; OCR and a full offline upload queue remain intentionally out of scope. Phase 17 adds Storybook and reusable-component coverage.

## Phase 17: Storybook and component coverage

Status: Complete

Commit: `a383b65`

Acceptance criteria completed:

- Added Storybook 10 with the official React/Vite framework, generated component documentation, global application styling, an in-memory router, and the accessibility addon configured to fail flagged stories.
- Added development and static-build commands and excluded generated Storybook output from lint and source control.
- Isolated Storybook from the application's Cloudflare/PWA deployment behavior so component builds never produce or register an unrelated service worker.
- Extracted reusable, typed status-badge and dashboard-metric components and adopted them in live dashboard and reference-management views.
- Split backup-reminder data loading from its reusable visual component so due, current, never-backed-up, and mobile states can be rendered deterministically.
- Added status stories for active, inactive, new, missing-information, ready, reviewed, processed, voided, trashed, and long-label states.
- Added metric stories for ordinary, unavailable, and long-content values without weakening careful financial wording.
- Added supporting-document stories for empty, read-only accountant, load-error, selected-image, rotated-image, selected-PDF, and narrow mobile states using deterministic API boundaries.
- Added Testing Library coverage for status semantics and variants, labelled metric structure, and backup due/current actions while retaining the Phase 16 capture/retry tests.
- Verified the full Storybook static build, TypeScript story definitions, application lint, production build, and 81 unit/component tests.

Notes: This phase adds no database migration or runtime dependency. Storybook packages are development-only, and generated `storybook-static/` files remain untracked. Phase 18 adds critical Playwright end-to-end workflows.

## Phase 18: Playwright workflows

Status: Complete

Commit: `2f22dd1`

Acceptance criteria completed:

- Added Playwright 1.63 with a deterministic Chromium project, local Worker lifecycle management, CI retries, failure screenshots/video, first-retry traces, and an unopened HTML report.
- Added reset-first headed and headless commands so browser scenarios always begin from the migrated synthetic local D1/R2 seed.
- Kept the stateful business lifecycle serial and single-worker while preserving a clean boundary between Playwright discovery and the existing Vitest unit/component suite.
- Covered unauthenticated redirects plus successful local owner and accountant login paths.
- Verified owner-only navigation and mutations in both the interface and Worker API, including a direct accountant create denial.
- Exercised owner creation of a business activity, vehicle, calculated work session, complete fuel receipt, parking expense, and private PDF evidence upload.
- Exercised platform payout, IT contract invoice, and SaaS subscription income through the browser interface.
- Exercised owner preparation for review, accountant comments/review attribution, permitted income reconciliation, and absence of owner-only income controls.
- Verified transaction text search and combined direction/type/status filters against user-visible results.
- Verified a real complete portable ZIP browser download, local accountant invitation creation/acceptance, and expired-invitation rejection.
- Verified trash confirmation, retention-disabled permanent purge, restore, and restored transaction visibility.
- Documented initial Chromium installation, destructive local reset behavior, headed debugging, and covered workflow scope.
- Verified all 5 critical browser groups, 81 unit/component tests, lint, formatting, TypeScript, the production application build, and the static Storybook build.

Notes: This phase adds no schema migration or production runtime dependency. Playwright and Node types are development-only; browser binaries and generated reports remain outside source control. Phase 19 adds the isolated public demo environment.
