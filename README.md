# Business Records

A private, invitation-only application for organising business income, expenses, mileage, and supporting documents. It is designed for small New Zealand business workflows and deliberately avoids making tax-treatment decisions.

## Current status

The application is an installable, mobile-first React PWA and Cloudflare Worker API with passwordless production authentication, business records, private versioned documents, review and retention controls, portable backups, and a server-derived business dashboard. Critical lifecycles have Storybook, unit, and Playwright coverage, and an isolated, cost-bounded public demo offers synthetic New Zealand owner/accountant scenarios without signup. Local development still needs no Cloudflare account or email provider.

Start with the guide that matches the job:

- [Architecture](docs/architecture.md) and [data model](docs/data-model.md)
- [Production and demo deployment](docs/deployment-guide.md)
- [Routine operations](docs/operations-guide.md)
- [Backup, incident recovery, and redeployment](docs/recovery-guide.md)
- [Security review](docs/security-review.md) and [architecture decisions](docs/adr/)

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

This checks authentication and role controls, business records, private versioned documents, transaction and receipt filters, saved-view isolation, review transitions and attribution, append-only comments, source-edit review reset, invitation controls, session revocation, and R2 persistence.

Run the critical browser workflows with:

```bash
pnpm exec playwright install chromium # first run only
pnpm test:e2e
```

The end-to-end command resets local D1 and R2 state before launching the app. It covers owner/accountant login and authorization, reference and record creation, receipt upload, all primary income types, review and reconciliation, search and filters, ZIP export, invitations, and retention-protected trash/restore.

## Business activities and vehicles

Authenticated users can view all active and inactive activities and vehicles from **Setup**. Owners can create and edit them or change their lifecycle status; accountants see the same historical context without mutation controls.

Activities have a configurable name and uppercase type key rather than a hard-coded provider enum. Vehicles retain registration, description, acquisition/retirement dates, and optional notes. Deactivation sets an end or retirement date, while reactivation clears it. Records are never hard-deleted, so future financial and mileage records can keep stable historical references.

## Mileage and work sessions

The **Mileage** screen lets the owner create and edit business sessions using an activity, vehicle, timezone-aware start/end times, and starting/ending odometers. Gross revenue is optional and entered in dollars but stored as integer minor units. Accountants can review the same history and metrics without editing it.

Distance is generated by D1 as ending odometer minus starting odometer; the API ignores any caller-supplied distance. Revenue/hour and revenue/km are derived by the Worker and are omitted when their denominator is zero. Aggregate rates are also omitted when any session lacks revenue or multiple currencies would make the result misleading. This is a mileage log, not GPS or trip-by-trip tracking.

## Fuel and full-tank evidence

The **Fuel** screen records the shared expense fields—merchant, purchase time, total, currency, GST, activity, and description—together with vehicle, station, fill type, odometer, litres, and pump price. Fuel price and litres remain optional. If either is missing, or price × litres materially differs from the receipt total, the API returns a warning and requires an explicit **Save anyway** confirmation. The material threshold is the greater of NZD 1.00 (or one unit of the selected currency) and two percent of the receipt total.

From **Mileage**, an owner can confirm that the tank was full at the start, no personal driving occurred, and the tank was full at the end, then link fuel receipts for the same vehicle. The starting receipt is optional. A full ending receipt with litres supplies actual usage and cost evidence. The Worker derives km/L and fuel cost/km from that ending refill and the generated session distance. Results are labelled **Exact full-tank** only when all three confirmations are true; otherwise supported results say **Estimate only**, and incomplete ending evidence remains unavailable.

## Parking, general expenses, and categories

The **Records** screen lets owners create and edit parking and general expenses. Both use the shared financial fields, including optional activity, integer-minor-unit amounts, explicit GST status, and a one-off or recurring marker. General expenses require an active configurable category, allowing new business costs without a schema change.

Parking adds a required location with optional provider, vehicle, start/end instants, and ticket reference. When both times exist, the Worker derives duration from them and rejects a reversed interval. It does not accept or store a caller-supplied duration.

The **Setup** screen lists built-in and custom expense categories. Owners can create and rename categories or change their lifecycle status; accountants can view them. Fuel, Parking, Vehicle Insurance, and Professional Liability Insurance remain active because specialised record workflows depend on those category identities. Historical expenses may retain inactive categories.

## Insurance and mixed-use allocation

The **Insurance** screen records professional/liability, vehicle, and other policies. The full premium remains the common expense amount. A separate allocation records the estimated business amount and method: 100% business, manual percentage, business kilometres over total kilometres, accountant adjustment, or undetermined. Percentage-based amounts are derived by the Worker; kilometres-based allocations require a dated calculation period.

