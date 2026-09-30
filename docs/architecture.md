# Architecture

## Runtime boundary

```text
Browser (untrusted)
  ├─ React SPA: rendering and usability validation
  └─ /api requests
       └─ Cloudflare Worker (authoritative boundary)
            ├─ authorization and validation
            ├─ D1 binding: relational records
            └─ private R2 binding: source documents
```

The Vite plugin runs this topology locally in the Workers runtime and builds the same topology for deployment. Browser bundles never include files under `worker/`, binding credentials, D1 access, or R2 access.

## Environments

| Environment | D1                                            | R2                                   | Authentication                                    |
| ----------- | --------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| Local       | Miniflare, persisted under `.wrangler/state/` | Miniflare, same state root           | Email outbox plus loopback-only seeded helper     |
| Demo        | Dedicated immutable synthetic-data database   | Dedicated immutable synthetic bucket | Browser-local role simulation; no server session  |
| Production  | Dedicated private database                    | Dedicated private bucket             | Email links, Turnstile, and local helper disabled |

Bindings are deliberately non-inheritable in `wrangler.jsonc`, so every named environment declares its own resources and variables. Remote resource IDs remain placeholders until an operator creates each environment.

## Identity and authorization

The Worker owns every identity and role decision. Passwordless sign-in and invitation URLs contain random single-use tokens; D1 stores only their SHA-256 hashes. Authentication challenges expire after 15 minutes, invitations after 72 hours, and sessions after 8 hours. Session cookies are HTTP-only and same-site strict, with the secure flag on HTTPS.

Production login is rejected through a route-specific Cloudflare rate limiter before database work and requires server-side Turnstile verification. Rate-limit keys are hashed and cover both the connecting client and a stable subject when one is available, preventing simple email or account rotation from bypassing a single dimension. A separate limiter protects invitation and bootstrap routes, while a dedicated lower-volume limiter protects uploads and archive generation per business account. These application limits supplement rather than replace Cloudflare account-level DDoS and WAF controls. The email service posts a minimal provider-neutral payload only to a configured HTTPS relay; both relay and Turnstile calls have bounded timeouts and fail closed. Local email requests are written to D1 outboxes instead.

Every state-changing API request in demo or production must carry an `Origin` exactly matching `APP_ORIGIN`. The GET-based streaming export also requires same-origin browser Fetch Metadata because successful generation records history. These checks provide an explicit cross-site request boundary in addition to strict same-site cookies. Static assets and Worker responses set restrictive content-type, framing, referrer, permissions, and transport policies. Magic-link and invitation pages capture their one-time token once and immediately replace the browser-history entry without the query string.

Owner bootstrap requires the configured email and an administrative secret. It creates no session, is idempotent only for the same owner, and refuses silent ownership transfer. Further accounts originate only from owner-created accountant invitations. Invitation acceptance batches its guarded identity creation, active membership creation, and token consumption; it never reactivates a globally disabled identity. Disabling an accountant retains its database identity and audit references while deleting every active session for that membership's account.

The local login helper selects only configured seeded identities and requires both `APP_ENV=local` and a loopback request hostname. It never bypasses normal route authorization.

The public demo has no real authentication route, session, or cookie. Owner/accountant selection is held in the current tab's `sessionStorage` solely to simulate UI permissions. The Worker independently treats every demo request as read-only, returns immutable synthetic records for bounded GET requests, caches successful JSON reads at the edge for ten minutes, and rejects every non-read API request before D1 or R2 work. The demo has no R2 binding.

Demo D1 is restored from a deterministic synthetic seed through an operator-only command that requires the exact remote demo target and always supplies both `--remote` and `--env demo`. Visitor edits, comments, status changes, tombstones, and temporary records form an IndexedDB overlay in that visitor's browser. Resetting the visible demo clears only that overlay. Demo document selection and preview stay browser-local and never reach the Worker or R2.

## Workspace tenancy and legal identity

`business_accounts` is the top-level application workspace. `business_entities` separately represents the real-world legal or trading entity, while `business_account_members` joins users to workspaces with an active role. `OWNER` means primary administrative controller of a workspace; it is not a claim about shareholding, directorship, beneficial ownership, trusteeship, or other legal control.

Every business, detail, policy, collaboration, audit, and export row carries `business_account_id`. A normal request resolves its account from an active session and active membership; reads, writes, reference checks, and record-ID lookups bind that account again. Private R2 keys are generated as `business-accounts/<account-id>/...`. The initial private bootstrap creates the account, legal entity, first user, and OWNER membership in that order.

