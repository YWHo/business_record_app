# Staging configuration and guarded provisioning

Configuration and Phase 4 password authentication are implemented and locally
validated; no remote resources have been created, repurposed, reset or deployed.
See [staging authentication](staging-authentication.md) for credential setup,
rotation, session revocation and the required paid Workers plan review.

## Binding review

The checked-in `wrangler.jsonc` currently describes:

| Environment | Worker                     | D1                                              | Documents                                |
| ----------- | -------------------------- | ----------------------------------------------- | ---------------------------------------- |
| Local       | `business-records-local`   | `business-records-local`                        | Local simulated bucket                   |
| Legacy demo | `business-records-demo`    | Existing `business-records-demo` ID             | No R2 binding                            |
| Staging     | `business-records-staging` | New `business-records-staging`, unconfigured ID | New `business-records-staging-documents` |
| Production  | `business-records`         | Existing `business-records-production` ID       | `business-records-production-documents`  |

This review is of repository configuration, not a live Cloudflare inventory.
Legacy demo and production IDs/bindings are unchanged. Staging intentionally has
the placeholder `00000000-0000-4000-8000-000000000000`; apply operations refuse it.
It has a distinct HTTPS origin and rate-limit namespaces 4001–4004. No existing
database is automatically adopted. Review actual resources before conversion;
remote creation, deployment and legacy retirement remain explicit later actions.

`.env.staging` contains only `CLOUDFLARE_ENV=staging`. `pnpm build:staging` builds
that target; simulated staging state uses `.wrangler/state/staging`. Local and
e2e state paths retain their existing settings. A build does not provision D1/R2.

## Runtime protections

`APP_ENV=staging` follows deployed origin, session, membership, scope and expiry
checks. Turnstile is mandatory even if `TURNSTILE_REQUIRED` is accidentally false.
The loopback helper rejects staging even on localhost with its enable flag set.
Owner bootstrap rejects staging, including accidentally copied production
bootstrap secrets. Staging memberships originate in administration, not public
login payloads. Production bootstrap and passwordless invitation flows remain.

The widget site key is unconfigured. Backend secrets `TURNSTILE_SECRET_KEY` and
`STAGING_AUTH_CREDENTIALS` are required. Staging uses password sign-in and rejects
passwordless email login/verification. Complete credential installation and
guarded identity sync, then Phase 5 deployment checks, before treating staging
as usable sign-in.
Public `/demo` remains the same static, browser-only experience on every target.

## Planning and applying

These commands only print plans by default; they never call Wrangler:

```sh
pnpm staging:plan
pnpm staging:provision
pnpm staging:reset
pnpm staging:sync
```

After separately creating disposable resources and configuring the new staging
D1 ID, an operator can explicitly authorize an apply:

```sh
pnpm staging:provision --apply --confirm business-records-staging --database-id STAGING_D1_UUID
pnpm staging:reset --apply --confirm business-records-staging --database-id STAGING_D1_UUID
```

These are remote D1 mutations. They require existing Wrangler authentication and
the exact configured UUID as well as the staging confirmation. The tool rejects
shared database IDs/names, buckets, origins, Worker names, preview aliases and
limiter namespaces across local, legacy demo and production. It pins Wrangler
to this repository's configuration, checks the remote database name and UUID
before migrations, and uses only `DB --env staging` with `--remote` for writes.
It creates no resources, deletes no buckets and performs no deployment.

Provision applies additive migrations, then seeds only an empty, unrecognized
database. An existing recognized fixture is left intact, including disabled
memberships, removed scopes, expired Auditor access and browser-independent
server edits. Unexpected fixture markers fail closed. An intentional reset
requires the recognized staging marker and replaces the disposable D1 fixture,
including revoking sessions and intentionally renewing seeded Auditor access.

The fixture reuses repository-owned synthetic financial examples and creates
three placeholder users (`staging-owner`, `staging-accountant`, `staging-auditor`)
with `example.invalid` emails. Owner/Accountant receive account scopes. Auditor
receives only the contracting business, records dated 2026-04-01 through
2027-03-31, and a 30-day membership expiry. There are no login tokens, sessions,
passwords, verifiers, email deliveries or seeded R2 objects. The separate guarded
sync command binds secret-configured identities without implicit renewal.

Reset refuses existing attachment metadata rather than deleting references and
orphaning evidence. R2 is always untouched. Review and clean disposable evidence
separately before reset; this tool does not claim to empty a bucket or remove
pre-existing orphan objects. The empty-database/reset-marker and no-attachment
preconditions are also embedded in the seed query batch to catch intervening
writes. Failed commands stop without automatic retry.

The SQL query path uses `--command` rather than D1's asynchronous file importer.
A guarded Node preload carries the large query over stdin so it also works on
native Windows without exceeding its command-line limit. No shell evaluates SQL.
Wrangler errors are summarized without dumping SQL, credentials or environment.

## Validation

Unit tests exercise plan-only defaults, explicit confirmation, cross-environment
aliases, actual remote identity mismatch, failure handling and repeat provisioning.
In-memory SQLite tests apply all migrations, verify the synthetic memberships,
scope/expiry and foreign keys, and exercise reset/provision preconditions.
A child-process test verifies that the full query arrives intact via stdin.
Runtime tests cover deployed challenge enforcement, local-helper/bootstrap
denial and anonymous private APIs. Browser switching tests run the same public
demo/private isolation scenario with both production and staging configurations.
