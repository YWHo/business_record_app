# Business Records

A private, invitation-only application for organising business income, expenses, mileage, and supporting documents. The product is designed for small New Zealand business workflows and deliberately avoids making tax-treatment decisions.

## Current status

Phase 1 provides the React, TypeScript, Vite, routing, test, lint, formatting, and installable PWA foundation. The Cloudflare Worker, local D1/R2 simulation, authentication, and business modules follow in later phases.

## Local setup

Requirements: Node.js 22 or later and pnpm 10 or later.

```bash
pnpm install
pnpm dev
```

The development server prints its local URL. No Cloudflare account is needed for the completed Phase 1 frontend.

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Architecture

The browser application is a mobile-first React SPA. A Cloudflare Worker will form the server-side trust boundary, with D1 for relational data and private R2 storage for attachments. Local, demo, and production environments will use separate data and object-storage resources.

See [implementation progress](docs/implementation-progress.md) for the phase history.

## PWA installation

Run a production build over HTTPS or use the supported local development environment. In a compatible browser, use its installation action to add Business Records as a standalone application. The initial service worker provides the offline application shell; offline record editing is not planned for version 1.

## Security and data

Do not place secrets, real identities, or real financial records in this repository. Production and public demo resources must remain completely separate.

## Source-visible notice

Copyright © 2026.

This source code is made publicly available for viewing and portfolio evaluation purposes only. No licence is granted to copy, modify, redistribute, sublicense, or commercially use this software.