The split leaves room for future signup, plans, billing, additional roles, multiple memberships, and platform-administered ownership/control transfer without redesigning record ownership. Version 1 implements none of those commercial workflows and deliberately exposes no self-service ownership transfer.

### Business-first schema extension

Migration 0007 adds first-class businesses and effective-dated
business/legal-entity operating periods. Existing `business_accounts` and
`business_account_members` remain the account boundary, and
`business_entities` remains the physical legal-entity table. Current top-level
`business_activities` are the migration sources for businesses, not a second
layer forced beneath them.

The new attribution columns remain nullable until the dedicated historical
backfill is applied. After that, accounting writes carry account, business, and
persisted legal-entity attribution. The Worker derives legal entity from the
selected business and record effective date; ordinary clients do not choose it.
Account and business UI contexts use different responsive shells and dedicated
list/create/detail/edit routes as they are delivered. The complete target model
and migration safety rules are documented in
[`architecture/business-and-legal-entity-model.md`](architecture/business-and-legal-entity-model.md),
and the implementation inventory is in
[`v3-upgrade-gap-analysis.md`](v3-upgrade-gap-analysis.md).

The selected business is encoded in `/app/businesses/:businessId/...`; it is
not hidden mutable application state. The client reloads the authorized
business directory on startup and returns to My businesses when a URL names a
business the current member can no longer access. Account routes never render a
business selector. Business routes retain the selector and their business ID
through normal navigation and business switching clears query parameters.
The account business directory gets each business's current open-period legal
entity from the Worker rather than deriving identity in the browser. Its record
summary counts non-purged expense, income, and work-session roots, so retained
trash remains represented until permanent deletion while typed detail rows do
not inflate the total. The latest summary date is the newest update across
those roots. Public-demo period changes overlay the same server-shaped response
from the browser-local period store without mutating shared data.
Owner-confirmed legal-entity changes close the current inclusive operating
period on the day before the new boundary and create one new open period. The
close, insert, and scoped audit event are one D1 batch, while existing financial
and operational rows retain their persisted legal-entity IDs. The public demo
applies the same boundary rules only to its browser-local IndexedDB period
store.
Desktop and landscape-tablet layouts use a persistent business sidebar,
small-tablet portrait uses the same navigation in a compact column, and phone
layouts replace it with a four-destination bottom navigation bar while keeping
the selector in the app header. The phone bar keeps Dashboard, Expenses, and
Income immediately available and routes secondary business destinations
through a dedicated More screen; the account shell uses the same four-item
constraint. This prevents hidden sidebar-only destinations without squeezing
five or more controls into the phone viewport. Tablet portrait forms remain a
single column, repetitive records stay in a horizontally contained table, and
tablet landscape restores the wider table and grouped-card layouts.

The account shell also exposes an accountant workspace at `/app/accountant`.
Its legal-entity view groups businesses by their current operating entity,
while its business view surfaces derived review and missing-receipt totals.
No creation actions are exposed at this level. Entity review links carry an
explicit legal-entity filter into the account transaction log; business review
links enter the selected business transaction log. The Worker applies the
authenticated account predicate before either optional scope, and transaction
cards retain both business and legal-entity identity.

The primary dashboard reads only
`/api/businesses/:businessId/dashboard`. The Worker verifies the selected
business against the authenticated account and applies the account and
business predicates independently to income, expenses, sessions, attachments,
invoices, and recent-transaction projections. The landing view intentionally
shows only three financial summaries, missing-receipt/review/invoice attention
counts, and the six most recent income or expense records for the selected tax
year. Existing detailed operating metrics remain available in the response for
report migration, but are not mixed into the primary dashboard.

## Reference data lifecycle

Business activities and vehicles are database-backed reference records exposed through authenticated Worker routes. Both roles may read active and inactive records because historical financial and mileage views need their labels. Every mutation is owner-only and validated again at the Worker boundary.

The selected-business settings area separates details, legal entity periods,
activities, vehicles, categories, clients, and member guidance into focused
routes. The details form is an owner-only audited update, so correcting a
business name or description does not create a legal-entity change. Accountants
retain read access. Legal-entity periods are displayed as immutable historical
attribution here; changes use the dedicated period workflow rather than editing
an existing row in place.

There is no hard-delete operation. Deactivation retains the stable ID and records an end or retirement date; reactivation clears that date. Names and registrations remain case-insensitively unique, and every successful create, edit, activation, or deactivation produces an audit entry.

