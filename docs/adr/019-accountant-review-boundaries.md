# ADR 019: Accountant review boundaries

## Status

Accepted

## Context

The Auditor role must not turn the existing Accountant into a read-only role.
The routed business expense detail lacked the attributed insurance adjustment
available in the legacy insurance workspace. Income reconciliation rendered an
editor without a permission check. Some historical showcase insurance records
also lacked an allocation row, making their first adjustment fail.

## Decision

Display Accountant review access separately from Auditor read-only access. Keep
comments, reviewer status transitions, income reconciliation, insurance business
allocation adjustments, evidence downloads and CSV summaries. Source edits,
uploads, account administration and full archives stay owner-only. Preserve the
existing accountant-only insurance adjustment restriction through a shared
domain permission helper; Owner ACCOUNTING_ADJUST does not enable that route.

Show insurance allocation method, business amount, calculation dates, notes and
reviewer alongside the separate full premium. Reuse the adjustment form in both
legacy and routed workspaces. Reconciliation editors use ACCOUNTING_ADJUST;
Auditors retain only the stored reconciliation display. Both forms preserve
failed drafts, show focused errors and guard unsaved navigation.

An accountant's explicit first adjustment may create a missing allocation row.
Do not backfill or rewrite source financial records. Reuse the CHECK-backed D1
batch guard from migration 0010 to recheck active actor/window, unrestricted
account grant, live source premium/update timestamp and allocation contents.
Reject conflicting or duplicate allocation state. Insert/update the allocation
and its before/after financial audit evidence in one batch, retaining business,
entity and actor attribution. A failed audit insert rolls the operation back.

Accountant reports offer CSV summaries and retain their permitted archive-history
reads, clearly labelled as owner-generated metadata. CSV downloads do not create
an archive-history entry. The dedicated full-archive export denial is unchanged.
Public-demo mutations stay browser-local and deployed demo writes remain denied.
No general tax/classification editor or new role bundle is introduced.

## Verification

SQLite HTTP tests cover first initialization, source premium preservation,
reviewer display, amount limits, owner/auditor denial, stale snapshots and audit
failure rollback. Browser coverage compares Accountant and Auditor access to the
same financial records and exercises real private evidence and CSV downloads.
An asynchronous search regression test ensures older initial responses cannot
replace a newer reviewer search result.
