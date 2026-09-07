# Project instructions

## Overview

Business Records is a private, invitation-only, source-visible portfolio application for organising New Zealand-oriented business income, expenses, mileage, and supporting evidence. It is not a tax-calculation engine.

## Engineering rules

- Use pnpm only. Do not use npm or Yarn.
- Keep the client as a React + TypeScript + Vite SPA.
- Put authoritative logic in the Cloudflare Worker backend. Never trust client-side authorization or validation alone.
- Use Cloudflare D1 for relational data and private R2 bindings for files. Fully local development must work through simulated resources without a Cloudflare account.
- Keep local, demo, and production resources strictly separate. Never commit secrets, real identities, or real financial records.
- Use strict TypeScript, ESLint, Prettier, Vitest, React Testing Library, Playwright, and Storybook.
- Add behavioural tests with each feature. Add meaningful Storybook stories for reusable UI components.
- Complete substantial work in the documented phases. Test, update `docs/implementation-progress.md`, commit the completed phase, and confirm a clean tree before starting another phase.
- This repository is source-visible, not open source. Do not add an open-source licence.
- Store money as integer minor units with an uppercase three-letter currency. Never store authoritative monetary values as floating point.
- Use explicit metric column names such as `_km` and `_litres`. Work-session distance must remain derived from odometers.
- Never rewrite an applied migration. Add the next ordered migration and keep restrictive historical-record foreign keys.
- Validate polymorphic attachment/comment targets in the Worker because D1 cannot apply one foreign key across multiple record tables.

## Important paths

- `src/`: React application
- `worker/`: Cloudflare Worker API
- `migrations/`: ordered D1 migrations
- `scripts/`: local seed and reset utilities
- `docs/`: architecture decisions and implementation progress
- `e2e/`: Playwright workflows (when introduced)

## Core commands

- `pnpm dev`: local development
- `pnpm build`: type-check and production build
- `pnpm lint`: static analysis
- `pnpm typecheck`: TypeScript project checks
- `pnpm test`: unit and component tests
- `pnpm test:watch`: interactive tests
- `pnpm format`: format source files
- `pnpm db:migrate:local`: apply migrations to simulated D1
- `pnpm db:seed:local`: seed deterministic local identities and metadata
- `pnpm db:reset:local`: safely recreate local D1 and R2 state
- `pnpm db:inspect:local`: inspect local metadata
- `pnpm db:verify:local`: run local D1 integrity and foreign-key checks

Local state lives only in `.wrangler/state/`. Local authentication helpers must retain both the `APP_ENV=local` and loopback-host safeguards. Never weaken these guards for tests. Environment, deployment, retention, export, backup, and recovery commands must remain documented as their implementation phases land.
