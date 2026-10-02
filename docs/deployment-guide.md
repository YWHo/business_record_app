# Deployment guide

This guide deploys two deliberately separate Cloudflare Workers:

- `business-records`, containing private live records;
- `business-records-demo`, containing fictional public demonstration data only.

Never reuse a D1 database, R2 bucket, hostname, secret, or real identity between them. Run all commands from the repository root. Commands containing `--remote` change Cloudflare resources.

## 1. Prerequisites and release gate

Use Node.js 22+, pnpm 10+, and a Cloudflare account. During the steps below you will choose the production hostname, create a Turnstile widget for that hostname, and configure an HTTPS email relay. The relay must accept `POST` JSON fields `from`, `to`, `subject`, and `text` with a bearer token.

### Authenticate Wrangler

For an interactive deployment from WSL, a container, SSH, or another environment where the browser cannot reliably reach the terminal's `localhost:8976` callback server, use the device flow. This is the recommended login method for WSL:

```bash
pnpm exec wrangler login --device
```

Wrangler prints a verification URL and a short-lived code. Open the URL in any browser, enter the code, approve access, and leave the terminal running until it reports `Successfully logged in`. The code normally expires after five minutes; rerun the command if it expires. This flow polls Cloudflare directly and does not require a browser-to-WSL localhost callback.

On a native desktop where the browser and terminal share localhost, the standard callback flow is also supported:

```bash
pnpm exec wrangler login
```

After either flow completes, verify the selected account:

```bash
pnpm exec wrangler whoami
```

If the standard browser flow shows authorization success while its terminal remains pending, press `Ctrl+C`. Browser approval alone does not confirm that Wrangler received and stored the credentials; the browser-to-WSL callback probably did not reach the temporary server. Run `whoami`, then use the device flow if Wrangler still reports that it is unauthenticated. To replace an incorrect or expired interactive login:

```bash
pnpm exec wrangler logout
pnpm exec wrangler login --device
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
pnpm test:migrations
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

For an initial `workers.dev` deployment, open the Cloudflare dashboard and go to **Workers & Pages**. Find **Your subdomain**; choose it there if the account does not have one yet. The production Worker name is fixed by `wrangler.jsonc` as `business-records`, so its predictable URL is:

```text
https://business-records.<your-account-subdomain>.workers.dev
```

For example, if **Your subdomain** is `acme-records`, set:

```json
"APP_ORIGIN": "https://business-records.acme-records.workers.dev"
```

Do not run a placeholder-configured production deployment merely to discover this URL. Do not use a version-preview URL, include a path, or add a trailing slash.

For a custom domain, decide the final hostname first, such as `records.example.nz`, and set `APP_ORIGIN` to `https://records.example.nz`. The Worker may be deployed before the dashboard mapping is attached, but authentication and state-changing verification must wait until the custom domain resolves to that Worker. Cloudflare recommends a route or custom domain rather than `workers.dev` for business-critical production use.

Create the production Turnstile widget for the chosen hostname. The widget's hostname field is only the host—for example, `business-records.acme-records.workers.dev` or `records.example.nz`—without `https://`, a port, or a path. Copy its public site key into production `TURNSTILE_SITE_KEY`; retain its secret key for the secret step below.

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

Generate a strong, unique bootstrap key in a password manager. For the first deployment, place the exact owner email, bootstrap key, Turnstile secret, and email relay bearer token in a local `.env.production.secrets` file:

```dotenv
BOOTSTRAP_OWNER_EMAIL="owner@example.com"
BOOTSTRAP_ADMIN_KEY="replace-with-a-strong-unique-key"
TURNSTILE_SECRET_KEY="replace-with-the-turnstile-secret"
EMAIL_DELIVERY_BEARER_TOKEN="replace-with-the-email-provider-token"
```

The repository's `.env.*` ignore rule covers this file. Verify that before entering real values, and restrict local access:

```bash
git check-ignore -v .env.production.secrets
chmod 600 .env.production.secrets
```

Do not use `.env.production` for these values because Vite automatically loads that conventional filename during production builds. Wrangler reads `.env.production.secrets` only when it is passed explicitly with `--secrets-file`. The file must contain all four required values before the first deployment.

`BOOTSTRAP_OWNER_EMAIL` is the only place to enter the initial owner's real email. During deployment, Wrangler uploads these values into Cloudflare's encrypted secret bindings; the Worker does not read the local file at runtime. Production ignores `DEV_OWNER_EMAIL`, and secret values are not returned by `wrangler secret list` after upload.

If the Worker already exists, rotate an individual value with `pnpm exec wrangler secret put <NAME> --env production`, or enter it through Cloudflare Dashboard → **Workers & Pages** → `business-records` → **Settings** → **Variables and Secrets**. Add each required name with type **Secret**, not plaintext variable. The four required names are:

- `BOOTSTRAP_OWNER_EMAIL`
- `BOOTSTRAP_ADMIN_KEY`
- `TURNSTILE_SECRET_KEY`
- `EMAIL_DELIVERY_BEARER_TOKEN`

