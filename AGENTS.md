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

## Important paths

- `src/`: React application
- `worker/`: Cloudflare Worker API (from Phase 2)
- `migrations/`: D1 migrations (from Phase 2)
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

Environment, D1/R2, authentication, seed, reset, deployment, invitation, retention, export, backup, and recovery commands will be documented as their implementation phases land.
