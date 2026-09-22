# ADR 010: Public demo cost and abuse boundary

Status: Accepted

## Context

The demo intentionally allows any visitor to select an owner or accountant UI role. That browser-local selection cannot prevent automated traffic from consuming Worker or D1 quotas. The demo must remain useful for portfolio evaluation without creating an open-ended denial-of-wallet path.

## Decision

Keep the demo on the Cloudflare Workers Free plan initially and accept temporary unavailability when its quota is exhausted. Do not automatically move it to paid execution or bypass a security control to preserve availability. Re-check current Cloudflare pricing and limits before any plan or storage-class change; do not encode those commercial values in application logic.

Retain the isolated Worker, D1, variables, fictional identities, and guarded reset process from ADR 009, but remove the demo R2 binding. Add automated configuration checks proving that demo database and rate-limit resource identifiers are disjoint from production and that document storage is absent.

Version 2c strengthens the original read-mostly decision: the demo backend is strictly read-only. Reject every non-read request before authentication, D1, R2, hashing, or archive work. Keep role demonstrations, metadata edits, comments, statuses, temporary records, tombstones, and document previews in the visitor's IndexedDB overlay. Email, invitations, bootstrap, and other account administration remain unavailable.

Apply layered demo-wide rate limits before route handling: 30 requests per 10 seconds for bursts and 120 requests per 60 seconds for sustained reads, in addition to the existing stricter authentication and expensive-route limiters. Missing demo-wide bindings are a fail-closed service error. Rejections include `Retry-After`; the browser retries only safe reads, at most twice, with a bounded exponential delay and jitter. The limits use separate client and session dimensions where available; ordinary browsing does not require repeated Turnstile challenges.

Bound high-cardinality transaction and audit queries with validated pagination: 50 rows by default, 100 maximum, and no more than 100 pages. Cap other collection responses. Existing indexes cover common record dates, statuses, activities, categories, vehicles, attachments, comments, and audit filters. Hashed build assets receive immutable caching. Successful demo JSON GET responses use the full URL as a Cloudflare Cache API key and remain at an edge location for ten minutes; health checks, binary downloads, and local development helpers are excluded, and a cache failure falls through to the route. Production API data remains non-cacheable.

## Consequences

- Exhausted quotas may make the demo temporarily unavailable, which is preferable to uncontrolled spend or bypassing controls.
- Visitors cannot demonstrate live document upload or archive download in the shared public environment; those workflows remain fully available locally and in production.
- Visitor changes remain possible only in each browser's IndexedDB overlay; operators reset remote synthetic data only when the seed itself needs restoring.
- Cloudflare rate-limit bindings are intentionally an abuse-control layer, not an exact accounting or concurrency mechanism.
- A future decision to enable demo uploads, exports, paid execution, or an R2 binding requires a new review with small server-enforced limits, accumulation controls, response caps, and current provider pricing.
