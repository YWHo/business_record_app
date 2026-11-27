# Static demo data foundation

The staging/static-demo redesign plan is maintained outside this repository.
Phase 1 connects these adapters to the public demo application's request path.
Phase 2 separates `/demo` from `/login` and `/app`. Staging configuration and
credentials remain later phases.

## Dataset

`src/features/demo/staticDemoDataset.json` contains deterministic fictional
records generated from migrations and `scripts/seed-demo.sql` in an in-memory
SQLite database. `pnpm demo:generate` regenerates it without opening local or
remote databases. Node must support `node:sqlite`, as required by the existing
integration tests. The generator accepts no database path or credentials.

The table allowlist excludes users, sessions, invitations, authentication
challenges, token/password hashes, outboxes, remote configuration, attachments
and R2 object keys. All monetary minor-unit values remain safe integers. A
regression test compares every bundled table to the fictional SQL seed, so seed
changes require intentional regeneration. Never generate this file from a
private or staging database.

The dataset now also contains the fictional audit log, saved filters and
retention settings. A separate author projection contains only seeded ID, email,
display name and role for comment/audit labels. Its emails must use
`example.invalid`; no session, password, token or invitation data is included.

The baseline includes DoorDash, combined Uber rides/Eats, IT Contracting and
Music Streaming. Historical legal-entity periods and attribution are retained.

## Core read adapter

`staticDemo.ts` provides independent copies of baseline rows, business directory
summaries and bounded record queries. Income dates remain calendar dates;
expense/session instants use Auckland business dates. Queries support business,
legal entity, status, text, dates and stable pagination.

`staticDemoClient.ts` composes the existing browser overlay with business-scoped
income, expense and work-session collection reads. Overlay edits happen before
filtering, counting and pagination. Reset restores the baseline. These functions
do not call fetch, authentication, D1, R2 or private APIs.

The IndexedDB name now includes `staticDemoMetadata.json`'s dataset version.
Previous unversioned browser edits are left untouched in their old database,
not imported into the new baseline. Bump the dataset version when intentionally
changing the baseline incompatibly; schema upgrades within one version retain
the existing overlay migration support. Lightweight version metadata is separate
from the records so ordinary application imports do not bundle the full dataset.

## Application integration

`useApiRequest()` supplies a client bound to the mounted workspace and selected
role. In demo mode it dispatches requests to the lazy-loaded
`staticDemoApi.ts` adapter. It explicitly maps the application's business,
financial record, mileage, fuel-picker, document, reference, history, report and
governance routes to the static readers. Unsupported endpoints fail closed;
there is no network fallback. Mutations use the browser overlay and return the
record envelopes expected by the forms. Simulated role permissions restrict
mutations; Auditor requests cannot write or reset browser state.

`/demo` supplies public presentation configuration locally, in every build mode,
without calling `/api/auth/config` or `/api/auth/me`. No server authentication or
session is created. `/login` and `/app` always use server configuration and real
authorization, even when a demo tab role exists. The existing `build:demo` mode
only changes the root landing redirect to `/demo`; it grants no server authority.

`WorkspaceApplication` remounts the authentication provider when crossing the
public/private boundary. Screens use `useApiRequest()` and receive new state
containers; form/upload helpers require an explicitly supplied client. Stale
clients and late responses are rejected after leaving their workspace. Private
responses never pass through the demo overlay. `workspaceRouting.tsx` keeps
existing screen links, redirects and imperative navigation under the selected
workspace prefix. Explicit entry/exit links deliberately cross the boundary.

Entering/leaving or signing out of the demo does not log out the private
session. Returning to `/app` reloads private authorization. Signing out privately
does not reset demo edits. “Leave demo” clears the simulated tab role, so entering
the demo again shows the role chooser; versioned browser edits remain available.
The simulated tab role and versioned IndexedDB remain
independent of private cookies. The service worker caches static assets only;
API/private document responses have no runtime cache and no navigation fallback.
Private fetches force `cache: no-store`, avoiding reuse of older cached API reads.

The Worker's anonymous demo principal and shared JSON API cache are removed.
Private record handlers require authenticated sessions. The retained legacy
`APP_ENV=demo` deployment rejects record API reads before D1/R2/cache work;
only public configuration discovery remains available there. Its old bindings
and reset utilities await an explicit staging conversion in later phases.

Browser tests abort every API call while exercising demo Owner editing,
Accountant review and Auditor inspection. A separate switching scenario mocks
private server responses to verify cookie preservation, independent sign-out,
browser edit persistence and private/demo record isolation. Storybook includes
entry/exit links and an adapter-backed directory alongside the detail examples.

`staticDemoDetails.ts` now reads scoped expense and income detail records,
including fuel/parking fields, insurance premium and allocation, platform,
contract and subscription details, and reconciliation evidence. It applies the
overlay before locating the record, so browser-created records can be opened
and reset records disappear. Valid IDs requested under another business fail
closed. The application adapter uses these functions for collections and details.

