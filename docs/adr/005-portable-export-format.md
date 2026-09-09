# ADR 005: Versioned portable ZIP exports

Status: Accepted

## Context

Business records and source evidence must remain readable outside this application, be downloadable repeatedly, and support a future disaster-recovery importer. Export collections may contain many 25 MB attachments, so buffering a complete archive is unsafe in a Worker.

## Decision

Use an uncompressed ZIP containing UTF-8 CSV data, every selected immutable attachment version, a standalone HTML summary, and a JSON manifest. `manifest.json` identifies `business-records-portable-export`, carries `schemaVersion: 1`, documents units and scope, records expected/exported counts, and lists the byte size and SHA-256 digest of every other file. D1 retains the manifest digest and completion metadata.

Generate fixed relational projections rather than database dumps. Paths contain stable record/version identifiers plus sanitized original filenames. Stream stored ZIP entries sequentially so only one attachment body is loaded at once. Preflight R2 metadata and counts before marking generation successful. Never delete or change source records during export.

## Consequences

Archives are larger than compressed ZIPs but simple, streamable, and readable with ordinary tools. The manifest cannot contain its own digest; its digest lives in export history. A later importer must select by schema version, verify all hashes and counts, restore reference data before dependent records, recreate R2 objects from the attachment index, and complete reconciliation in an isolated environment before cutover.
