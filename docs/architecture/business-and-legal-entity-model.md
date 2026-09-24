# Business and legal-entity model

Status: Accepted target architecture; implementation begins after the planning
baseline.

## Purpose

The application distinguishes four concepts that were previously compressed
into a workspace and activity:

```text
business account
  ├─ memberships ─ users
  ├─ legal entities
  └─ businesses
       ├─ operating periods ─ legal entities
       └─ accounting records ─ persisted period attribution
```

A business account is the application tenancy and billing boundary. A business
is an operating context such as Uber Eats or IT Contracting. A legal entity is
the person or organization legally operating that business during a defined
period. Membership role describes application authority, not legal ownership.

The current physical tables `business_accounts`, `business_account_members`,
and `business_entities` remain valid implementations of account, membership,
and legal entity. Product and API language uses the shorter domain terms.

## Invariants

1. Every business belongs to exactly one account.
2. Every legal entity belongs to exactly one account.
3. A business operating period may reference only a legal entity in the same
   account as the business.
4. Periods for one business never overlap.
5. An active business has exactly one open current period after migration is
   complete; at most one row may have `effective_to IS NULL` at all times.
6. `effective_from` and `effective_to` are inclusive local business dates. A
   successor starting on 1 April closes its predecessor on 31 March.
7. Every accounting record persists account, business, and resolved legal
   entity. Historical reads use the persisted attribution.
8. Ordinary record APIs accept business context and an effective date, not a
   freely selected legal entity.
9. A record edit crossing a period boundary requires confirmation and audit.
10. Account membership authorization is checked before business authorization;
    identifiers alone never grant access.

## Target tables

### Businesses

```text
businesses
  id
  business_account_id
  name
  description nullable
  business_type nullable
  default_currency
  status
  legacy_business_activity_id nullable during transition
  attribution_review_required
  created_at
  updated_at
```

The foreign-key column follows the repository's established
`business_account_id` convention. The legacy mapping supports reversible
comparison while existing endpoints are retired. Status is lifecycle state,
not deletion; historical records retain the business ID.

### Business/entity periods

```text
business_entity_periods
  id
  business_account_id
  business_id
  legal_entity_id
  effective_from
  effective_to nullable
  created_by
  notes nullable
  created_at
```

`business_account_id` is intentionally redundant enough to support
account-leading authorization indexes and cross-account validation. Service
transactions and database safeguards enforce the period invariants.

### Record attribution

Root `expenses`, `income_records`, and `work_sessions` gain `business_id` and
`legal_entity_id` in addition to their existing `business_account_id`.
Attachments gain attribution because they are independently listed and
exported. Audit and export history record scope sufficient to reconstruct the
action. A detail table that can only be reached through a root record inherits
scope through that root unless it is independently queried or retained after
the parent; that decision is explicit in the migration rather than inconsistent
duplication.

## Effective-date resolver

The Worker owns one resolver with this logical contract:

```text
resolveLegalEntity(accountId, businessId, effectiveDate)
  -> { business, period, legalEntity }
```

It verifies active membership separately, loads the business using account and
business IDs, validates a calendar date, and requires exactly one matching row:

```text
effective_from <= date
AND (effective_to IS NULL OR effective_to >= date)
```

Zero rows is a configuration gap and more than one row is an integrity fault;
both fail closed before the accounting write. The result supplies the persisted
legal-entity ID. The browser can request a preview for warning copy, but cannot
override the result.

For edits, the service compares the stored entity with the newly resolved
entity. If it changes, the first request returns a structured confirmation
warning. A deliberate retry names that warning, updates the attribution, and
records old/new business date, period, and entity IDs in audit-safe metadata.

## Date mapping

| Family                                    | Resolution date                          |
| ----------------------------------------- | ---------------------------------------- |
| Expense, including fuel/parking/insurance | `expenses.purchase_datetime` local date  |
| Work session                              | `work_sessions.started_at` business date |
| Platform income                           | detail `payment_date`                    |
| Contract invoice                          | detail `invoice_date`                    |
| Subscription/general income               | root `transaction_date`                  |