## Work-session calculations

The browser collects human-friendly local date/time and decimal currency input, but converts time to a timezone-qualified ISO instant before submission. The Worker validates role, references, calendar values, order, odometers, notes, currency, and amounts. New sessions may select only active activities and vehicles; an existing historical session may retain its now-inactive references.

D1 is the authority for `distance_km`, using its generated-column expression `odometer_end_km - odometer_start_km`. Revenue is converted to integer minor units before storage. The Worker derives duration, revenue/hour, and revenue/km from persisted source values for each response and builds list aggregates without storing denormalized rates. Aggregate rate fields remain null when revenue coverage is incomplete or currencies differ.

Work-session writes receive retention dates from the configured tax-year policy using the New Zealand business date (`Pacific/Auckland`) and activity-linked audit records. Owner-only mutations and accountant read access are enforced by the same backend authorization boundary as other records.

The business workspace exposes mileage as a summary and session list first,
with separate create, detail, and edit routes. The route business is
authoritative: scoped forms do not expose activity or legal-entity selectors,
and the Worker checks account, business, session, and vehicle scope before a
read or write. Legal entity is resolved from the session start date; moving an
existing session across an operating-period boundary requires explicit
confirmation. The detail route retains supporting documents, trash, and the
full-tank fuel workflow without placing a long form above session history.

## Fuel evidence and calculations

Fuel data uses the shared `expenses` row for financial and retention fields and `fuel_expense_details` for vehicle and pump measurements. Receipt and GST totals are integer minor units; pump price is integer millionths per litre. The Worker—not the browser—validates both records and writes them as one D1 batch. Fuel price and litres are optional, but incomplete detail and a material price-times-litres mismatch return structured confirmation warnings before any write. A retry must name every current warning code to save deliberately.

The full-tank workflow updates the existing work session rather than copying fuel data into it. Linked records must be live fuel expenses for the session vehicle, and start/end links cannot be the same record. The starting receipt is optional. Analytics use generated session distance plus the linked ending full fill's litres and receipt cost. The response labels those analytics `EXACT` only when tank-full-at-start, no-personal-driving, and tank-full-at-end are all explicitly true; usable ending evidence with any false confirmation is `ESTIMATE`, never exact.

## Expense workflows and categories

Parking and general expenses share the authoritative `expenses` write path and tax-year retention calculation. All financial values reach D1 as integer minor units with uppercase currency. References must be active for new selections, while edits may retain a reference that became inactive. Successful mutations create activity-aware audit events.

The business workspace exposes expenses through list, detail, create, and edit
routes scoped by both the authenticated account and the business ID in the
URL. The list is the primary landing screen and combines general, parking,
fuel, and insurance records into one filterable projection. Create and edit
render exactly one subtype form per page; business identity is fixed by the
route, and the Worker derives legal-entity attribution from the effective
purchase date. Moving an edited record across an operating-period boundary
requires explicit confirmation and updates the root, typed detail, and
allocation attribution together. Scoped category and vehicle references are
validated again at the Worker boundary.

Parking writes its common expense and one-to-one detail row as a D1 batch. Start and end must be timezone-qualified instants in chronological order. Duration is calculated only for responses and UI display, never accepted or stored as an independent source value.

General expenses deliberately have no detail row. Their configurable category and common description support new cost types without arbitrary JSON or immediate migrations. Category lifecycle mutations are owner-only, case-insensitively unique, and non-destructive. Categories required by specialised fuel, parking, and insurance creation cannot be deactivated because those routes depend on their stable system keys.

## Insurance allocation boundary

An insurance write batches three relational records: the common full-premium expense, specialised policy detail, and a separate allocation. The premium always remains an integer minor-unit source value. Percentage methods store basis points and derive the allocated minor-unit amount at the Worker boundary; 100% business derives both fields, kilometres-based allocation additionally requires a calculation period, and undetermined leaves both nullable.

Owners control source policy and premium fields. Both roles may read insurance, but the accountant mutation surface is limited to an allocation-adjustment route that forces `ACCOUNTANT_ADJUSTMENT`, caps the amount at the full premium, and stores the reviewer ID. Meaningful allocation changes write before/after method, percentage, and amount summaries to the append-only audit log. UI wording does not claim tax correctness or final profit.

## Income boundary and reconciliation

Every income write starts with a common `income_records` row and, except for general income, a one-to-one typed detail row written in the same D1 batch. The shared amount deliberately follows each record's reporting meaning: platform and subscription net payment, contract invoice total, or general income total. Platform providers and business activities are configuration data rather than code enums. Contract invoices reference lifecycle-managed clients and remain unique per client and invoice number. Subscription details contain only period aggregates and never subscriber identities.

