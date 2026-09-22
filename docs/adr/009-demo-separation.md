# ADR 009: Public demo isolation and browser-local role switching

Status: Accepted

## Context

Portfolio visitors need to explore realistic owner and accountant workflows without supplying an email address. A public demonstration must not expose production authentication, identities, financial records, D1 data, or R2 documents. Visitors can mutate demo data, so operators also need a repeatable way to restore a known presentation state.

## Decision

Deploy the demo as a named Cloudflare environment with its own Worker, D1 database, variables, and rate-limit namespaces. Do not give the demo an R2 binding. Production and demo bindings are declared independently and use different resource identifiers.

Select named bindings twice in the deployment workflow: a committed selector-only Vite mode file chooses the environment during the Cloudflare Vite build, and Wrangler receives an explicit matching `--env` during upload. These files contain only `CLOUDFLARE_ENV`, never credentials or application secrets.

Version 2c supersedes the original server-session decision in this ADR. Demo role selection is now `sessionStorage`-local UI simulation. No demo authentication endpoint, identity lookup, session row, or cookie exists. The Worker serves bounded immutable synthetic reads and rejects every non-read demo API request before D1/R2 work. Visitor changes use a per-browser IndexedDB overlay. The loopback development helper remains separately guarded and is never enabled by demo mode.

Keep the seeded identities stable between resets. Hide account administration from the demo UI and reject invitation/account-disabling mutations at the Worker boundary so one visitor cannot remove the shared accountant or create unusable public accounts. All ordinary business-record role permissions remain unchanged.

Store a deterministic, fictional New Zealand-oriented dataset in `scripts/seed-demo.sql`. A guarded operator script always passes `--remote --env demo`, requires the exact target name as confirmation, optionally applies migrations, then replaces all demo D1 rows. The seed contains no attachment metadata and the demo cannot access document object storage.

## Consequences

- Demo visitors receive realistic authorization behavior without signup, email delivery, or production secrets.
- Demo writes are intentionally temporary and cannot cross the binding boundary into production.
- Reset is destructive only to the explicitly selected demo D1 database and is suitable for a scheduled CI job when its exact confirmation argument is supplied.
- Browser-selected demo documents stay in the visitor's local IndexedDB overlay and never create server-side objects.
- Placeholder remote resource IDs and origins must be replaced during environment provisioning. No Cloudflare credentials or real identities belong in source control.
