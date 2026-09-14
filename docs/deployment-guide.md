# Deployment guide

This guide deploys two deliberately separate Cloudflare Workers:

- `business-records-production`, containing private live records;
- `business-records-demo`, containing fictional public demonstration data only.

Never reuse a D1 database, R2 bucket, hostname, secret, or real identity between them. Run all commands from the repository root. Commands containing `--remote` change Cloudflare resources.

## 1. Prerequisites and release gate

Use Node.js 22+, pnpm 10+, and a Cloudflare account. During the steps below you will choose the production hostname, create a Turnstile widget for that hostname, and configure an HTTPS email relay. The relay must accept `POST` JSON fields `from`, `to`, `subject`, and `text` with a bearer token.

### Authenticate Wrangler

For an interactive deployment from your own computer, sign in before running any provisioning command:

```bash
pnpm exec wrangler login
```

Wrangler opens a Cloudflare authorization page in your browser. Sign in, authorize Wrangler, return to the terminal after it confirms success, and verify the selected account:

```bash
pnpm exec wrangler whoami
```

If the browser does not open automatically, open the authorization URL printed in the terminal. If `whoami` still reports that you are not authenticated, retry `wrangler login` and ensure the terminal remains open until the browser flow completes. To replace an incorrect or expired interactive login:

```bash
pnpm exec wrangler logout
pnpm exec wrangler login
pnpm exec wrangler whoami
```

If `whoami` lists more than one account, pin the intended account for the current shell using the ID it reports, then use that same shell for every command in this guide:

```bash
export CLOUDFLARE_ACCOUNT_ID='<intended-account-id>'
pnpm exec wrangler whoami
```

The account ID is an identifier rather than a credential, but it must still select the correct account. Verify every new D1, R2, and Worker resource appears there.

Do not use interactive login in CI/CD. Store a least-privilege `CLOUDFLARE_API_TOKEN` and the matching `CLOUDFLARE_ACCOUNT_ID` in the CI provider's protected secret store. Scope the token to the intended account and only the resource permissions required by that job. Never commit either value or print the token.

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

### Choose the production origin before deploying

`APP_ORIGIN` is the exact public origin where people will use the production application. It is configuration, not a value returned by the application. Choose one of these routes before the first deployment.

For an initial `workers.dev` deployment, open the Cloudflare dashboard and go to **Workers & Pages**. Find **Your subdomain**; choose it there if the account does not have one yet. The production Worker name is already fixed by `wrangler.jsonc` as `business-records-production`, so its predictable URL is:

```text
https://business-records-production.<your-account-subdomain>.workers.dev
```

For example, if **Your subdomain** is `acme-records`, set:

```json
"APP_ORIGIN": "https://business-records-production.acme-records.workers.dev"
```

Do not run a placeholder-configured production deployment merely to discover this URL. Do not use a version-preview URL, include a path, or add a trailing slash.

For a custom domain, decide the final hostname first, such as `records.example.nz`, and set `APP_ORIGIN` to `https://records.example.nz`. The Worker may be deployed before the dashboard mapping is attached, but authentication and state-changing verification must wait until the custom domain resolves to that Worker. Cloudflare recommends a route or custom domain rather than `workers.dev` for business-critical production use.

Create the production Turnstile widget for the chosen hostname. The widget's hostname field is only the host—for example, `business-records-production.acme-records.workers.dev` or `records.example.nz`—without `https://`, a port, or a path. Copy its public site key into production `TURNSTILE_SITE_KEY`; retain its secret key for the secret step below.

After `whoami` identifies the intended account and the origin is decided, create dedicated resources once:

```bash
pnpm exec wrangler d1 create business-records-production
pnpm exec wrangler r2 bucket create business-records-production-documents
```

In `wrangler.jsonc`, replace the production D1 placeholder with the returned UUID. Replace production `APP_ORIGIN`, `TURNSTILE_SITE_KEY`, `EMAIL_DELIVERY_URL`, and `EMAIL_FROM` with the values prepared above. Keep `APP_ENV=production`, `LOCAL_AUTH_ENABLED=false`, and `TURNSTILE_REQUIRED=true`.

Do **not** put a real email address or key in `DEV_OWNER_EMAIL`, `DEV_ACCOUNTANT_EMAIL`, or `DEV_BOOTSTRAP_KEY`. Those committed values are inert sentinels for disabled development-only behavior; production bootstrap does not read them. Leave the production values as `disabled@production.invalid` and `disabled`. The `.invalid` and `.test` domains used by committed configuration are deliberately non-deliverable.

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

`BOOTSTRAP_OWNER_EMAIL` is the only place to enter the initial owner's real email. In production the Worker reads it from Cloudflare's encrypted secret binding, while `DEV_OWNER_EMAIL` is ignored. The email is not returned by `wrangler secret list` after it is stored.

If the Worker already exists, the same values can be entered through Cloudflare Dashboard → **Workers & Pages** → `business-records-production` → **Settings** → **Variables and Secrets**. Add each required name with type **Secret**, not plaintext variable. The four required names are:

- `BOOTSTRAP_OWNER_EMAIL`
- `BOOTSTRAP_ADMIN_KEY`
- `TURNSTILE_SECRET_KEY`
- `EMAIL_DELIVERY_BEARER_TOKEN`

The production environment declares these names as required, so a normal deployment fails rather than silently omitting one. Wrangler secret updates create a Worker version and may deploy it; configure and migrate the bound resources first. Never put secret values in `wrangler.jsonc`, a shell history command, CI output, screenshots, issues, or source control. SOPS is unnecessary for these Worker values because no encrypted secret file needs to live in the repository; introducing it would also require protecting and rotating a separate decryption key.

## 4. First production deployment

Review every production binding in `wrangler.jsonc`, then build and inspect a local upload bundle before the real deployment:

```bash
pnpm build:production
pnpm exec wrangler deploy --env production --dry-run --outdir .wrangler/deploy-preview/production
pnpm deploy:production
```

Wrangler prints the deployed `workers.dev` URL. If that was the selected production route, it must exactly match `APP_ORIGIN`; stop and correct the configuration if it does not. If you selected a custom domain, attach that domain to this Worker in Cloudflare and wait for DNS/TLS readiness. Do not replace the planned `APP_ORIGIN` with a version-preview URL or an unintended `workers.dev` URL.

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

Choose a separate demo origin before deployment. With the same account subdomain, the default is predictable from the configured demo Worker name:

```text
https://business-records-demo.<your-account-subdomain>.workers.dev
```

Alternatively, decide a dedicated demo custom domain. Then create separate resources and place only fictional data in them:

```bash
pnpm exec wrangler d1 create business-records-demo
pnpm exec wrangler r2 bucket create business-records-demo-documents
```

Replace only the demo D1 placeholder and demo `APP_ORIGIN` in `wrangler.jsonc`. The origin must be the exact URL chosen above, without a path or trailing slash. Keep the demo email, local-auth, bootstrap, and Turnstile settings disabled. Then:

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
