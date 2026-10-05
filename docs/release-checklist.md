# Migration and deployment checklist

Use this checklist for a reviewed release. The detailed commands and first-time
resource setup remain in the [deployment guide](deployment-guide.md).

## Before deployment

- Confirm the intended commit is clean and reviewed.
- Confirm the target Cloudflare account, Worker, D1 database, R2 bucket, origin,
  and environment are distinct from demo resources.
- Export and store an application backup; record the D1 Time Travel bookmark and
  current Worker version.
- Run `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm test:migrations`,
  `pnpm test:local-data`, `pnpm test:demo-data`, `pnpm security:audit`,
  `pnpm build:production`, `pnpm build:demo`, and `pnpm storybook:build`.
- Run `pnpm test:e2e`; it resets only `.wrangler/state/e2e/`, never normal
  development state or remote resources.
- Review every unapplied migration. Never edit one that has been applied.

## Deploy one environment at a time

- Classify the release as code-only, configuration/secret-only, schema plus
  code, demo-data-only, or a combined demo release. Follow the matching
  subsequent-release runbook in the deployment guide; do not reset D1 for a
  code-only release.
- For a schema release, apply D1 migrations with the explicit environment and
  `--remote`. Require a clean quick/foreign-key check before deploying
  compatible code.
- Dry-run the Worker bundle and verify its binding table.
- Deploy the reviewed build. Production must retain required secret bindings;
  demo must have no R2 or privileged secret dependency.
- Confirm the deployed origin exactly matches `APP_ORIGIN`.

For demo-data-only changes, run `pnpm test:demo-data`, `pnpm db:seed:demo`, and
`pnpm db:verify:demo`; do not deploy an unchanged Worker. For a combined demo
schema/code release without seed changes, validate and dry-run first, then run
`pnpm db:migrate:demo`, verify D1, and deploy the compatible Worker. For a
combined demo schema/code/data release, use `pnpm db:reset:demo` instead of the
migration-only command, verify D1, and immediately deploy. Never seed or reset
production.

## Verify and observe

- Check `/api/health`, HTTPS/security headers, PWA assets, authentication, role
  authorization, and one business-scoped read.
- In production, verify email delivery, one small record and attachment round
  trip, and an all-records export. In demo, verify browser-local changes,
  cross-browser isolation, reset, and server-side write rejection.
- After a demo reseed, allow up to ten minutes for edge-cached GET responses to
  expire. Reload or reopen an installed PWA, then use **Reset Demo Data** to
  clear that browser's IndexedDB overlay; this button does not reset remote D1.
- Observe Worker errors, D1 latency/errors, R2 activity, rate-limit responses,
  and email delivery before declaring the release complete.
- Record deployment/version IDs, migration and integrity results, UTC time,
  operator, backup location/digest, checks, and any rollback decision.

If any gate fails, stop further deployment. A Worker rollback does not reverse
D1 migrations or R2 changes; follow the [recovery guide](recovery-guide.md).
