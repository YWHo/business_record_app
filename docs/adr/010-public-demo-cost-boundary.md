# ADR 010: Public demo cost and abuse boundary

Status: Accepted

## Context

The demo intentionally allows any visitor to obtain an owner or accountant session. Authentication still protects role behavior, but it cannot by itself prevent automated traffic from consuming Worker, D1, or R2 quotas. The demo must remain useful for portfolio evaluation without creating an open-ended denial-of-wallet path.

## Decision

Keep the demo on the Cloudflare Workers Free plan initially and accept temporary unavailability when its quota is exhausted. Do not automatically move it to paid execution or bypass a security control to preserve availability. Re-check current Cloudflare pricing and limits before any plan or storage-class change; do not encode those commercial values in application logic.

Retain the isolated Worker, D1, R2, variables, fictional identities, and guarded reset process from ADR 009. Add automated configuration checks proving that demo storage and rate-limit resource identifiers are disjoint from production.

Make the public demo read-mostly. Keep bounded metadata edits and comments for role demonstrations, but reject binary uploads, dynamic ZIP exports, and permanent purge at the Worker boundary before authentication, D1, R2, hashing, or archive work. Reflect the same restrictions in the interface. Email, invitations, bootstrap, and other account administration remain unavailable.

Apply dedicated demo-wide read and write rate-limit bindings before route handling, in addition to the existing stricter authentication and expensive-route limiters. Missing demo-wide bindings are a fail-closed service error. The limits use separate client and session dimensions where available; ordinary browsing does not require repeated Turnstile challenges.

Bound high-cardinality transaction and audit queries with validated pagination: 50 rows by default, 100 maximum, and no more than 100 pages. Cap other collection responses. Existing indexes cover common record dates, statuses, activities, categories, vehicles, attachments, comments, and audit filters. Hashed build assets receive immutable caching, while private API data remains non-cacheable.

## Consequences

- Exhausted quotas may make the demo temporarily unavailable, which is preferable to uncontrolled spend or bypassing controls.
- Visitors cannot demonstrate live document upload or archive download in the shared public environment; those workflows remain fully available locally and in production.
- Public writes remain possible for lightweight synthetic workflows, so the operator must reset data periodically and review usage and abuse signals.
- Cloudflare rate-limit bindings are intentionally an abuse-control layer, not an exact accounting or concurrency mechanism.
- A future decision to enable demo uploads, exports, paid execution, or another R2 storage class requires a new review with small server-enforced limits, accumulation controls, response caps, and current provider pricing.
