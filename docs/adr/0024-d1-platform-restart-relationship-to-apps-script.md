# ADR-0024 — D1 Platform Restart: Relationship to the Apps Script/Google Sheets Backend

- **Status**: Accepted
- **Deciders**: Noah Wong
- **Date**: 2026-08-06
- **Related**: ADR-0020 (D1 identity, session, auth boundary), ADR-0022 (staged Worker/D1 platform migration), ADR-0017/0018 (Cloudflare frontend + HTTP boundary)

## Context

By 2026-08-06 the codebase had drifted far enough from its Apps Script
origins that the D1 platform is no longer a parallel migration target — it
is the platform the repository is **restarting on**. ADR-0022 established
the capability-by-capability migration; this ADR records the standing of
every decision that predates D1, so a fresh session does not treat the
Apps Script-era decision record as the current architecture.

The drift is substantial and cumulative:

- Identity, credentials, sessions, login, logout, registration, and
  approval now live in Cloudflare Worker + D1 (ADR-0020), not PIN +
  `PropertiesService` sessions (ADR-0011) or the `Users` sheet as the
  credential source (ADR-0002).
- The frontend is Next.js static export on Cloudflare Workers (ADR-0017),
  not the HtmlService App Document (ADR-0007/ADR-0010).
- The browser talks to the Worker over the HTTP boundary (ADR-0018), not
  `google.script.run` (ADR-0003).
- The single-lock audit contract is ADR-0023; ADR-0009's write pattern is
  superseded.

## Decision

The repository is restarting on D1. The Apps Script + Google Sheets
backend is **historical**: it remains the live transitional domain backend
for capabilities not yet migrated, but it is no longer the platform the
architecture is built around, and no new Apps Script-facing decision should
be added without a D1 counterpart.

> **Amendment (2026-08-15): migration complete.** Every capability the
> web application uses — identity, auth, Programs, Events, Attendance,
> Enrollments — is Worker/D1-native, and no live caller of the Apps Script
> domain backend remains. `src/gas/`, `tests/gas/`, the clasp configuration,
> and the Worker's transitional `/api/v1/rpc` proxy were removed. The Apps
> Script + Google Sheets backend is retired, not merely transitional; the
> paragraphs below remain as the record of the restart decision.

For the pre-D1 decision record, adopt a **per-ADR status** rather than a
blanket "historical" label, so that domain decisions which survive the
restart keep their authority:

- **Live domain basis** — the decision is still true (the domain rule it
  records survives), but its Apps Script *mechanism* is superseded by a D1
  counterpart. Example: ADR-0001 (Sheets remains the database), ADR-0006
  (role/capability model carries into D1), ADR-0013 (canonical sheet
  reference).
- **Superseded** — the decision's mechanism is gone and replaced. Example:
  ADR-0003 (`google.script.run` transport → ADR-0018 HTTP boundary),
  ADR-0007/ADR-0010 (HtmlService App Document → ADR-0017),
  ADR-0011 (one active session → ADR-0020 multi-device),
  ADR-0009 (audit write pattern → ADR-0023).
- **Historical tooling** — a decision that still governs a retained
  process, unchanged by the restart. Example: ADR-0012 (Playwright
  storage-state, retained for the legacy `/exec` suite),
  ADR-0014 (CI precheck/pre-commit).

The CONTEXT.md Architecture Decisions table is grouped into two eras
(D1: 0017–0023; Apps Script: 0001–0016) with these per-ADR statuses, so
the era grouping signals *where the platform is* while the per-ADR status
signals *what each decision still means*.

## Consequences

- New work starts from the D1-era ADRs (0017–0023) and the specs under
  `docs/specs/074`–`078`.
- Apps Script ADRs are read for rationale and surviving domain rules, not
  as the current architecture.
- This ADR is a standing record, not a freeze: a capability that later
  migrates to D1 flips its predecessor's status to Superseded in the
  CONTEXT table as part of that migration's PR.