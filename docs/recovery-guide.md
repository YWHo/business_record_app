# Backup and recovery guide

Recovery has three separate layers. They are complementary, not interchangeable:

1. **Application exports** contain portable CSV data, manifests, summaries, and attachment bytes for long-term owner-controlled custody.
2. **D1 Time Travel** can overwrite the relational database to a recent point in time. Its retention depends on the Cloudflare plan.
3. **Worker redeployment** restores application code and static assets. It does not restore D1 or R2.

R2 does not roll back when D1 is restored. Keep verified exports outside the Cloudflare account so one provider/account incident does not remove every recovery source.

## Backup procedure

From **Exports**, the owner selects **All retained records** and waits for the download to finish. An interrupted stream is not recorded as a successful export. Store the ZIP without modifying it, preferably in two encrypted owner-controlled locations with one off-account.

Record:

- UTC generation and download time;
- export scope and application schema version from `manifest.json`;
- record and attachment counts;
- manifest digest from export history;
- whole-archive SHA-256 digest computed by the storage operator;
- storage locations, retention, and the person who verified it.

Open a copy of the archive and confirm `manifest.json`, the CSV collection, `attachment-index.csv`, `summary/summary.html`, and representative attachments exist. Recompute the hashes listed by the manifest and compare counts. A digest mismatch, missing path, duplicate path, or count mismatch makes that copy untrusted.

The application does not store the downloaded ZIP in Cloudflare and currently has no archive-import UI. Do not claim a recovery test restored data unless a schema-compatible importer and full reconciliation were actually completed.

Before a release or destructive database operation, also capture D1 state:

```bash
pnpm exec wrangler d1 info business-records-production
pnpm exec wrangler d1 time-travel info business-records-production --env production
```

Save the bookmark and timestamp in the release record. D1 Time Travel is automatically available for supported production-storage databases, but its restore window is finite; consult the current plan before relying on it.

## Choose the recovery path

| Incident                                   | Preferred first action                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| Bad Worker release, data intact            | Redeploy the last known-good commit                                              |
| Recent accidental D1 mutation or migration | D1 Time Travel after preserving the current bookmark                             |
| Missing R2 object                          | Recover the bytes from a verified application export; do not invent content      |
| Lost Cloudflare account/resources          | Reprovision from source, then perform a controlled archive import/reconciliation |
| Compromised secret                         | Revoke/rotate it, revoke sessions if relevant, then verify affected flows        |
| Demo corruption                            | Run the guarded demo reset; never point it at production                         |

## Code rollback

Identify the last known-good commit and its configuration. Build and dry-run it, then deploy only the affected environment. Do not run older migrations backward and do not assume older code is compatible with a newer schema. If compatibility is uncertain, stop writes and prepare a forward fix.

After rollback, verify `/api/health`, login, role authorization, record reads, attachment download, and export. Review error and security signals during an observation window.

## Recent D1 recovery

D1 Time Travel is destructive and cancels in-flight queries. Before restoring:

1. Stop or minimise application writes and record the incident time in UTC.
2. Generate an export if the application can still do so safely.
3. Capture the current bookmark so the restore can be undone.
4. Identify a restore timestamp before the harmful operation and verify timezone conversion.
5. Review R2 changes in the same interval; D1 recovery will not recreate deleted objects or delete later objects.

Inspect the candidate, then restore interactively:

```bash
pnpm exec wrangler d1 time-travel info business-records-production --env production --timestamp '<RFC3339-UTC>'
pnpm exec wrangler d1 time-travel restore business-records-production --env production --timestamp '<RFC3339-UTC>'
pnpm exec wrangler d1 execute business-records-production --env production --remote --file ./scripts/verify-schema.sql
```

Retain both the chosen and pre-restore bookmarks. Verify account membership, representative records, attachment metadata-to-object downloads, audit/export history, and current migration compatibility before reopening writes. If the result is wrong, use the pre-restore bookmark to undo it and reassess.

## R2 document recovery

First distinguish missing bytes from missing D1 metadata. The private object key is recorded in `attachment-index.csv` and uses the owning business-account prefix. Never expose the bucket publicly to recover a file.

If a verified export contains the exact attachment version, preserve its original bytes, SHA-256, MIME type, filename metadata, version IDs, dates, and rotation metadata. Restore through a reviewed, one-purpose operator script in an isolated environment; verify the byte hash before and after upload. Do not use the normal upload UI when exact IDs and historical attribution must be preserved.

If no trusted copy exists, record the loss. Do not substitute a different version while retaining the old hash or audit identity.

## Full rebuild from an application export

A full archive importer is intentionally not included. Before rebuilding production, implement or review a schema-version-specific importer that:

1. rejects unknown `schemaVersion` values;
2. verifies every manifest hash, archive path, duplicate, and record/attachment count;
3. creates an empty quarantined D1/R2 environment;
4. restores reference and identity data before dependent records;
5. preserves stable IDs, account scope, timestamps, review attribution, retention dates, comments, and audit history;
6. uploads attachment bytes to private account-prefixed R2 keys and recreates metadata only after hash verification;
7. runs schema, foreign-key, count, hash, authorization, and representative UI checks;
8. produces a signed reconciliation report before any DNS or binding cutover.

Never import an archive directly into live production first. Keep the original archive immutable, retain the failed environment for investigation, and make cutover reversible until reconciliation is approved.

## Demo recovery

The demo is disposable and synthetic:

```bash
pnpm db:reset:demo
pnpm db:verify:demo
pnpm deploy:demo
```

The reset requires the exact demo confirmation and explicit remote demo environment. Browser-local visitor overlays disappear when each visitor chooses **Reset demo data** or clears site storage; server reset cannot clear a visitor's IndexedDB. Remove only verified orphan demo objects. Never use demo cleanup logic, seed data, or resource bindings against production.

## Recovery sign-off

Record the incident timeline, source archive/bookmark and digests, commands and operators, restored environment IDs, schema/integrity results, data/attachment reconciliation, authentication and authorization checks, monitoring outcome, unresolved loss, and the approval/cutover time. Rotate any secrets exposed during recovery.
