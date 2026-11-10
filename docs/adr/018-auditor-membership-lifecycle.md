# ADR 018: Atomic auditor invitation and membership lifecycle

## Status

Accepted

## Decision

Owners manage fixed Auditor grants with one to sixteen account-bound scopes,
an optional start, and a required future expiry. Invitation links expire after
the earlier of 72 hours or access expiry. Acceptance copies the invited windows
and scopes without creating a session. Normal passwordless sign-in rechecks the
current membership and scope; scheduled memberships can accept early but cannot
sign in before their start. Production retains Turnstile, rate limits, and relay
delivery. Local action URLs remain in owner-only loopback outboxes.

Every accepted invitation, grant edit, revocation, and explicit expiry writes its
audit evidence in the same D1 batch as the change. Migration 0010 adds optimistic
revisions and a transient guard table whose named CHECK constraint rejects a
failed precondition. A failed batch rolls back the guard and every subsequent
write. A successful batch removes its guard. Conditions recheck owner status,
account identity, target role/revision, and token eligibility within that batch.
This avoids scope replacement or partial identity creation after a stale read.

Acceptance never overwrites any existing account membership or enables a disabled
global identity. This applies to legacy accountant invitations too. Pending
Auditor invites can be revoked; failed delivery revokes the unaccepted token
rather than deleting a row referenced by retained scopes. Tokens remain hashed
and single-use; neither acceptance nor bootstrap creates a session.

Grant edits, expiry and revocation delete existing account sessions. Authorization
also reloads current state on each request. Ending access changes membership
status without deleting identities, grants, comments, or audit references. An
explicit expiry preserves the configured window, including a future start, so it
cannot violate window constraints. Ordinary edits preserve status; restoring
ended access requires explicit owner intent and a globally active identity.

## Consequences

Account settings exposes focused invitation/edit pages and a bounded owner
overview. Each scope's dates narrow that grant; multiple grants are additive.
The owner sees effective status separately from configured expiry. A stale form
receives a conflict and must reload. Public demo administration remains disabled.
Dedicated Auditor navigation and demo personas remain separate phases.

Native SQLite tests cover rollback and concurrent acceptance, and Playwright
checks real local D1 transactions, browser forms and passwordless sign-in.