Typed income creation already sends a root transaction date. The upgraded
service validates it against the authoritative typed date and stores a canonical
value rather than permitting two contradictory accounting dates. Migration
reports, rather than silently overwriting, existing disagreements.

Attachments, comments, allocations, reconciliations, and typed details inherit
the parent record's persisted attribution.

## Period change workflow

Changing an operating entity is a domain command, not a generic row edit:

1. Load the business and current period in the authenticated account.
2. Validate the new legal entity belongs to that account.
3. Validate the effective date is after the current period start and does not
   create a gap or overlap.
4. Preview affected records and any review warnings.
5. In one database transaction, close the current period on the preceding date,
   insert the new open period, and append the audit event.
6. Do not rewrite older record attribution. Records dated in the new period
   resolve to the successor entity on create/edit.

Historical corrections use a separately authorized and audited command. They
must revalidate all adjacent boundaries and identify affected records before
changing attribution.

## Repository and authorization boundary

New SQL lives behind narrow repositories rather than continuing to spread
business/entity queries through route files. Repository inputs always put
`businessAccountId` first. Record queries include account and business
predicates, and reference validation proves all related IDs share both scopes.

Route handlers perform HTTP parsing and role checks; domain services perform
period resolution and business rules; repositories perform bound SQL. This
keeps D1 as the current implementation while avoiding Worker handlers that
depend on SQLite-specific query shapes throughout the codebase.

The domain boundary now resolves an effective New Zealand business date to
exactly one operating period and same-account legal entity. It fails closed for
missing or overlapping periods, inactive write targets, and account/business
scope mismatches. Record edits that cross an operating-period boundary return a
stable confirmation warning instead of silently changing legal attribution.

Reusable authorization helpers require account and business predicates for
business records and accept only explicitly allowlisted repository tables.
Business reference data may be assigned to that business or deliberately
shared at account scope; arbitrary table names and browser-provided legal
entity IDs are not authorization inputs.

The Worker router supports named path segments and now exposes authenticated
account, business-list, business-detail, legal-entity, dashboard, expense,
income, and work-session reads under explicit business context. Scoped record
creation derives the legacy compatibility activity and effective legal entity
from the route business; browser-provided account, business, activity, and
legal-entity attribution cannot override it. Existing flat endpoints remain as
temporary compatibility routes while the client moves to business URLs.

The unified scoped expense endpoint dispatches general, parking, fuel, and
insurance creation through their existing validation services. Root and typed
detail/allocation rows receive the same business and legal-entity attribution,
and audit events record both scopes.

## UI context

Account context contains My Businesses, cross-business transactions/reports,
accountant views, and account/member settings. Business context contains the
dashboard, expenses, income, mileage, documents, reports, and business settings.
The URL is the source of selected business context.

Desktop and tablet landscape use a persistent left sidebar. Tablet portrait
uses a compact sidebar while retaining the selected business. Phone uses a
compact header, business selector, single-column content, and bottom navigation.
Create/edit tasks occupy dedicated routes and one primary form per page.

## Demo and migration boundary

The demo uses the same target read model but keeps all visitor mutation in a
versioned, business-scoped IndexedDB overlay. It never gains a server write,
authentication cookie, R2 binding, invitation path, or arbitrary account
selection.

Browser schema version 2 stores operations, operating periods, and metadata
separately. Operations are indexed by business and record and carry resolved
legal-entity context when the record date identifies exactly one period. The
upgrade retains legacy operations only when their business can be resolved;
ambiguous record changes are discarded instead of being assigned across a
tenancy boundary. Reset clears local operations and restores the synthetic
period history without changing D1 data.

Private migration is conservative. Existing high-level activities become
businesses. A verified sole-trader entity may cover known history; a company is
never inferred. Unknown attribution is retained and marked for review. Legacy
activity relationships and old R2 keys remain readable until verification and
cleanup are complete.

## Database portability

D1/SQLite remains the deployed database for this upgrade. SQL should use bound
parameters, explicit transactions/batches, portable column types, and repository
interfaces. SQLite-specific triggers and table rebuilds stay in migrations and
integrity adapters. PostgreSQL is a future option if commercial concurrency,
operations, or reporting demands justify migration; it is not introduced or
emulated now.
