# ADR 017: Scope restricted reads before projections and aggregation

Status: Implemented in auditor Phase 5.

## Context

Existing legacy and business-scoped handlers contain nested SELECTs, correlated
counts, financial aggregates, pagination, parent lookups, and typed-detail
joins. Authorization applied only to a URL or serialized result would leave
secondary queries and aggregates able to disclose unrelated data.

## Decision

The router maps every protected handler to an explicit permission and loads a
fresh server-owned membership/scope context. An unmapped protected handler is
denied. Domain-specific role and lifecycle safeguards remain additional checks.

Auditors and other restricted read contexts receive a read-only D1 adapter.
It prefixes approved SELECTs with CTEs named for the existing domain tables;
those CTEs select from physical `main` tables using account and grant predicates.
Original nested projections and pagination therefore see filtered rows from
the outset. Related detail, evidence, comment, reference, directory, and audit
tables are projected from permitted parents or attributed scope. SQL does not
perform textual replacement of arbitrary table identifiers.

The prefix binds two values: the trusted account and validated scope JSON.
JSON grants are relational data via `json_each`, not SQL fragments. This avoids
multiplying scope bindings across financial UNIONs and respects D1 query limits.
Grant count remains capped at sixteen. Instant bounds use Auckland midnights,
including daylight-saving transitions; income uses accounting calendar dates.

The adapter rejects writes, batches, schema introspection, physical table
qualification, multiple statements, numbered parameters, and caller-defined
WITH clauses. Rebinding cannot replace the prefix bindings. New query shapes
or sensitive tables require explicit support and isolation tests. This is an
application-owned query boundary, not a general-purpose SQL sandbox or a place
to execute visitor-supplied SQL.

Unrestricted owners/accountants retain their normal D1 mutation binding after
permission/window checks. Restricted non-auditors can inspect scoped data but
cannot perform account administration, unrestricted archives, or mutations.
The synthetic demo keeps its independent immutable read-only boundary without
private membership lookup or a private-authentication bypass.

## Consequences and validation

Existing SQL stays readable and uses the same logical table names. The adapter
is security-critical: unit/SQLite tests exercise the real Worker router and
actual handler projections, and Playwright exercises D1/R2 scope isolation.
Future handlers cannot inherit a generic authenticated permission implicitly.

Financial audit history follows persisted attribution and permitted parents.
Purged/unattributed history that cannot be safely assigned to a dated or entity
grant is omitted rather than guessed. Account-wide undated financial audit
history remains inspectable; member/authentication administration is excluded
from auditor views. New purge events retain business/entity attribution.

Evidence viewing is a private same-origin inline stream for supported passive
formats. The download endpoint is separately authorized. Viewing transfers
bytes, so screenshots and browser saving cannot be prevented by hiding a
download action. Reports similarly separate view, summary CSV export, and full
evidence archive permissions.
