# Business Records

A private, invitation-only application for organising business income, expenses, mileage, and supporting documents. It is designed for small New Zealand business workflows and deliberately avoids making tax-treatment decisions.

## Current status

Phase 2 provides the React PWA and a Cloudflare Worker API with locally simulated, persisted D1 and R2 bindings. Authentication routes intended for real deployments arrive in Phase 4; the current local-only helper exercises roles, sessions, disabled accounts, invitations, and storage without weakening backend authorization.

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

Create an invitation. The response and local outbox contain the invitation URL because local development sends no email:

```bash
curl -b /tmp/business-records-owner.cookies \
  -H 'content-type: application/json' \
  -d '{"email":"new-accountant@local.test"}' \
  http://localhost:5173/api/dev/invitations

curl -b /tmp/business-records-owner.cookies \
  http://localhost:5173/api/dev/invitations/outbox
```

Submit the URL token and matching email to `POST /api/dev/invitations/accept`. Tokens are hashed in D1, expire after 72 hours, and become unusable after acceptance. The seed also contains an expired invitation for testing rejection.

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
pnpm db:seed:local       Replace local foundation seed data
pnpm db:inspect:local    Inspect local runtime metadata
pnpm db:reset:local      Reset, migrate, and seed local D1/R2 state
```

## Environment separation

`wrangler.jsonc` declares independent local, demo, and production D1/R2 bindings. The committed demo and production UUIDs are intentional placeholders, not credentials. Before deployment, create resources in the target Cloudflare account and replace only that environment's placeholders.

Select demo or production at build time with `CLOUDFLARE_ENV`; the provided deployment scripts do this explicitly. Never run remote database commands without reviewing the target and including `--remote` intentionally.

## Security notes

- D1 and R2 are accessed only from the Worker. R2 has no public bucket URL.
- Backend routes enforce roles; frontend checks are never authoritative.
- Session and invitation tokens are random and stored only as SHA-256 hashes.
- API responses are non-cacheable and do not expose internal errors.
- `.dev.vars*`, `.env*`, local Wrangler state, and generated builds are ignored.
- Do not commit real financial data, identities, resource IDs, or secrets.

## Known limitations and roadmap

The Phase 2 schema contains only runtime identity/session foundations. Phase 3 adds the complete business records schema. Phase 4 adds production owner bootstrap and invitation-only authentication. Business modules, attachments, exports, Storybook, end-to-end coverage, demo data, and deployment/recovery documentation follow their numbered implementation phases.

## Source-visible notice

Copyright © 2026.

This source code is made publicly available for viewing and portfolio evaluation purposes only. No licence is granted to copy, modify, redistribute, sublicense, or commercially use this software.