The business workspace exposes income through separate list, create, detail,
and edit routes. The selected business is authoritative and is never an
editable form field. One progressive form reveals only the fields for the
selected platform, contract, subscription, or general subtype; existing record
subtypes cannot be changed. The Worker scopes detail and update access by
account, business, and record, validates contract clients within that business,
and derives legal-entity attribution from the effective transaction date. A
date edit that crosses an operating-period boundary requires explicit
confirmation before root and typed detail attribution are updated.

Owners create and update income source records; accountants have read access. A separate reconciliation endpoint is available to both roles and appends expected and actual integer minor-unit values with actor attribution. D1 generates the difference while the Worker derives the exact-match flag. Reconciliation does not mutate the source income row or imply a bank integration.

## Private document storage

Attachment metadata lives in D1 while immutable source bytes live in the private `DOCUMENTS` R2 binding. The Worker validates the authenticated parent record through a fixed record-type-to-table mapping, so user input never selects SQL identifiers. It accepts only multipart JPEG, PNG, WebP, and PDF uploads up to 25 MB, compares the declared MIME type with file-signature bytes, hashes the complete file with SHA-256, and constructs object keys entirely from verified record IDs and server-generated UUIDs.

Exact hashes and repeated current filenames are advisory duplicate signals. An owner must explicitly confirm a warning to proceed. Each replacement retains the same version-group ID, increments its positive version number, marks the prior metadata non-current in the same D1 batch, and writes to a new R2 key. A database failure triggers best-effort removal of only the newly written object; no prior object is overwritten or deleted.

Both authenticated roles can list metadata and download current or historical versions through controlled Worker routes. Only owners can upload or replace. Download responses force attachment disposition, disable content sniffing, and prevent caching. Attachment retention and purge-eligibility dates are copied from the authoritative parent record, and meaningful upload/version events are audited without filenames or document contents in the audit summary.

Mobile capture remains a progressive enhancement over the same attachment endpoint. Camera and file pickers create a local object-URL preview; no preview is sent elsewhere. Quarter-turn orientation is validated at the Worker and stored in D1 separately from the R2 object, preserving the exact hashed evidence bytes while allowing display correction. Failed requests keep the browser-selected file available for manual retry, but there is deliberately no background or offline upload queue. A future OCR process can key results to the immutable attachment ID and SHA-256 without changing this storage contract.

## PWA and offline boundary

Vite generates the web manifest and Workbox service worker from the same production build. The service worker precaches only the versioned static application shell and uses the SPA fallback for navigations; `/api` is excluded from navigation fallback and no runtime cache stores authenticated records or private document responses. The browser advertises installation only when its own PWA criteria are satisfied.

Service-worker updates remain user-controlled: a new worker raises an in-app prompt and activates only after **Update now**. Registration checks again when the window regains focus. Online/offline events drive a persistent, text-labelled status that explains the shell limitation and does not imply that record edits or uploads are queued. Consequently, offline startup can render application assets, while all authoritative data and writes still require the Worker boundary.

## Component development boundary

Storybook uses the React/Vite framework with the application stylesheet, an in-memory router, generated prop documentation, and accessibility checks configured as errors. Its static build deliberately removes the deployment-only PWA plugins: component documentation must not generate or register a second service worker, and Storybook's large manager assets do not belong in the production app-shell cache.

Stories exercise presentation boundaries rather than duplicating complete routed pages. Status badges, dashboard metrics, backup reminders, and the reusable supporting-document panel cover workflow variants, unavailable and error states, read-only access, long content, narrow viewports, and interactive image/PDF selection. Network behavior in attachment stories is deterministic and isolated from D1/R2; authoritative API behavior remains covered by Worker service tests and the local acceptance suite.

## Search and review projection

The transaction and receipt APIs query a fixed `UNION ALL` projection over common expense and income fields. Type-specific joins add category, vehicle, and counterparty labels without making the projection an alternative source of truth. Every user filter becomes either a validated enum/date/amount or a bound SQL parameter; record-type-to-table mappings remain fixed in Worker code. Current attachment counts are correlated from D1 metadata so records with missing evidence remain searchable.

Inside a selected business, the transaction route adds an independently bound
business predicate to the authenticated account predicate. Its initial filter
surface is limited to search, date, direction, and status; less common record,
category, attachment, and review filters remain available under More filters.
Desktop uses a compact table and the shared responsive rules convert each row
to a labelled card on phones. Review comments and status transitions still use
their established authorization boundaries.