The production environment declares these names as required, so a deployment fails rather than silently omitting one. Wrangler secret updates create a Worker version and may deploy it; configure and migrate the bound resources first. Never put secret values in `wrangler.jsonc`, a shell history command, CI output, screenshots, issues, or source control. Keep the local secrets file only on a trusted encrypted workstation, or remove it after confirming the values are also retained in a password manager. SOPS is unnecessary because no encrypted secret file needs to live in the repository; introducing it would also require protecting and rotating a separate decryption key.

## 4. First production deployment

Review every production binding in `wrangler.jsonc`, then build and inspect a local upload bundle before the real deployment:

```bash
pnpm build:production
pnpm exec wrangler deploy --env production --dry-run --outdir .wrangler/deploy-preview/production
pnpm exec wrangler deploy --env production --secrets-file .env.production.secrets
pnpm exec wrangler secret list --env production
```

The explicit `--secrets-file` command creates the initial Worker version with all required secrets. After that succeeds, later `pnpm deploy:production` runs preserve the uploaded secrets; use `wrangler secret put` or another secrets-file deployment only when rotating them.

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

## 5. First public demo deployment

Choose a separate demo origin before deployment. With the same account subdomain, the default is predictable from the configured demo Worker name:

```text
https://business-records-demo.<your-account-subdomain>.workers.dev
```

Alternatively, decide a dedicated demo custom domain. Then create separate resources and place only fictional data in them:

```bash
pnpm exec wrangler d1 create business-records-demo
```

Replace only the demo D1 placeholder and demo `APP_ORIGIN` in `wrangler.jsonc`. The origin must be the exact URL chosen above, without a path or trailing slash. The demo deliberately has no R2 binding: document downloads are unavailable, its seed contains no attachment metadata, and browser-only changes never reach server storage. Keep the demo email, local-auth, bootstrap, and Turnstile settings disabled. Then:

```bash
pnpm test:demo-data
pnpm build:demo
pnpm exec wrangler deploy --env demo --dry-run --outdir .wrangler/deploy-preview/demo
pnpm db:reset:demo
pnpm db:verify:demo
pnpm deploy:demo
```

Wrangler currently warns that the top-level local `DOCUMENTS` binding is not present in `env.demo`, even when demo declares the intentional empty `r2_buckets` list. This non-inheritance warning is expected. Do not add a demo bucket to silence it; confirm the dry-run binding table has no `DOCUMENTS` entry.

The reset requires typing `business-records-demo` because it destroys and reseeds remote demo rows. Successful demo JSON reads are cached at Cloudflare's edge for ten minutes without another D1 query, so a remote reset can take up to ten minutes to appear at an edge location. Verify both browser roles, browser-local edits and reset, cross-browser isolation, the 30-per-10-second burst and 120-per-minute sustained read limits, `Retry-After` responses, and rejection of every non-GET API request. Check that the demo D1 ID and hostname differ from production before publishing its URL.

The command block above provisions and initializes a new demo. Do not reuse it
unchanged for every later release; select the applicable code-only, data-only,
schema, or combined runbook below.

## 6. Subsequent releases

Do not repeat the first-deployment sequence blindly. Existing production data,
uploaded secrets, demo edge-cache entries, installed service workers, and
browser-local demo overlays survive a Worker deployment. First identify what
the reviewed commit changes, then use the smallest applicable runbook below.

| Reviewed change                          | Production action                                                          | Demo action                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Frontend or Worker code only             | Build, dry-run, deploy, and verify. Do not migrate or reset D1.            | Build, dry-run, deploy, and verify. Do not reset D1.                                        |
| Committed non-secret configuration       | Dry-run the bindings, deploy, and verify the affected integration.         | Dry-run the bindings, deploy, and verify.                                                   |
| Secret rotation only                     | Update only the named secret and verify; do not reseed or rerun bootstrap. | The demo must not acquire production secrets.                                               |
| New additive D1 migration plus code      | Back up, bookmark, migrate, verify D1, then deploy compatible code.        | Validate the bundle, migrate and verify without reseeding, then deploy compatible code.     |
| Demo synthetic data only                 | No production action.                                                      | Run the seed regression, reseed remote demo D1, and verify. A Worker deploy is unnecessary. |
| Demo code, migration, and synthetic data | No production action unless the same reviewed changes apply there.         | Validate first, then reset/verify D1 and immediately deploy the compatible Worker.          |

Always deploy one environment at a time from a clean checkout of the reviewed
commit. Never edit a migration that has been applied remotely. D1 migrations
must be forward-compatible with both the currently deployed Worker and the new
Worker because migration and deployment cannot be atomic. Prefer an
expand/migrate/contract sequence across releases: add compatible schema first,
deploy readers/writers that tolerate both forms, and remove obsolete schema
only in a later reviewed release. If that compatibility is impossible, use a
planned maintenance window or a separately provisioned replacement environment.

### Production: code or frontend only

Existing secrets and data remain in place. Do not pass the local secrets file
again unless the release intentionally rotates those values.

```bash
pnpm build:production
pnpm exec wrangler deploy --env production --dry-run --outdir .wrangler/deploy-preview/production
pnpm deploy:production
```

