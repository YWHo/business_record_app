# ADR 020: Browser-local Demo Auditor

Status: accepted

## Context

The public demo has fictional account-wide reads through a fixed server principal
and browser-local Owner/Accountant editing. Private auditors already have scoped,
expiring server-enforced grants. Visitors need a way to inspect their read-only UI
without creating a private membership or changing shared demo infrastructure.

## Decision

Add Demo Auditor to the existing tab-local role chooser. Reuse private auditor
navigation, action hiding, form redirects, report summaries and audit views.
Describe the actual demo scope: all fictional businesses and dates, including
existing browser overlay changes, with no expiry. Do not invent an expiry or a
private grant. Focus/refresh must preserve the simulated persona without calling
private authentication endpoints or applying private membership-expiry checks.

Reject Auditor/missing/unknown role writes at the demo API adapter before overlay
recording, and prevent Auditor resets. Hide the reset control and use read-only
demo banner copy. Retain Owner/Accountant editing and preserve their local data
when signing out or switching roles. Allow demo identity selection only when the
loaded configuration explicitly enables the public demo.

Keep the Worker unchanged: no server-side demo login, role header, session,
membership, new seed identity or R2 binding. Shared writes remain forbidden before
limiter/storage work; download/export restrictions and bounded reads remain.

## Consequences

Visitors can compare all three personas without affecting shared data. The demo
cannot demonstrate a real scoped/expired membership; those remain covered by the
private auditor flows and tests. Shared demo evidence bytes remain unavailable
without R2; browser-local evidence keeps its existing behavior.

Browser checks do not secure the visitor's own device. A visitor can change their
simulated role or edit local storage, but obtains no private session or shared
write permission. Tests cover role restoration, focus/refresh, role transitions,
mutation/reset denial, private-mode refusal, responsive inspection and unchanged
server rejection of forged role claims.