The Documents destination reads current attachment metadata through a
business-scoped projection that joins each file to its authoritative expense,
income, or work-session parent. It exposes controlled download links and a
separate missing-evidence view backed by the same scoped transaction
projection. New attachment metadata copies business and legal-entity IDs from
the validated parent; older rows remain resolvable through their parent joins.
R2 objects remain private and are never listed directly.

Saved filter criteria are allow-listed string maps stored per user and per log type. Names remain unique within that scope. No saved filter can inject SQL or expose another user's views.

The record-status endpoint owns workflow transitions. Owners prepare, reopen, or void records, while accountants review and process them. `REVIEWED` requires `READY_FOR_REVIEW`, and `PROCESSED` requires `REVIEWED`; `VOIDED` is terminal. Financial review identity/timestamps change atomically with status, and every source-data update returns the record to `NEW` and clears prior review attribution. Comments are append-only rows joined to immutable user identity, with no update or delete route.

## Retention and deletion boundary

Normal deletion is a reversible owner-only transition: the Worker records the prior workflow status in the audit event, sets `TRASHED` plus `deleted_at`, and excludes the record from live source and transaction queries. Restore recovers that prior status. Both roles may inspect trash and immutable audit history, but accountants cannot trash, restore, change retention policy, or purge.

Permanent purge requires all three server-side conditions: the record is already trashed, its stored `purge_eligible_at` boundary has passed, and the owner supplied the exact explicit confirmation. The current policy never shortens retention dates already assigned to records; changes affect future calculations only. A referenced fuel expense remains protected until its work-session references are removed.

Purge first marks D1 record and attachment metadata as pending, then removes private R2 objects and relational detail rows. This makes interrupted R2/database work visible and retryable instead of restoring a partially purged record. On completion the source row is deleted, while the actor-attributed `RECORD_PURGED` audit event remains. There is no automatic purge route or writable audit-log route.

## Portable export boundary

The Worker builds monthly, configured tax-year, and full retained-record snapshots directly from D1 plus private R2. Exports include live and trashed records but never already-purged sources. A fixed set of CSV projections covers common transactions, typed income, mileage, fuel, parking, insurance/allocation, reconciliation, comments, audit events, attachment metadata, reference data, and the retention policy. Text cells beginning with spreadsheet formula markers are prefixed with an apostrophe so opening an archive in spreadsheet software cannot execute record content as a formula. This makes the archive understandable without executing application code.

Before returning an archive, the Worker resolves the exact included record IDs, selects every matching attachment version, and preflights its R2 size and stored SHA-256 metadata. Generated files are hashed from their actual bytes. The versioned JSON manifest lists paths, sizes, digests, scope, dates, units, and expected/exported counts. The manifest's own hash is retained in D1 with the export completion; it is excluded from its own non-recursive file list.

The ZIP writer uses stored entries and serves a `ReadableStream`, loading at most one attachment body at a time. Export generation is repeatable and does not mutate business records or attachments. D1 stores only completion metadata—not a redundant archive—and the dashboard reminder compares the latest successful generation with the configurable interval.

Version 1 deliberately has no importer. A future restore must validate `format` and `schemaVersion`, verify every manifest digest and count, import reference records before financial parents and typed children, restore attachment metadata/object bytes, then reconcile audit and final counts in an isolated environment. This ordering is documented in the export-format ADR and can be implemented without changing the archive shape.

## Dashboard analytics boundary

The dashboard API applies the configured tax-year boundary and optional business-activity filter to live, non-voided records. D1 selects authoritative source amounts and generated mileage; the Worker groups only within a single currency and derives rates from those persisted values. It never accepts caller-provided totals or combines currencies.

Recorded revenue uses each income family's established reporting value. Net cash movement is intentionally separate: contract income contributes only its recorded received amount, while other income contributes its received/net common value. Expenses are then deducted as recorded. The UI labels invoice-value revenue less expenses as “Income less recorded expenses” and explicitly avoids taxable-profit language.

Delivery and ride-hailing analytics use work-session gross revenue for per-session, per-hour, and per-kilometre rates. Direct operating cost contains only fuel and parking assigned to the same platform activity and currency; allocated insurance appears separately. Missing session revenue suppresses revenue-derived rates and contribution rather than silently treating missing values as zero. These indicators are operational estimates, not accounting or tax conclusions.
