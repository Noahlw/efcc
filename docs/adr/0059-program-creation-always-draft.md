# ADR-0059 — Program creation always starts Draft

- **Status:** Accepted
- **Decider:** Product owner (explicit decision during #646 implementation, 2026-09-26)
- **Date:** 2026-09-26

## Context

POST `/api/v1/programs/departments/:id/programs` required a `lifecycle`
field and ran a publish-capability check when `Active` was requested,
but `DepartmentWorkspace.createProgram` always persisted `Draft`
(and `Unlisted`), silently discarding the requested state. A caller
asking for `Active` received `201` with a `Draft` row — the wire
accepted a state the domain never honored. The attendance E2E proof
exposed it: fixture events resolved to empty because their programs
were Draft despite requesting Active.

## Decision

Program creation always starts `Draft` (and `Unlisted`):

- The create route rejects a non-`Draft` `lifecycle` with `422`
  ("Programs must be created as Draft; update lifecycle after
  creation."). `lifecycle` may be omitted.
- Activation and discovery changes happen exclusively through
  `PATCH /api/v1/programs/:id` (the existing update route with its
  authorization and audit semantics).
- The Draft check runs inside `DepartmentWorkspace.createProgram`
  after its authorization checks, so denied actors still receive
  `403`, never a validation-shaped `422` (auth-first ordering
  preserved).
- Client `ProgramInput` no longer carries `lifecycle`; the create
  form and recovery matcher assume Draft for new programs.

## Consequences

- All Worker, component, and E2E fixture helpers create Draft then
  PATCH to publish — the same two-step flow as the UI.
- `discoverability` behavior on create is unchanged (still forced
  `Unlisted` silently).
