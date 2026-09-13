# ADR 011: Business-account tenancy

Status: Accepted

## Context

The private version has one owner and one invited accountant, but binding every record directly to a global user would require a fundamental redesign before a future multi-workspace product. Record IDs alone are not an authorization boundary.

## Decision

Use `business_accounts` as the top-level workspace and `business_account_members` as the authoritative role/status relationship. Sessions select one active membership. Every persistent business row, typed detail, policy, attachment, comment, audit event, filter, and export-history row carries `business_account_id`; Worker reads, mutations, aggregates, and record lookups bind the session account again. Human reference identifiers are unique per account. R2 keys are generated beneath `business-accounts/<business-account-id>/`.

Migration 0006 backfills the existing installation into a stable primary account. Version 1 exposes no account switcher or public account creation.

## Consequences

Cross-account IDs return no record, membership disablement revokes only that account's sessions, and one user may later hold memberships in multiple workspaces. Future signup and plans can be added without moving financial data to a new ownership model.
