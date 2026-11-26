# Static demo data foundation

The staging/static-demo redesign plan is maintained outside this repository.
This is the first implementation checkpoint within its data phase, not the
completed conversion of the public demo application.

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

## Remaining data-phase work

The current application's AuthContext still uses the existing server-backed
read path. The new core client is not yet the complete application API adapter.
Audit/history/reference projections and fictional evidence must be converted
and verified before changing that live read path. Complete those within Phase 1;
do not advance to the `/demo` routing or staging configuration phases yet.

Current browser tests prove the core client can read, edit, persist through a
reload, and reset with all `/api` requests blocked. They also preserve the
existing simulated Owner/Accountant/Auditor flows. Storybook includes a static
baseline directory story at desktop and phone sizes.

`staticDemoDetails.ts` now reads scoped expense and income detail records,
including fuel/parking fields, insurance premium and allocation, platform,
contract and subscription details, and reconciliation evidence. It applies the
overlay before locating the record, so browser-created records can be opened
and reset records disappear. Valid IDs requested under another business fail
closed. These detail functions are not yet connected to AuthContext.

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
for the supported filter cases. This reader is not yet wired into AuthContext.

`staticDemoReports.ts` adds source-total reports and financial totals with
FULL, MONTH and TAX_YEAR periods using the fixed fictional March year end.
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
fictional March year end and the same current Auckland tax-year default are used.

Integration tests compare complete dashboard responses with the SQLite-backed
Worker for all four businesses, account/activity scopes and an empty period.
Browser-created invoices, records, receipts and trash affect the derived results.
This adapter is still not connected to the live AuthContext read path.
