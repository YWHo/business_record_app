# Architecture

## Runtime boundary

```text
Browser (untrusted)
  ├─ React SPA: rendering and usability validation
  └─ /api requests
       └─ Cloudflare Worker (authoritative boundary)
            ├─ authorization and validation
            ├─ D1 binding: relational records
            └─ private R2 binding: source documents
```

The Vite plugin runs this topology locally in the Workers runtime and builds the same topology for deployment. Browser bundles never include files under `worker/`, binding credentials, D1 access, or R2 access.

## Environments

| Environment | D1                                            | R2                              | Local auth helper        |
| ----------- | --------------------------------------------- | ------------------------------- | ------------------------ |
| Local       | Miniflare, persisted under `.wrangler/state/` | Miniflare, same state root      | Enabled only on loopback |
| Demo        | Dedicated synthetic-data database             | Dedicated synthetic-data bucket | Disabled                 |
| Production  | Dedicated private database                    | Dedicated private bucket        | Disabled                 |

Bindings are deliberately non-inheritable in `wrangler.jsonc`, so every named environment declares its own resources and variables. Remote resource IDs remain placeholders until an operator creates each environment.

## Phase 2 identity foundation

The foundation migration establishes users, hashed-token sessions, hashed single-use invitations, and a local outbox. The local login helper selects only configured seeded identities; it does not bypass route authorization. Production authentication and owner bootstrap are deferred to Phase 4.