Professional liability cover requires an activity, and vehicle cover requires a vehicle. Owners create and edit source policies. Accountants can review all insurance and use only the allocation-adjustment endpoint, which records their identity and a before/after audit summary without changing the full premium. The UI consistently describes allocations as record-keeping estimates, not final tax or accounting treatment.

## Income and reconciliation

The **Income** screen treats revenue as four first-class record families. Platform income stores a configurable provider and payout period with gross earnings, tips, promotions, flat-rate credit, fees, signed adjustments, and net payment. Contract income links a reusable client and unique invoice number to invoice/service dates, subtotal, GST, total, due date, payment status, received amount, and outstanding amount. Subscription income is deliberately period-summary only: gross revenue, refunds, fees, net payment, and optional aggregate counts. General income covers other section 23 records without forcing specialised detail.

The common displayed value is net payment for platform and subscription records, invoice total for contracts, and the entered total for general income. Those values are not silently combined into cash-flow or profit conclusions. Owners control source records and client lifecycle. Both owners and accountants can append a manual expected-versus-actual reconciliation; the Worker derives the minor-unit difference and match status and records the reviewer. No bank connection or operational subscriber database is implied.

## Public demo setup

The demo is a separate named Cloudflare environment for portfolio visitors. It uses only fictional records, its own Worker, D1 database, R2 bucket, variables, and rate-limit namespace, and never reads production bindings. Visitors choose **Continue as Demo Owner** or **Continue as Demo Accountant**; that selection exists only in the current browser tab and creates no server session or cookie. Email login and the loopback development helper are not exposed in demo mode.

Keep the demo on the Workers Free plan initially. Quota exhaustion may temporarily make the demo unavailable; do not bypass protections or automatically upgrade it to paid execution. The Worker applies a demo-wide read limit before read route work and rejects writes before any limiter or storage work. A missing read limiter fails closed. If the account later becomes pay-as-you-go, configure low account-level budget alerts, remembering that alerts notify rather than cap spend. Re-check current Cloudflare pricing and limits before changing plans or R2 storage class; no price or free-tier quota belongs in application logic.

The demo backend is strictly read-only: every non-GET API request is rejected before D1 or R2 work. The UI keeps edits, comments, statuses, new records, and deletion tombstones in a per-browser IndexedDB overlay. Reloading preserves that browser's changes; another browser context starts clean. **Reset demo data** clears only the current browser overlay. Demo document selection and preview never send visitor files to the Worker or R2. Dynamic ZIP generation, permanent deletion, outbound email, invitations, bootstrap, and destructive administration remain unavailable.

Provision the remote demo resources once:

```bash
pnpm exec wrangler d1 create business-records-demo
pnpm exec wrangler r2 bucket create business-records-demo-documents
```

Replace the demo D1 placeholder ID and `APP_ORIGIN` in `wrangler.jsonc` with the created resource ID and final demo Worker URL. Do not copy production identifiers or secrets into the demo environment. Apply migrations, load the synthetic dataset, and deploy:

```bash
pnpm db:reset:demo
pnpm deploy:demo
```

The reset command always targets remote D1 with `--env demo --remote`. Because it deletes all demo rows and sessions before reseeding, it requires typing `business-records-demo`. For a deliberately authorized scheduled CI reset, provide the same confirmation non-interactively:

```bash
pnpm db:reset:demo -- --confirm business-records-demo
```

`pnpm db:seed:demo` replaces records without applying migrations first and has the same confirmation guard. The seed provides two synthetic accounts, four business activities, two vehicles, fictional clients/providers, work sessions, weekly platform payments, paid and outstanding IT invoices, SaaS summaries, fuel, parking, software, cloud hosting, insurance allocations, reconciliations, comments, audit history, saved filters, and mixed review statuses.

The SQL seed intentionally contains no attachment metadata unless matching fictional R2 objects are deliberately provisioned. Browser-selected demo files remain local and cannot create bucket objects. Remove any objects left by an older write-enabled demo deployment. Never apply a demo cleanup policy to production evidence. Use R2 Standard unless a later ADR records a reviewed reason to change storage class.

## Production authentication setup

The concise sequence below is useful as a reference. For a first deployment, upgrades, verification, and rollback gates, follow the complete [deployment guide](docs/deployment-guide.md).

Before the first production deployment:

