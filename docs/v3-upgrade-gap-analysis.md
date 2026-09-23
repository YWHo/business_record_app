# Business-first UI and schema upgrade gap analysis

Status: Phase 1 architecture baseline

This document compares the current application with the target business-first
experience. It is an implementation plan, not a statement that the target
schema or routes already exist.

## Executive assessment

The current application has a sound security and tenancy foundation: a
Cloudflare Worker is the authority, D1 contains normalized accounting records,
R2 is private, public demo writes remain browser-local, and every persisted row
is scoped to a business account. The upgrade can preserve those boundaries.

The principal domain gap is that `business_activities` currently carries the
meaning that the new UI assigns to a business. A legal entity exists only as
account metadata; accounting records do not retain which legal entity operated
the business on their effective date. The UI is correspondingly workspace-wide,
uses a horizontal list of features, and often combines list, create, edit, and
administrative responsibilities on one page.

The safe path is additive: introduce businesses and effective-dated
business/legal-entity periods, backfill and verify historical attribution, add
business-scoped services and APIs, then replace the shell and individual pages.
Legacy activity columns and endpoints remain available as compatibility shims
until the regression phase proves they can be removed.

## Existing assets to retain

### Data and security

| Existing asset                                                                  | Decision                                                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `business_accounts`                                                             | Retain as the account/workspace table. It is the implementation equivalent of the target `accounts` concept.                 |
| `business_account_members`                                                      | Retain as account membership. Existing owner/accountant authorization remains authoritative.                                 |
| `business_entities`                                                             | Retain and evolve as legal entities. Product language will say “legal entity”; a risky physical-table rename is unnecessary. |
| Account-scoped columns and indexes                                              | Retain. Add business and legal-entity scope; never weaken account predicates.                                                |
| `business_activities`                                                           | Convert each current top-level row one-to-one into a business. Keep the legacy row/column during transition.                 |
| Normalized expense, income, work-session, attachment, audit, and export records | Retain their current accounting and retention behavior while adding attribution.                                             |
| Worker-side authorization, validation, audit, retention, and export services    | Extend rather than reproduce in the browser.                                                                                 |
| Private R2 and account-prefixed keys                                            | Retain; later include the server-resolved business segment for new objects.                                                  |
| Demo read-only Worker and IndexedDB mutation overlay                            | Retain the boundary; version the browser schema and make overlay operations business-aware.                                  |

### UI and test code

Reusable presentation and workflow code includes `StatusBadge`,
`DashboardMetricCard`, `AttachmentPanel`, `BackupReminder`, the existing
expense and work-session form fields, the authentication provider, PWA status,
and the accessible table/form primitives in the current stylesheet. These need
new layout composition and narrower page responsibilities, not wholesale
replacement.

Existing Worker service tests, route security tests, tenant-isolation tests,
demo restriction tests, component tests, Storybook stories, and Playwright
workflows remain regression assets. Test selectors and navigation expectations
will change with the route hierarchy.

## Domain-model gaps

| Target capability                     | Current state                                                                               | Required change                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| First-class account                   | Implemented as `business_accounts`.                                                         | Keep naming and expose account-level UI/API semantics.                                                               |
| Membership                            | Implemented as `business_account_members`.                                                  | Keep roles and active-membership checks.                                                                             |
| Legal entity                          | `business_entities` exists, but is account metadata and the initial legal name may be null. | Add repository/types, validation and review handling; expose it through business settings and accountant views.      |
| First-class business                  | Missing; top-level `business_activities` are effectively businesses.                        | Add `businesses`, backfill one per activity, and preserve status/name/type.                                          |
| Business/entity operating period      | Missing.                                                                                    | Add `business_entity_periods`, non-overlap/current-period safeguards, controlled correction, and audit.              |
| Record attribution                    | Records have account and activity IDs only.                                                 | Add and populate `business_id` and `legal_entity_id` on authoritative accounting records and relevant metadata.      |
| Date-based entity resolution          | Missing.                                                                                    | Resolve at the Worker boundary from business, record date, and periods; reject gaps/overlaps.                        |
| Business-scoped reference data        | Vehicles, categories, and clients are account-scoped.                                       | Add business scope where the product treats the record as business-specific; retain historical references.           |
| Business-scoped documents and exports | Attachments and export history have account scope only.                                     | Persist/derive business and legal-entity scope and include it in manifests.                                          |
| Historical ownership safety           | No period history.                                                                          | Preserve persisted legal-entity attribution and do not recalculate old rows merely because a current period changes. |

