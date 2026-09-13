# ADR 013: Platform-administered workspace control transfer

Status: Accepted as a future constraint

## Context

A compromised current administrator must not be able to irreversibly hand a workspace to another user through an ordinary self-service action. Legitimate control changes may nevertheless be required after a sale, insolvency event, authority change, or loss of access.

## Decision

Version 1 provides no ownership-transfer endpoint or interface. A future commercial product must use a platform-administered, reviewed workflow with durable request reason, source and target users, reviewer, status, timestamps, evidence handling, notifications, delay/reversal safeguards where appropriate, and an audit trail. Legal authority verification is a separate concern from changing the workspace's active `OWNER` membership.

## Consequences

Changing `BOOTSTRAP_OWNER_EMAIL` cannot transfer control, and an existing owner cannot perform an instant self-service transfer. Recovery currently remains an explicit operator procedure; a later transfer table/workflow can be added without changing tenant ownership of business records.