1. Choose the final origin. For the default route it is predictably `https://business-records-production.<your-account-subdomain>.workers.dev`; find or configure **Your subdomain** under Cloudflare **Workers & Pages**. A custom production domain may be chosen instead. See the deployment guide for both flows.
2. Replace the production D1 database ID, `APP_ORIGIN`, Turnstile site key, email relay URL, and sender placeholders in `wrangler.jsonc`; confirm the configured production R2 bucket name matches the bucket you created.
3. Configure a Turnstile widget for the production hostname. Production rejects login requests unless the response is verified server-side.
4. Configure an HTTPS email relay accepting `POST` JSON with `from`, `to`, `subject`, and `text` fields plus a bearer token.
5. Store the real owner email, a strong one-time administrative key, the Turnstile secret, and relay token as Worker secrets—never committed variables:

Leave `DEV_OWNER_EMAIL`, `DEV_ACCOUNTANT_EMAIL`, and `DEV_BOOTSTRAP_KEY` unchanged. Production ignores those development-only sentinel values. The real owner address belongs only in the `BOOTSTRAP_OWNER_EMAIL` Cloudflare secret:

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
  -H 'Origin: https://<production-host>' \
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

The fixed probe key cannot be controlled by user input. It is only a binding diagnostic; normal supporting documents use the authenticated attachment API described below.

## Private supporting documents

Expense, income, and work-session cards include reusable supporting-document controls. Owners may attach multiple JPEG, PNG, WebP, or PDF files up to 25 MB each. Accountants may list and download documents but cannot upload or replace them. Browser MIME claims are checked against file signatures at the Worker boundary, filenames are treated only as metadata, and R2 keys are generated server-side.

Each file receives a SHA-256 hash. Matching content or a repeated current filename returns a visible possible-duplicate warning; the owner may deliberately continue because a warning is not proof of duplication. Replacing a current document writes a new uniquely keyed R2 object and increments its version group. Earlier bytes and metadata remain downloadable, while only the newest version is marked current.

On mobile, **Take a photo** requests the rear-facing camera when the browser supports it; the adjacent picker accepts an existing JPEG, PNG, WebP, or PDF. A local preview appears before upload. Quarter-turn orientation is stored as separate display metadata and included in exports, so rotating a preview never rewrites the immutable source bytes. A failed or offline upload retains the selected file for an explicit retry. OCR is intentionally absent from version 1; the stable attachment ID, content hash, MIME metadata, and separate presentation metadata allow a future extraction job to reference the original version safely.

