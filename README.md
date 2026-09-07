# Business Records

A private, invitation-only application for organising business income, expenses, mileage, and supporting documents. It is designed for small New Zealand business workflows and deliberately avoids making tax-treatment decisions.

## Current status

Phase 4 provides an invitation-only React PWA and Cloudflare Worker API with passwordless email sign-in, owner/accountant authorization, owner bootstrap, user management, account disabling, and expiring invitations. Local development uses persisted simulated D1 and R2 bindings and an in-app email outbox, so it still needs no Cloudflare account or email provider.

## Local setup — no Cloudflare account required

Requirements: Node.js 22 or later and pnpm 10 or later.

```bash
pnpm install
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

Open `http://localhost:5173`. Vite runs the React client and Worker together using Cloudflare's local Workers runtime. Miniflare stores both simulated D1 and R2 data under `.wrangler/state/`; nothing is sent to demo or production resources. Restarting `pnpm dev` preserves that state.

To inspect local D1 metadata from the terminal:

```bash
pnpm db:inspect:local
```

While `pnpm dev` is running, Cloudflare's Local Explorer is available at `http://localhost:5173/cdn-cgi/local/explorer` for inspecting D1 and R2.

To remove all local D1 and R2 contents and return to migrated, seeded state:

```bash
pnpm db:reset:local
```

The reset script validates its target, removes only `.wrangler/state/`, then reapplies migrations and the local seed.

## Local authentication and invitation testing

Development authentication works only when both of these conditions hold:

- configuration explicitly selects `APP_ENV=local` and enables the helper;
- the request hostname is `localhost`, `127.0.0.1`, or `[::1]`.

Demo and production configuration disable the helper. It cannot be used through a deployed hostname even if variables are accidentally changed.

Seed identities:

- Owner: `owner@local.test`
- Accountant: `accountant@local.test`
- Disabled accountant: `disabled@local.test`

The sign-in screen exposes local owner/accountant shortcuts only when the guarded helper is available. The regular passwordless flow also works locally: submit an active email at `POST /api/auth/login`, then read its single-use 15-minute URL from the owner-protected `GET /api/dev/auth/outbox` endpoint.

Sign in and preserve the returned HTTP-only cookie:

```bash
curl -c /tmp/business-records-owner.cookies \
  -H 'content-type: application/json' \
  -d '{"email":"owner@local.test"}' \
  http://localhost:5173/api/dev/auth/login
```

Check owner-only authorization:

```bash
curl -b /tmp/business-records-owner.cookies \
  http://localhost:5173/api/dev/permissions/owner
```

Create an invitation. The production-shaped endpoint and local outbox contain the invitation URL because local development sends no email:

```bash
curl -b /tmp/business-records-owner.cookies \
  -H 'content-type: application/json' \
  -d '{"email":"new-accountant@local.test"}' \
  http://localhost:5173/api/invitations

curl -b /tmp/business-records-owner.cookies \
  http://localhost:5173/api/dev/invitations/outbox
```

Submit the URL token and matching email to `POST /api/invitations/accept`. Tokens are hashed in D1, expire after 72 hours, and become unusable after acceptance. Acceptance creates an accountant account but no session; the new accountant signs in through the normal email-link flow. The seed also contains an expired invitation for testing rejection.

Run the complete local flow against a running development server with:

```bash
pnpm test:local
```

This checks owner bootstrap idempotency, login-link replay protection, role denial, invitation acceptance/expiry/replay, account disabling, immediate session revocation, and R2 persistence.

## Production authentication setup

Before the first production deployment:

1. Replace the production D1/R2 IDs, `APP_ORIGIN`, Turnstile site key, email relay URL, and sender placeholders in `wrangler.jsonc`.
2. Configure a Turnstile widget for the production hostname. Production rejects login requests unless the response is verified server-side.
3. Configure an HTTPS email relay accepting `POST` JSON with `from`, `to`, `subject`, and `text` fields plus a bearer token.
4. Store the real owner email, a strong one-time administrative key, the Turnstile secret, and relay token as Worker secrets—never committed variables:

```bash
pnpm exec wrangler secret put BOOTSTRAP_OWNER_EMAIL --env production
pnpm exec wrangler secret put BOOTSTRAP_ADMIN_KEY --env production
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --env production
pnpm exec wrangler secret put EMAIL_DELIVERY_BEARER_TOKEN --env production
```