Child detail tables remain linked to an authoritative parent expense, income,
or work-session row. They should not duplicate attribution merely for display.
Allocations and other independently queried child records must either gain the
same scope columns or be joined through a verified parent in every query. This
choice is recorded per table before its migration is written.

## Record-date semantics

The following dates will drive legal-entity resolution. The canonical parent
date remains stored even when a typed detail contains the same business event.

| Record                                        | Effective date                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General, fuel, parking, and insurance expense | Date portion of `expenses.purchase_datetime`                                                                                                               |
| Work session                                  | Date portion of `work_sessions.started_at` in the existing timezone-aware instant                                                                          |
| Platform income                               | `platform_income_details.payment_date`; fall back only during migration to the existing `income_records.transaction_date` and flag disagreement for review |
| Contract invoice                              | `contract_income_details.invoice_date`; fall back only during migration to `income_records.transaction_date` and flag disagreement for review              |
| Subscription and general income               | `income_records.transaction_date`                                                                                                                          |
| Attachment/comment                            | Inherit the attributed parent record; they do not choose a second effective date                                                                           |
| Allocation/reconciliation                     | Inherit the expense or income parent                                                                                                                       |
| Export                                        | Uses the selected business/entity scope and preserves the attribution already stored on included records                                                   |

An edit that crosses a period boundary must preview the resulting legal-entity
change, require explicit confirmation, persist the newly resolved entity, and
write an audit event. The API never accepts arbitrary legal-entity selection on
an ordinary transaction write.

## Additive migration plan

No applied migration will be edited. Exact migration numbers are assigned when
the implementation phase starts.

1. Add `businesses` and `business_entity_periods`, indexes, TypeScript domain
   types, and repositories. Add nullable `business_id` and `legal_entity_id`
   columns where required so existing deployments remain readable.
2. Create one business from every top-level `business_activities` row, retaining
   source IDs in an explicit migration mapping or deterministic relationship.
3. Normalize the existing legal entity. For a known sole trader, use verified
   operator data; never infer a person's legal name from an email address. Rows
   whose history cannot be established remain preserved and review-marked.
4. Create initial non-overlapping periods. The public demo can use deterministic
   fictional entities and a historical Uber Ride transition; private data must
   not be assigned to a speculative company.
5. Backfill business and legal-entity attribution on root expenses, income, and
   work sessions using the documented record date, then on attachments, audit,
   export metadata, and independently queried children.
6. Compare pre/post row counts and verify that every live and trashed financial
   record has an account, business, legal entity, and matching period.
7. Add account-leading composite indexes and enforce safe constraints after the
   backfill. Because SQLite has limited `ALTER TABLE`, use additive indexes,
   triggers, or verified table rebuilds rather than pretending a nullable
   column is constrained.
8. Retire legacy activity linkage only after API, export, demo, and Playwright
   regression coverage has moved to businesses.

Period protection must exist in both the service and database. A partial unique
index can enforce one open period per business. Insert/update triggers can reject
overlap, while a transaction closes the prior period and inserts the successor.
Historical period correction is a separate audited operation rather than a
generic patch.

## Backfill and verification rules

- Preserve every record, including trashed and retention-managed records.
- Treat each current high-level activity as a business unless audit proves it is
  a genuine sub-activity. The present seeded activities are all high-level.
- Do not hard-code a private owner's name. Require verified data or set an
  explicit review state that blocks silent final attribution.
- Demo data uses the fictional model shown in product examples: Uber Eats and IT
  Contracting under Brian Ho, Uber Ride under Taxi Limited, and HomeRekod under
  SaaS Limited.
- Resolve dates in their existing meaning and timezone. Do not shift a local
  business date by parsing it as an arbitrary UTC midnight.
- Verify zero period overlaps, exactly one current period where a business is
  active, no gap covering an attributed record, and no cross-account reference.
