# ADR 014: Separate businesses from legal entities with operating periods

Status: Accepted

## Context

The current `business_activities` rows represent operating businesses, while
`business_entities` is account metadata and accounting records have no durable
legal-entity attribution. One business can move between a sole trader and a
company without becoming a different business, and reports must preserve who
operated it at the time.

## Decision

Add first-class `businesses` and effective-dated
`business_entity_periods`. Retain `business_accounts` as tenancy and
`business_entities` as the physical legal-entity table. Persist account,
business, and Worker-resolved legal entity on authoritative accounting records.

Periods use inclusive dates, cannot overlap, and permit at most one open row per
business. Ordinary transaction clients supply business context and record date,
not legal entity. Period changes and date edits that change attribution are
controlled, confirmed, and audited.

Existing top-level activities become businesses through an additive migration.
Unknown private history is review-marked rather than assigned to a speculative
company.

## Consequences

The UI can remain centered on a continuous business while legal reporting stays
historically correct. Writes require an extra resolution query and period
integrity controls. Legacy activity relationships must coexist temporarily, and
backfill verification is mandatory before constraints or cleanup.
