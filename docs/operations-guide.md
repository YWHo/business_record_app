# Operations guide

This is the routine checklist for the private production service and isolated public demo. It supplements the [deployment guide](deployment-guide.md) and [recovery guide](recovery-guide.md).

## Ownership and access

Keep at least two Cloudflare account administrators under organisational control with phishing-resistant MFA and separate identities. Use least-privilege API tokens for automation. Store domain, email-relay, Turnstile, Cloudflare, source-hosting, and backup-storage recovery information in an owner-controlled password manager.

The application `OWNER` role administers one workspace; it does not assert legal ownership of the business. There is no self-service ownership transfer. A lost-owner or disputed-control event requires an authenticated operator process and must not be handled by changing `BOOTSTRAP_OWNER_EMAIL` or directly assigning a role.

## Routine schedule

### Daily or after an alert

- Check Worker 5xx, 429, latency, and request-volume trends without logging bodies or credentials.
- Check email relay delivery/suppression failures and Turnstile errors.
- Investigate unexpected bootstrap, login, invitation, upload, export, disable-user, and purge failures using request IDs and audit history.
- Confirm the public demo contains only synthetic identities and remains read-only at the Worker boundary.

### Weekly

- Review D1 query/error and storage trends and R2 object/operation trends.
- Review demo quotas, throttling, unexpected traffic, and recent reset outcome.
- Confirm production D1 and R2 bindings still point to their dedicated resources and neither R2 bucket is public.
- Download a new all-records export if business activity warrants a shorter interval than the configured reminder.

### Monthly

- The owner downloads an **All retained records** export, verifies it opens, records its SHA-256 digest, and copies it to at least two owner-controlled locations, with one outside the Cloudflare account.
- Test a representative CSV, HTML summary, manifest entry, and attachment from the archive. Never alter the retained original.
- Review active users and invitations; disable access that is no longer required.
- Review Cloudflare account admins, API tokens, domain access, backup access, alerts, and service budgets.
- Run `pnpm security:audit` on the maintained branch and schedule supported dependency updates.

### Before destructive work or every release

- Generate and verify a fresh application export.
- Record the current D1 Time Travel bookmark and Worker version.
- Confirm the recovery operator can reach the off-account export and account recovery credentials.

## User and evidence lifecycle

- Invite accountants through **Users**; do not share owner links or sessions.
- Disabling a user revokes their sessions but preserves attribution and history.
- Prefer trash and restore over purge. Purge is irreversible for application records and R2 bytes after retention eligibility; verify dependencies, export first, and retain the audit event.
- Treat original attachments and older versions as evidence. Rotation changes display metadata only.
- Do not upload executable formats or use the application as general file sharing.

## Secret and configuration changes

Rotate the bootstrap key after initial setup and after any suspected exposure. Rotate the email bearer token, Turnstile secret, Cloudflare API tokens, and account credentials according to provider policy or immediately after exposure. Update Worker secrets interactively and verify authentication afterward.

Changing `APP_ORIGIN`, hostname, Turnstile hostname, sender domain, or relay URL is a coordinated release. Keep the exact HTTPS origins aligned, verify DNS/TLS, and test login delivery. Never disable origin checking, Turnstile, rate limiting, or private-bucket controls to work around an outage.

## Incident triage

1. Preserve UTC times, request IDs, Worker deployment/version, D1 bookmark, and relevant provider events.
2. Classify whether the incident affects code, relational data, documents, credentials, email, hostname/TLS, or only demo capacity.
3. Revoke exposed credentials and sessions; avoid destructive cleanup until evidence and backups are preserved.
4. Reduce access or take the affected route/service offline if continued writes could worsen loss.
5. Use the narrowest recovery path in the recovery guide and verify in isolation when possible.
6. Record cause, scope, decisions, validation, notifications, and preventive work without copying private record contents into tickets.

Quota exhaustion in the public demo may make it temporarily unavailable. Keep it on a bounded plan unless an owner deliberately approves a reviewed change; budget alerts notify but do not enforce an application cost ceiling.

## Service handover

An incoming operator should receive the repository and release history, architecture/ADRs, Cloudflare account and resource inventory, DNS ownership, Turnstile and relay ownership, secret-rotation procedure, last verified export and digest, monitoring/alert locations, and recent deployment and incident records. Transfer credentials through the password manager, not this repository or email.