- Compare counts for expenses, incomes, work sessions, details, attachments,
  comments, audit entries, and export history before any cleanup.
- Run `PRAGMA foreign_key_check` and explicit orphan/attribution queries after
  every migration stage.

## API transition plan

The current Worker router matches literal paths. It needs a small, tested path
parameter matcher before business routes are introduced.

Target routes are grouped by context:

```text
GET  /api/account
GET  /api/businesses
GET  /api/businesses/:businessId
GET  /api/businesses/:businessId/dashboard
GET  /api/businesses/:businessId/expenses
POST /api/businesses/:businessId/expenses
GET  /api/businesses/:businessId/income
POST /api/businesses/:businessId/income
GET  /api/businesses/:businessId/work-sessions
POST /api/businesses/:businessId/work-sessions
GET  /api/businesses/:businessId/transactions
GET  /api/businesses/:businessId/documents
GET  /api/businesses/:businessId/settings/*
GET  /api/legal-entities
GET  /api/accountant/*
```

Every handler resolves the account from the authenticated principal, loads the
business with both account and business IDs, ignores client-supplied account or
legal-entity IDs, and invokes the period resolver for writes. Business ID is a
route context, not a freely editable transaction field.

Existing flat endpoints remain temporarily and delegate to the same services.
They may accept an explicit business query/body value during transition, but
must fail on ambiguity once an account has multiple businesses. Removal occurs
only in the cleanup phase after clients and tests use the scoped routes.

## Client route and shell plan

```text
/app/businesses                              account home / My Businesses
/app/transactions                           account-level cross-business log
/app/reports                                account-level reports
/app/accountant                             accountant workspace
/app/settings/account                       account settings and members

/app/businesses/:businessId                 business dashboard
/app/businesses/:businessId/transactions
/app/businesses/:businessId/expenses
/app/businesses/:businessId/expenses/new
/app/businesses/:businessId/expenses/:id
/app/businesses/:businessId/expenses/:id/edit
/app/businesses/:businessId/income
/app/businesses/:businessId/income/new
/app/businesses/:businessId/income/:id
/app/businesses/:businessId/income/:id/edit
/app/businesses/:businessId/mileage
/app/businesses/:businessId/mileage/new
/app/businesses/:businessId/mileage/:id
/app/businesses/:businessId/documents
/app/businesses/:businessId/reports
/app/businesses/:businessId/settings/details
/app/businesses/:businessId/settings/legal-entity
/app/businesses/:businessId/settings/vehicles
/app/businesses/:businessId/settings/categories
/app/businesses/:businessId/settings/clients
```

The mockups establish two shells. Account pages use an account sidebar and
business cards. Entering a business replaces it with a business workspace
sidebar plus a persistent business selector. Phone layouts use a compact header
and bottom navigation; small-tablet portrait keeps a narrow sidebar for list and
form work; landscape tablet and desktop use the full master/detail space.

Legacy links receive redirects only when their destination is unambiguous. The
selected business is represented by the URL, not hidden global state; browser
back/forward and shared links therefore retain context.

## Pages to replace or split

| Current page             | Problem                                                            | Target                                                                          |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `/` dashboard            | Workspace-wide and operationally dense.                            | My Businesses account home; business dashboard lives below a business route.    |
| `/records`               | Add parking, add general expense, and histories share one page.    | Expenses list plus dedicated new/detail/edit routes with subtype selection.     |
| `/fuel` and `/insurance` | Each combines create/edit controls and history.                    | Expense subtypes in the unified business expense workflow.                      |
| `/income`                | Multiple income forms, records, and reconciliation share one page. | List-first income with one conditional add form and focused detail/edit pages.  |
| `/mileage`               | Session entry, history, and fuel workflow are crowded together.    | Summary/list, dedicated add/detail/edit, with fuel workflow retained on detail. |
| `/transactions`          | Account-wide by accident and filter-heavy.                         | Business log by default; explicit account-wide log remains available.           |
| `/setup`                 | Activities, vehicles, categories, and clients all contain forms.   | Focused business settings pages.                                                |
| `/governance`            | Trash, audit, saved filters, and retention policy compete.         | Contextual settings/report pages with one primary responsibility.               |
| `/settings/users`        | Users and invitations share a broad owner page.                    | Account member settings, outside business context.                              |
| Horizontal primary nav   | Does not scale to phone or multiple businesses.                    | Account/business sidebars, business selector, and phone bottom nav.             |

