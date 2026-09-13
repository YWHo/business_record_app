# ADR 012: Separate legal entities from application workspaces

Status: Accepted

## Context

An application workspace, a real-world legal/business entity, a user, and the person legally controlling a business are different concepts. A sole trader may have no organisation or trading name.

## Decision

Store legal/business identity in `business_entities`, linked to `business_accounts`. Entity type, legal name, trading name, NZBN, company number, country, and lifecycle remain independent from membership roles. Legal and trading names are nullable. `OWNER` means primary administrative controller of the application workspace only and must not be presented as legal shareholding, directorship, beneficial ownership, trusteeship, or proprietorship.

Version 1 bootstraps one placeholder sole-trader entity but does not implement Companies Office integration or legal verification.

## Consequences

Workspace access can change without rewriting historical business identity. Later entity editing or verification can evolve independently from authentication and authorization.
