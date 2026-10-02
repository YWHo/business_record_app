# Migration and deployment checklist

Use this checklist for a reviewed release. The detailed commands and first-time
resource setup remain in the [deployment guide](deployment-guide.md).

## Before deployment

- Confirm the intended commit is clean and reviewed.
- Confirm the target Cloudflare account, Worker, D1 database, R2 bucket, origin,
  and environment are distinct from demo resources.
- Export and store an application backup; record the D1 Time Travel bookmark
  and current Worker version.
- Run `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm test:migrations`,
  `pnpm security:audit`, `pnpm build:production`, `pnpm build:demo`, and
  `pnpm storybook:build`.
- Run `pnpm test:e2e` only in an isolated checkout; it resets local Wrangler
  state, never remote resources.
- Review every unapplied migration. Never edit one that has been applied.

## Deploy one environment at a time

- Apply D1 migrations with the explicit environment and `--remote`.
- Run the matching schema verification and require a clean quick/foreign-key
  check before deploying code.
- Dry-run the Worker bundle and verify its binding table.
- Deploy the reviewed build. Production must retain required secret bindings;
  demo must have no R2 or privileged secret dependency.
- Confirm the deployed origin exactly matches `APP_ORIGIN`.

## Verify and observe

- Check `/api/health`, HTTPS/security headers, PWA assets, authentication, role
  authorization, and one business-scoped read.
- In production, verify email delivery, one small record and attachment round
  trip, and an all-records export. In demo, verify browser-local changes,
  cross-browser isolation, reset, and server-side write rejection.
- Observe Worker errors, D1 latency/errors, R2 activity, rate-limit responses,
  and email delivery before declaring the release complete.
- Record deployment/version IDs, migration and integrity results, UTC time,
  operator, backup location/digest, checks, and any rollback decision.

If any gate fails, stop further deployment. A Worker rollback does not reverse
D1 migrations or R2 changes; follow the [recovery guide](recovery-guide.md).