Check `/api/health`, authentication and authorization, one representative
business-scoped read, and the workflow changed by the release. An installed PWA
may keep the prior application shell until its service worker detects the new
assets and the user reloads or reopens the application.

### Production: schema and code

Before changing D1, export an application backup from **Exports**, store it
off-account, and record the current D1 Time Travel bookmark and Worker
deployment/version. Pass the complete release gate and inspect every pending
migration. Build and dry-run before the remote mutation so a packaging or
binding error is found while the existing deployment is still untouched.

```bash
pnpm build:production
pnpm exec wrangler deploy --env production --dry-run --outdir .wrangler/deploy-preview/production
pnpm exec wrangler d1 migrations list business-records-production --env production --remote
pnpm exec wrangler d1 migrations apply business-records-production --env production --remote
pnpm exec wrangler d1 execute business-records-production --env production --remote --file ./scripts/verify-schema.sql
pnpm deploy:production
```

Require `PRAGMA quick_check` to return `ok`, require the foreign-key check to
return no rows, then verify health, login, roles, one read/write round trip,
attachment download, and archive generation. Observe Worker and D1 errors before
declaring the release complete. Never run `db:reset:demo`, `seed-demo.sql`, or
any production reset/seed equivalent against production.

### Production: configuration or secret changes

For committed variables or bindings, inspect the dry-run binding table and
deploy normally. For a secret-only rotation, update the individual secret:

```bash
pnpm exec wrangler secret put <NAME> --env production
pnpm exec wrangler secret list --env production
```

Wrangler may create and deploy a Worker version when a secret changes. Verify
the affected integration immediately. Do not rerun owner bootstrap, replace
unrelated secrets, or reset D1. If code and secrets change together, deploy the
reviewed code and rotate the secrets as one controlled release, retaining the
old values until post-deployment verification succeeds where the provider
supports overlap.

### Demo: code or frontend only

Do not reset demo data merely because application code changed:

```bash
pnpm build:demo
pnpm exec wrangler deploy --env demo --dry-run --outdir .wrangler/deploy-preview/demo
pnpm deploy:demo
```

Verify `/api/health`, both simulated roles, a representative server read,
server-side rejection of writes, and the changed workflow. Reload or reopen an
installed demo PWA if it is still displaying the prior application shell.

### Demo: synthetic data only

The SQL seed is executed directly from the checked-out commit and is not part
of the deployed frontend bundle. Therefore a data-only change does not require
a Worker deployment. Validate it locally, replace the remote synthetic rows,
and verify the result:

```bash
pnpm test:demo-data
pnpm db:seed:demo
pnpm db:verify:demo
```

Use `db:seed:demo` only when no migration is pending. It destructively replaces
the fictional remote demo rows after confirmation but does not apply migrations.
If the seed depends on a new migration, use the combined runbook below.

The D1 replacement does not invalidate existing successful GET responses in
Cloudflare's demo edge cache. Those responses can remain visible for up to ten
minutes. It also does not clear an installed service worker or a visitor's
IndexedDB overlay. After the cache window, reload or reopen the PWA and use the
in-app **Reset Demo Data** action to clear only that browser's overlay. The
in-app action never resets remote D1.

### Demo: schema and code without synthetic-data changes

Do not destroy and reload the demo dataset merely because a migration is
pending. Validate the bundle first, apply only the pending migrations, verify
the existing dataset, and deploy compatible code:

```bash
pnpm build:demo
pnpm exec wrangler deploy --env demo --dry-run --outdir .wrangler/deploy-preview/demo
pnpm db:migrate:demo
pnpm db:verify:demo
pnpm deploy:demo
```

If migration or verification fails, do not deploy. The migration must remain
compatible with the previously deployed Worker during this interval. Use the
combined runbook only when the new schema and the revised synthetic seed need
to land together.

### Demo: schema, code, and synthetic data together

Validate the new seed and deployable bundle before changing the remote demo.
Then keep the reset and deployment close together to minimize the period in
which the previous Worker sees the new schema/data:

```bash
pnpm test:demo-data
pnpm build:demo
pnpm exec wrangler deploy --env demo --dry-run --outdir .wrangler/deploy-preview/demo
pnpm db:reset:demo
pnpm db:verify:demo
pnpm deploy:demo
```

`db:reset:demo` applies pending demo migrations and then destructively reloads
the fictional dataset. If reset or verification fails, do not deploy the new
Worker. If deployment fails after a successful reset, assess compatibility
before rolling back because a Worker rollback does not reverse D1 migrations.
After deployment, allow for the ten-minute edge-cache window, reload or reopen
the PWA, clear its browser-local overlay with **Reset Demo Data**, and verify
both demo roles again.

For any runbook, if verification fails, stop further deployment, preserve the
failure output, and follow the [recovery guide](recovery-guide.md). Rolling back
Worker code does not roll back D1 migrations, D1 data, R2 objects, secrets, or
third-party configuration.

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

Use the repository's [release checklist](release-checklist.md) as the concise
operator sequence and retain the completed copy with the release record.
