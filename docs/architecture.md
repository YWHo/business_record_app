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

| Environment | D1                                            | R2                              | Authentication                                    |
| ----------- | --------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| Local       | Miniflare, persisted under `.wrangler/state/` | Miniflare, same state root      | Email outbox plus loopback-only seeded helper     |
| Demo        | Dedicated synthetic-data database             | Dedicated synthetic-data bucket | Synthetic identities only; local helper disabled  |
| Production  | Dedicated private database                    | Dedicated private bucket        | Email links, Turnstile, and local helper disabled |

Bindings are deliberately non-inheritable in `wrangler.jsonc`, so every named environment declares its own resources and variables. Remote resource IDs remain placeholders until an operator creates each environment.

## Identity and authorization

The Worker owns every identity and role decision. Passwordless sign-in and invitation URLs contain random single-use tokens; D1 stores only their SHA-256 hashes. Authentication challenges expire after 15 minutes, invitations after 72 hours, and sessions after 8 hours. Session cookies are HTTP-only and same-site strict, with the secure flag on HTTPS.

Production login is rejected through a route-specific Cloudflare rate limiter before database work and requires server-side Turnstile verification. A separate limiter protects invitation and bootstrap routes. The email service posts a minimal provider-neutral payload to a configured HTTPS relay; local requests are written to D1 outboxes instead.

Owner bootstrap requires the configured email and an administrative secret. It creates no session, is idempotent only for the same owner, and refuses silent ownership transfer. Further accounts originate only from owner-created accountant invitations. Disabling an accountant retains its database identity and audit references while deleting every active session.

The local login helper selects only configured seeded identities and requires both `APP_ENV=local` and a loopback request hostname. It never bypasses normal route authorization.

## Reference data lifecycle

Business activities and vehicles are database-backed reference records exposed through authenticated Worker routes. Both roles may read active and inactive records because historical financial and mileage views need their labels. Every mutation is owner-only and validated again at the Worker boundary.

There is no hard-delete operation. Deactivation retains the stable ID and records an end or retirement date; reactivation clears that date. Names and registrations remain case-insensitively unique, and every successful create, edit, activation, or deactivation produces an audit entry.

## Work-session calculations

The browser collects human-friendly local date/time and decimal currency input, but converts time to a timezone-qualified ISO instant before submission. The Worker validates role, references, calendar values, order, odometers, notes, currency, and amounts. New sessions may select only active activities and vehicles; an existing historical session may retain its now-inactive references.

D1 is the authority for `distance_km`, using its generated-column expression `odometer_end_km - odometer_start_km`. Revenue is converted to integer minor units before storage. The Worker derives duration, revenue/hour, and revenue/km from persisted source values for each response and builds list aggregates without storing denormalized rates. Aggregate rate fields remain null when revenue coverage is incomplete or currencies differ.

Work-session writes receive retention dates from the configured tax-year policy using the New Zealand business date (`Pacific/Auckland`) and activity-linked audit records. Owner-only mutations and accountant read access are enforced by the same backend authorization boundary as other records.

## Fuel evidence and calculations

Fuel data uses the shared `expenses` row for financial and retention fields and `fuel_expense_details` for vehicle and pump measurements. Receipt and GST totals are integer minor units; pump price is integer millionths per litre. The Worker—not the browser—validates both records and writes them as one D1 batch. Fuel price and litres are optional, but incomplete detail and a material price-times-litres mismatch return structured confirmation warnings before any write. A retry must name every current warning code to save deliberately.

The full-tank workflow updates the existing work session rather than copying fuel data into it. Linked records must be live fuel expenses for the session vehicle, and start/end links cannot be the same record. The starting receipt is optional. Analytics use generated session distance plus the linked ending full fill's litres and receipt cost. The response labels those analytics `EXACT` only when tank-full-at-start, no-personal-driving, and tank-full-at-end are all explicitly true; usable ending evidence with any false confirmation is `ESTIMATE`, never exact.
