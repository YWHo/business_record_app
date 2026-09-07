# ADR 004: Passwordless invitation authentication

## Status

Accepted

## Context

The application is private and invitation-only, needs a safe first-owner bootstrap, and must work locally without a Cloudflare account or real email delivery. Maintaining passwords would add credential storage, reset, and breach-handling responsibilities that are unnecessary for this small access model.

## Decision

Use emailed passwordless links for normal authentication. Login tokens expire after 15 minutes, invitation tokens after 72 hours, and both are single-use with only SHA-256 hashes stored in D1. Successful login creates an eight-hour HTTP-only, same-site session cookie.

The configured initial owner is created through a secret-authorized, idempotent bootstrap endpoint. Bootstrap never creates a session and refuses a different owner once ownership exists. Additional users enter only through owner-created accountant invitations. Disabling an accountant retains its identity and revokes all sessions.

Production login requires server-side Turnstile verification and Cloudflare rate limiting. An HTTPS relay delivers provider-neutral email payloads. Local development writes action URLs to protected D1 outboxes and retains the independently guarded loopback login helper.

## Consequences

- The application stores no password hashes and exposes no password reset or public signup surface.
- Access depends on the security and availability of the user's email account and the configured relay.
- Login and invitation tokens must never be logged or returned by deployed endpoints.
- Operators must configure Turnstile, email delivery, production origin, bootstrap identity, and secrets before deployment.
- Ownership transfer remains a separate explicit recovery/administration concern.