Apply migrations to the deliberately selected remote production D1 database, deploy, then initialise the configured owner once:

```bash
pnpm exec wrangler d1 migrations apply business-records-production --env production --remote
pnpm deploy:production

curl -X POST \
  -H 'x-bootstrap-key: <BOOTSTRAP_ADMIN_KEY>' \
  https://<production-host>/api/admin/bootstrap-owner
```

The operation is idempotent for the configured email and refuses to create or transfer to a second owner. It does not create a session: the owner must request a normal email sign-in link. Public signup does not exist; afterward, the owner invites accountants from the Users screen. Disable preserves the user and audit history while revoking all active sessions.

The generic relay contract keeps the application provider-neutral. Confirm delivery, sender-domain authentication, suppression handling, and data residency with the selected provider before production use.

## Local R2 verification

With the owner cookie, write and read a harmless probe object in simulated R2:

```bash
curl -X PUT -b /tmp/business-records-owner.cookies \
  http://localhost:5173/api/dev/storage-probe

curl -b /tmp/business-records-owner.cookies \
  http://localhost:5173/api/dev/storage-probe
```

The fixed probe key cannot be controlled by user input. Actual attachment handling and file validation arrive in Phase 11.

## Commands

```text
pnpm dev                 Run the client and Worker locally
pnpm build               Type-check and build deployable Worker assets
pnpm preview             Preview the production-format Worker build locally
pnpm lint                Run ESLint
pnpm format              Format tracked project files
pnpm format:check        Check formatting
pnpm typecheck           Check client and Worker TypeScript projects
pnpm test                Run unit and component tests
pnpm test:watch          Run tests interactively
pnpm test:local          Smoke-test a running local Worker (optional URL argument)
pnpm cf-typegen          Regenerate binding types when configuration changes
pnpm db:migrate:local    Apply pending migrations to local D1
pnpm db:seed:local       Replace deterministic synthetic local seed data
pnpm db:inspect:local    Inspect local runtime metadata
pnpm db:verify:local     Check D1 integrity, foreign keys, and seed counts
pnpm db:reset:local      Reset, migrate, and seed local D1/R2 state
```

## Database schema

Migrations are ordered SQL files under `migrations/` and must never be edited after deployment. Phase 3 adds normalized activities, vehicles, expense categories, expenses and specialised details, allocations, work sessions, income and specialised details, clients, reconciliation, attachments, comments, audit history, saved filters, and retention settings.

Money is stored in integer minor units with an explicit currency. Mileage distance is generated from odometer readings. See [the data model](docs/data-model.md) for relationships and invariants.

## Environment separation

`wrangler.jsonc` declares independent local, demo, and production D1/R2 bindings. The committed demo and production UUIDs are intentional placeholders, not credentials. Before deployment, create resources in the target Cloudflare account and replace only that environment's placeholders.

Select demo or production at build time with `CLOUDFLARE_ENV`; the provided deployment scripts do this explicitly. Never run remote database commands without reviewing the target and including `--remote` intentionally.

## Security notes

- D1 and R2 are accessed only from the Worker. R2 has no public bucket URL.
- Backend routes enforce roles; frontend checks are never authoritative.
- Session, login-link, and invitation tokens are random and stored only as SHA-256 hashes.
- Production login uses server-verified Turnstile and route-specific Cloudflare rate limiting.
- Cookies are HTTP-only, same-site strict, and secure over HTTPS; disabled accounts lose active sessions immediately.
- API responses are non-cacheable and do not expose internal errors.
- `.dev.vars*`, `.env*`, local Wrangler state, and generated builds are ignored.
- Do not commit real financial data, identities, resource IDs, or secrets.

## Known limitations and roadmap

The schema and access layer are available, but business feature APIs and screens are intentionally added in later phases. Activities and vehicles begin in Phase 5; attachments, exports, Storybook, broader end-to-end coverage, demo data, and deployment/recovery work follow their numbered phases.

## Source-visible notice

Copyright © 2026.

This source code is made publicly available for viewing and portfolio evaluation purposes only. No licence is granted to copy, modify, redistribute, sublicense, or commercially use this software.