R2 has no public URL. Downloads pass through an authenticated endpoint and use `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and private no-store caching. Attachment retention dates inherit the parent record's configured tax-year dates.

## Transaction search and review

The **Transactions** workspace projects income and expenses into one read-only log without flattening their source tables. Search and parameterized filters cover date range or New Zealand tax year, activity, income/expense direction, record type, expense category, merchant/client/provider text, status, vehicle, amount range, attachment presence, and review state. The Receipt log uses the same authoritative projection but exposes each record's private supporting-document controls, making missing evidence visible rather than hiding records without files.

Authenticated users can save named transaction or receipt filter sets. Saved views are scoped to the current user and can be applied, updated through the API, or removed without affecting another user.

Owners may mark a record new, missing information, ready for review, or voided. Accountants may request information, return a record to the queue, review a ready record, and process a reviewed record; they cannot void source records. Voided records retain their terminal history. Review identity and time are stored on financial records, meaningful transitions are audited, and any later owner edit to source data resets status to **New** and clears stale review attribution. Both roles can append attributed, timestamped comments; prior comments cannot be edited away through the API.

## Exports and local backups

Open **Exports** to download a monthly period, a configured tax year, or every retained record. An export is a repeatable read: it never moves or deletes cloud data. The ZIP uses ordinary uncompressed entries and includes structured CSV files, source attachment versions, `summary/summary.html`, and `manifest.json` with SHA-256 hashes and verified record/attachment counts.

The dashboard shows a reminder when no export has completed or the configured interval has elapsed. Generation history records the scope, actor, completion time, counts, and manifest digest; it does not store a second archive in the cloud. Keep downloaded ZIPs in storage you control and retain more than one local copy where practical.

There is no archive-import UI in version 1. For future recovery, first verify every file against `manifest.json`, select the importer for its `schemaVersion`, restore reference CSVs before record CSVs, recreate attachment metadata from `attachment-index.csv`, then upload each listed document and confirm the final counts. Preserve original IDs and audit timestamps in a quarantined restore environment before promoting restored data.

## Commands

```text
pnpm dev                 Run the client and Worker locally
pnpm build               Type-check and build deployable Worker assets
pnpm build:demo          Build with the dedicated demo Cloudflare bindings
pnpm build:production    Build with the dedicated production bindings
pnpm preview             Preview the production-format Worker build locally
pnpm lint                Run ESLint
pnpm format              Format tracked project files
pnpm format:check        Check formatting
pnpm typecheck           Check client and Worker TypeScript projects
pnpm test                Run unit and component tests
pnpm security:audit      Check the resolved dependency graph for advisories
pnpm test:watch          Run tests interactively
pnpm test:e2e            Reset local data and run critical Chromium workflows
pnpm test:e2e:headed     Reset local data and run Chromium with a visible browser
pnpm storybook           Run isolated component stories on port 6006
pnpm storybook:build     Build the static Storybook and validate all stories
pnpm test:local          Smoke-test a running local Worker (optional URL argument)
pnpm cf-typegen          Regenerate binding types when configuration changes
pnpm db:migrate:local    Apply pending migrations to local D1
pnpm db:seed:local       Replace deterministic synthetic local seed data
pnpm db:inspect:local    Inspect local runtime metadata
pnpm db:verify:local     Check D1 integrity, foreign keys, and seed counts
pnpm db:reset:local      Reset, migrate, and seed local D1/R2 state
pnpm db:migrate:demo     Apply migrations to explicitly selected remote demo D1
pnpm db:seed:demo        Replace remote demo rows after guarded confirmation
pnpm db:reset:demo       Migrate and restore guarded remote demo data
pnpm db:verify:demo      Check the explicitly selected remote demo dataset
```

## Database schema

Migrations are ordered SQL files under `migrations/` and must never be edited after deployment. Phase 3 adds the normalized business-record schema, Phase 4 authentication, Phase 14 export completion history, and Phase 16 non-destructive attachment display orientation.

Money is stored in integer minor units with an explicit currency. Mileage distance is generated from odometer readings. See [the data model](docs/data-model.md) for relationships and invariants.

## Environment separation

`wrangler.jsonc` declares independent local, demo, and production D1/R2 bindings. The committed demo and production UUIDs are intentional placeholders, not credentials. Before deployment, create resources in the target Cloudflare account and replace only that environment's placeholders.

The deployment scripts select a committed, selector-only Vite mode file for the build and pass the matching explicit `--env` to Wrangler for upload. The mode files contain no secrets. Never run remote database commands without reviewing the target and including `--remote` intentionally.

## Demo usage monitoring

Review the following periodically and after unexpected demo slowdowns:

- Workers request and error trends, especially 429 and 5xx responses;
- D1 rows read/written, query latency, storage growth, and quota warnings;
- R2 object count, storage, Class A/Class B operations, and any old orphaned objects;
- rate-limit and security events available through Cloudflare analytics or logs;
- recent reset success and confirmation that only fictional records and identities remain;
- current Cloudflare plan, pricing, and limits before enabling paid use or changing storage class.

Use access-controlled, sampled Workers logs without request bodies or tokens. Configure provider notifications for quota and service anomalies. If pay-as-you-go is enabled, use low budget alerts as notification only; application limits remain the actual safety boundary.

## Security notes

- D1 and R2 are accessed only from the Worker. R2 has no public bucket URL.
- Backend routes enforce roles; frontend checks are never authoritative.
- Session, login-link, and invitation tokens are random and stored only as SHA-256 hashes.
- Production login uses server-verified Turnstile and route-specific Cloudflare rate limiting.
- Deployed state-changing API requests require the exact configured application origin; uploads and exports have dedicated per-client and per-business-account limits.
- The public demo rate-limits reads and rejects every mutation before authentication, D1, R2, or other expensive route work.
- Cookies are HTTP-only, same-site strict, and secure over HTTPS; disabled accounts lose active sessions immediately.
- Static and API responses set restrictive content, framing, referrer, permissions, and transport headers. API responses are non-cacheable and do not expose internal errors.
- Production/local uploads are private, size/type/signature checked, and forced to download without sniffing. Export files are hashed, counted, and neutralize spreadsheet formula prefixes in textual CSV cells.
- `.dev.vars*`, `.env*`, local Wrangler state, and generated builds are ignored.
- Do not commit real financial data, identities, resource IDs, or secrets.

## Known limitations and roadmap

Authentication, reference data, business records, private versioned attachments, unified review, audit/trash/retention controls, portable exports, operating analytics, installable PWA behavior, mobile capture, Storybook component coverage, critical Playwright workflows, an isolated synthetic public demo, security controls, and owner/operator documentation are complete. Production still requires operator-owned Cloudflare resources, DNS, Turnstile, an email relay, secrets, monitoring, and a deliberate deployment using the deployment guide.

## Source-visible notice

Copyright © 2026.

This source code is made publicly available for viewing and portfolio evaluation purposes only. No licence is granted to copy, modify, redistribute, sublicense, or commercially use this software.
