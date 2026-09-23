# ADR 015: Use business-first routes and responsive task-focused pages

Status: Accepted

## Context

The current horizontal navigation is workspace-wide and several pages combine
lists, multiple create forms, editing, and administration. That becomes unclear
when an account contains multiple businesses and breaks down on phone and small
tablet viewports.

## Decision

Make the selected business explicit in `/app/businesses/:businessId/...` routes.
Account pages and business pages use distinct shells. Desktop and tablet
landscape use a persistent sidebar; tablet portrait uses a compact sidebar;
phone uses a compact header, business selector, single-column content, and
bottom navigation.

List, create, detail, and edit are dedicated routes. A page has one primary
responsibility and create/edit pages have one primary form. Business selection
comes from the URL and is not repeated as an editable field on every record.
Legacy routes redirect only when the destination is unambiguous.

## Consequences

Navigation is predictable across businesses and device sizes, URLs are
shareable, and forms can provide clearer validation and unsaved-change handling.
The route tree and Playwright selectors must change, and mobile layouts require
purpose-built list/card presentations rather than shrinking desktop tables.
