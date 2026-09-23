# ADR 016: Keep D1 and introduce repository boundaries for future portability

Status: Accepted

## Context

D1 fits the private and public-demo workloads and is integrated with the Worker
deployment. The upgrade adds business-scoped and effective-dated queries. Putting
more SQLite-specific SQL directly in route handlers would increase migration
risk and make a future commercial move to PostgreSQL unnecessarily difficult.

## Decision

Continue using D1/SQLite. Put new business, legal-entity, period, and attributed
record access behind typed repositories. Routes own HTTP concerns, services own
authorization and domain rules, and repositories own bound SQL. Keep
SQLite-specific triggers, partial indexes, and rebuild mechanics in migrations
or integrity adapters.

PostgreSQL is a future option, not a parallel implementation. It will be
considered only when measured concurrency, operational, or reporting needs
justify the cost.

## Consequences

The application retains its simple Cloudflare deployment and existing data.
Repository seams improve testability and constrain dialect dependencies, but
they require deliberate refactoring instead of adding new SQL wherever it is
convenient. No claim is made that current SQL is automatically cross-database.
