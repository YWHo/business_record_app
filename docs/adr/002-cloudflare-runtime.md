# ADR 002: Integrated Cloudflare Worker runtime

Status: Accepted

## Context

The SPA needs a real server-side trust boundary while local development must require no Cloudflare account or remote resources.

## Decision

Use the official Cloudflare Vite plugin with one Worker entry point. Route `/api/*` through the Worker before static assets, serve unmatched navigation as the SPA, and bind D1/R2 through `wrangler.jsonc`. Wrangler CLI migration and seed commands use `--local --persist-to .wrangler/state` so they share state with Vite's Miniflare runtime.

Local, demo, and production declare separate bindings. Development authentication additionally requires a loopback hostname.

## Consequences

Client and server can be developed with one command while backend code executes in the Workers runtime. Local data persists predictably and cannot reach remote bindings by default. Operators must replace committed demo/production resource placeholders before deployment.
