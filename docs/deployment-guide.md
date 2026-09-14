# Deployment guide

This guide deploys two deliberately separate Cloudflare Workers:

- `business-records-production`, containing private live records;
- `business-records-demo`, containing fictional public demonstration data only.

Never reuse a D1 database, R2 bucket, hostname, secret, or real identity between them. Run all commands from the repository root. Commands containing `--remote` change Cloudflare resources.

## 1. Prerequisites and release gate

Use Node.js 22+, pnpm 10+, a Cloudflare account, Wrangler authentication, a production hostname, a Turnstile widget for that hostname, and an HTTPS email relay. The relay must accept `POST` JSON fields `from`, `to`, `subject`, and `text` with a bearer token.

Before preparing a release:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm security:audit
pnpm build:production
pnpm build:demo
pnpm storybook:build
```

Run `pnpm test:e2e` only in an isolated test checkout. It intentionally deletes and recreates `.wrangler/state/`; it does not touch remote D1 or R2 because the reset script permits only the local state path. Do not make CI release jobs depend on shared local Miniflare data.

Record the commit being released, test results, operator, UTC time, and intended environments. Stop if the worktree is not the reviewed commit.

## 2. Provision production resources

Authenticate and create dedicated resources once:

```bash
pnpm exec wrangler whoami
pnpm exec wrangler d1 create business-records-production
pnpm exec wrangler r2 bucket create business-records-production-documents
```

In `wrangler.jsonc`, replace the production D1 placeholder with the returned UUID. Replace production `APP_ORIGIN`, `TURNSTILE_SITE_KEY`, `EMAIL_DELIVERY_URL`, and `EMAIL_FROM` with real non-secret values. Keep `APP_ENV=production`, `LOCAL_AUTH_ENABLED=false`, and `TURNSTILE_REQUIRED=true`.

The rate-limit namespace IDs are configuration identifiers, not credentials. Keep the production values distinct from demo values. In Cloudflare, confirm the R2 bucket has no public development URL or custom public domain.

Apply migrations before making the Worker usable:

```bash
pnpm exec wrangler d1 migrations list business-records-production --env production --remote
pnpm exec wrangler d1 migrations apply business-records-production --env production --remote
pnpm exec wrangler d1 execute business-records-production --env production --remote --file ./scripts/verify-schema.sql
```

`PRAGMA quick_check` must return `ok`, `PRAGMA foreign_key_check` must return no rows, and the schema metadata query must return a value. Do not seed production.

## 3. Configure production secrets

Generate a strong, unique bootstrap key in a password manager. Set the exact owner email, bootstrap key, Turnstile secret, and email relay bearer token interactively:

```bash
pnpm exec wrangler secret put BOOTSTRAP_OWNER_EMAIL --env production
pnpm exec wrangler secret put BOOTSTRAP_ADMIN_KEY --env production
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --env production
pnpm exec wrangler secret put EMAIL_DELIVERY_BEARER_TOKEN --env production
pnpm exec wrangler secret list --env production
```

The production environment declares these four secret names as required, so a normal deployment fails rather than silently omitting one. Wrangler secret updates create a Worker version and may deploy it; configure and migrate the bound resources first. Never put secret values in `wrangler.jsonc`, a shell history command, CI output, screenshots, issues, or source control.

## 4. First production deployment

Review every production binding in `wrangler.jsonc`, then build and inspect a local upload bundle before the real deployment:

```bash
pnpm build:production
pnpm exec wrangler deploy --env production --dry-run --outdir .wrangler/deploy-preview/production
pnpm deploy:production
```

Map the production hostname to the Worker in Cloudflare, set `APP_ORIGIN` to that exact HTTPS origin, and deploy again if the hostname changed. Do not include a path or trailing slash in `APP_ORIGIN`.

Verify the public boundary before bootstrap:

```bash
curl --fail --silent --show-error https://<production-host>/api/health
curl -I https://<production-host>/
```

Confirm the health response says `production` and `ready`. Confirm HTTPS, security headers, PWA assets, a rejected unauthenticated private API request, Turnstile rendering, and delivery of a test login message.

Bootstrap the first owner exactly once from a trusted machine:

```bash
curl --fail --silent --show-error -X POST \
  -H 'Origin: https://<production-host>' \
  -H 'x-bootstrap-key: <BOOTSTRAP_ADMIN_KEY>' \
  https://<production-host>/api/admin/bootstrap-owner
```

Do not paste the real key into shared logs. The call is idempotent only for the configured email and creates no session. Sign in through the emailed link, confirm the owner-only screens, create a small test record and attachment, download it, generate an all-records export, and store that archive safely. Invite the accountant only after these checks pass.

## 5. Provision and deploy the public demo

Create separate resources and place only fictional data in them:

```bash
pnpm exec wrangler d1 create business-records-demo
pnpm exec wrangler r2 bucket create business-records-demo-documents
```

Replace only the demo D1 placeholder and demo `APP_ORIGIN` in `wrangler.jsonc`. Keep the demo email, local-auth, bootstrap, and Turnstile settings disabled. Then:

```bash
pnpm db:reset:demo
pnpm db:verify:demo
pnpm build:demo
pnpm exec wrangler deploy --env demo --dry-run --outdir .wrangler/deploy-preview/demo
pnpm deploy:demo
```

The reset requires typing `business-records-demo` because it destroys and reseeds remote demo rows. Verify both browser roles, browser-local edits and reset, cross-browser isolation, read rate limiting, and rejection of every non-GET API request. Check that demo D1/R2 IDs and hostname differ from production before publishing its URL.

## 6. Subsequent releases

For each environment, deploy one environment at a time:

1. Export an application backup from **Exports** and store it off-account.
2. Record the current D1 Time Travel bookmark and current Worker deployment/version.
3. Pass the release gate and review new migrations. Never edit an applied migration.
4. Apply production migrations, run `verify-schema.sql`, and only then deploy production code.
5. Check `/api/health`, authentication, one representative read, attachment download, and archive generation.
6. Review Worker errors, D1 errors/latency, R2 operations, rate-limit responses, and email delivery during the observation window.
7. Reset/redeploy demo separately if its schema or synthetic dataset changed.

If verification fails, stop writes if practical and follow the [recovery guide](recovery-guide.md). Rolling back Worker code does not roll back D1 migrations or R2 objects.

## 7. CI/CD boundaries

CI may run formatting, linting, type checks, unit tests, builds, Storybook, dependency audit, and local Playwright tests. A deployment job must use an environment-protected Cloudflare API token, pin the reviewed commit, and require explicit production approval.

Do not place `db:reset:demo`, any remote D1 mutation, owner bootstrap, secret rotation, or production deployment in a generic pull-request job. Never add a production reset command. Keep migration and deployment output as release evidence, but redact identities, tokens, cookies, invitation links, record contents, and request bodies.

## 8. Release record

Retain this minimum record outside the application:

- commit and Worker deployment/version IDs;
- UTC deployment time and operator;
- environment, Worker hostname, D1 database name/ID, and R2 bucket name;
- migration list and integrity-check result;
- pre-deploy D1 bookmark and application-export location/digest;
- post-deploy checks and monitoring outcome;
- configuration changes and rollback decision, if any.