Forms use a single-column flow on phones and a bounded content width on larger
screens. Tables become compact lists/cards when columns would become unreadable;
they do not rely on horizontal page overflow as the primary mobile design.

## Demo IndexedDB gap

The current `business-records-public-demo` database has one generic `overlay`
store and schema version 1. Operations are keyed mainly by method/path/record ID
and cannot isolate businesses or represent period changes.

The demo upgrade will:

- bump the IndexedDB version with an idempotent migration;
- add business identity to every overlay operation and derived scope;
- model local business/entity-period changes without a server write;
- migrate compatible old operations or discard only entries whose business
  cannot be resolved, with a visible reset/recovery path;
- keep role selection in `sessionStorage` and all public server mutations
  blocked before D1/R2 access;
- keep “Reset demo data” strictly browser-local and explain that clearly.

## Compatibility and delivery risks

| Risk                                       | Mitigation                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Incorrect historical legal entity          | Never infer a company; review-mark unknown attribution and validate every date against a period.                     |
| Period boundary off by one day/timezone    | Use inclusive business dates with `effective_to` equal to the day before the next start; centralize date extraction. |
| SQLite migration limitations               | Add nullable columns first, verify/backfill, then use tested rebuilds/triggers where needed.                         |
| Cross-tenant ID probing through new routes | Every repository query begins with account ID and business ID; extend tenant-isolation tests.                        |
| Legacy endpoint ambiguity                  | Adapters require a unique or explicit business and fail closed when context is ambiguous.                            |
| Export/report totals change                | Run old/new projection comparisons and include business/entity attribution in manifests.                             |
| R2 objects become unreachable              | Read old account-prefixed keys; write new business-prefixed keys; never bulk-move during schema migration.           |
| Demo overlay breaks after deploy           | Version and migrate IndexedDB; cover upgrade/reset in browser tests.                                                 |
| Bookmarks and PWA history break            | Add deliberate redirects and retain URL-based business context.                                                      |
| Responsive redesign hides controls         | Validate named phone, tablet portrait, tablet landscape, and desktop viewports in Storybook and Playwright.          |
| Multi-form workflows regress               | Preserve domain services while replacing page composition incrementally.                                             |

## Test impact

### Schema and domain

- Fresh and upgrade-path migrations, row-count comparisons, foreign keys,
  indexes, no-overlap triggers, one-current-period constraint, and attribution
  verification.
- Period resolution at first/last dates, gaps, overlaps, future periods, inactive
  businesses, and edits crossing a boundary.
- Repository tests proving account plus business scope on every read/write.
- Existing calculation, retention, review, purge, attachment, and export suites
  rerun with business/entity fixtures.

### API and security

- Dynamic-route parsing and legacy-adapter behavior.
- Owner/accountant permissions in account and business contexts.
- Cross-account and cross-business ID substitution for records, references,
  documents, audit, and exports.
- Demo Worker still rejects every mutation and retains bounded reads/caching.
- Payloads cannot override account or legal entity, including on edit.

### UI and browser

- Route loaders and not-found/forbidden states for missing business context.
- Account/business shell navigation, selector persistence through URLs, role-based
  controls, and bottom navigation semantics.
- Dedicated create/detail/edit pages and unsaved-change handling.
- Phone, small-tablet portrait, small-tablet landscape, and desktop visual and
  interaction coverage matching the supplied product mockups.
- IndexedDB upgrade, business isolation, client-only reset, and role simulation.
- Update Playwright workflows to seed/select a business before bookkeeping and
  preserve the production/demo isolation regression.

## Phase sequencing decision

The schema and domain boundary precede the visual shell so the UI does not build
on temporary client-only business assumptions. Each delivery phase updates
implementation progress, runs checks proportional to the change, creates one
descriptive commit, and leaves the worktree clean before the next phase begins.
