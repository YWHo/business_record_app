# ADR 003: Normalized D1 relational schema

Status: Accepted

## Context

Business records must remain understandable, exportable, and extensible. Monetary and mileage values also need storage-level protection from avoidable contradictions.

## Decision

Use normalized common tables with one-to-one type-specific detail tables. Store money as integer minor units with an explicit currency, metric quantities in explicitly named columns, and work-session distance as a generated odometer difference. Use check constraints and restrictive foreign keys for invariant enforcement.

Use polymorphic `record_type` and `record_id` only where a record truly spans unrelated table families, currently attachments and comments. Those references require authoritative Worker validation.

## Consequences

Queries and CSV exports remain explicit rather than depending on arbitrary JSON. Adding a common record type does not require one giant sparse table. Services must translate user-facing decimal currency values to minor units and must validate polymorphic record targets.