Work-session details also recompute distance, duration, revenue rates and fuel
metrics after applying browser edits, using the Worker's pure calculators.
Distance always comes from odometers. Ending fuel evidence must be a visible
fuel expense in the same business and vehicle; only a full fill with usable
litres and matching currency supplies cost metrics. Exact calculations require
all three driving/full-tank confirmations. Missing evidence remains unavailable
even if the browser overlay claims an exact result. This is fictional demo
presentation; private server validation and authorization remain unchanged.

`staticDemoTransactions.ts` provides account-wide or business-scoped income and
expense transactions. Browser edits, evidence additions and trash/restore apply
before filtering, stable sorting and bounded pagination. Filters include dates,
tax year, direction/type, activity/entity, category, vehicle, amount, counterparty,
review state and receipt presence. Summary counts describe the returned page,
matching the existing Worker contract. Transaction dates retain the Worker's
current date projection, including UTC date extraction for expense timestamps.
SQLite integration tests compare static responses directly against the Worker
for the supported filter cases. The application adapter uses this reader for
both transaction and receipt routes.

`staticDemoReports.ts` adds source-total reports and financial totals with
FULL, MONTH and TAX_YEAR periods using the fictional baseline's fiscal settings.
Reports group by family, subtype and currency; insurance remains the full
premium. Financial totals distinguish recorded income from cash received for
contract invoices, using the Worker's pure combination helper. Browser edits,
voiding, business/entity filters and Auckland expense dates apply before
aggregation. Income dates remain calendar dates. Unsafe integer totals fail
closed, and currencies are never added together. These functions do not export
archives or provide download/authentication endpoints.

The financial-total helper remains separate from the full dashboard response.
`staticDemoDashboard.ts` now supplies that complete response: operating metrics,
review/attention counts, recent transactions, outstanding invoices, spending,
platform income and allocated insurance. It reuses the Worker's pure platform
and financial calculators, recomputes from current browser edits and preserves
the dashboard's existing UTC substring date semantics. Missing session revenue
stays unavailable, currencies remain separate, and unsafe money totals fail
closed. Account-wide, business and activity scopes are supported. The fixed
fictional March year end is the default; browser edits to the fiscal settings
are validated and reflected consistently in reports and dashboard periods.
The current Auckland tax-year default follows those settings.

Integration tests compare complete dashboard responses with the SQLite-backed
Worker for all four businesses, account/activity scopes and an empty period.
Browser-created invoices, records, receipts and trash affect the derived results.
The application adapter uses this response for live demo dashboards.

## References and history

`staticDemoReferences.ts` provides activities, vehicles, clients, categories,
legal entities, full business operating periods and retention settings. Browser
reference edits and legal-entity transitions retain historical creation metadata.
New clients/categories default to active like the Worker. Retention/fiscal
settings use the Worker's validator before financial readers consume them.

`staticDemoHistory.ts` supplies scoped comments, role-owned seeded saved filters,
and filtered/paginated audit history. Seeded actor labels are fictional metadata,
not authenticated identities. Browser comments use a DEMO author label. Recorded
overlay operations appear as `BROWSER_LOCAL_CHANGE`, explicitly marked simulated
and not server audit evidence. Auditor views include recognized financial
changes and exclude configuration changes. The browser overlay remains shared
by simulated roles within the same demo namespace; none of these readers grants
private server authority.

`staticDemoGovernance.ts` reads browser trash with retained source metadata and
restore support. Eligibility is presentation only: no R2 purge or database delete
is executed. Export status accurately reports the baseline's empty archive
history and never claims that a private backup or download was created.

## Fictional evidence

`staticDemoEvidence.ts` supplies business-scoped document lists and record
attachment histories. A separate `staticDemoEvidenceManifest.json` describes four
small, passive PDFs under `public/demo-evidence/<dataset-version>/`: a fuel
receipt example, combined Uber rides/Eats statement, contract invoice and
subscription summary. All are explicitly labelled fictional and derive their
recorded amount from the corresponding synthetic parent. The manifest contains
static asset paths, sizes and hashes; it contains no R2 object keys or private
file URLs. `pnpm demo:generate` deterministically regenerates both records and
evidence. The PWA precaches these public PDFs for offline previews.

The reader validates the business and visible parent, hides evidence for trashed
records, retains replacement history and lists only current versions in the
document directory. Attachment histories and directories are capped at 200.
Receipt counts use all current versions before that presentation cap, keeping
transaction receipt filters, dashboard attention and directory missing-receipt
counts consistent. Reset restores the bundled evidence.

Browser uploads retain filenames and replacement metadata only, matching the
existing overlay: bytes are not persisted or sent anywhere. Their preview URL
is null. Only bundled manifest entries can receive a static preview URL, and
download URLs are always null; supplied URLs cannot create private-file access.
Replacement targets must belong to the same business and record. Missing or
out-of-scope replacement chains fail closed.

Worker parity tests insert manifest metadata into an in-memory test database
only. Neither the real demo seed nor local/remote storage receives attachments
or fabricated R2 objects. Component tests cover opening/closing PDF previews;
the API-blocked browser harness fetches a real static PDF and exercises browser
replacement versions. Storybook includes desktop and phone evidence examples.
