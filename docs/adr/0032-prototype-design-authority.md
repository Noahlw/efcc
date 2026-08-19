# Prototype Design Authority for the EFCC Webapp Redesign

**Status:** accepted

Two standalone HTML files — `design/efcc-management-workspace-prototype.html`
and `design/efcc-participant-checkin-prototype.html` — are the authoritative
design source for the EFCC webapp redesign, confirmed directly against their
decoded source in a grilling/domain-modeling session on 2026-08-16.

### Background

An earlier attempt at this redesign (issues #291–#296, closed) was built
against `docs/specs/design-tree-efcc-redesign.html`, a hand-authored 47/55-
screen reference document, and its own `ADR-0032`/`ADR-0033` (both since
superseded by this document; the numbering is reused because neither ever
landed on `main`). That reference document did not accurately reflect the
real prototypes. Direct comparison against the two files above — decoding
their embedded `text/x-dc` template and logic script rather than relying on
secondary documentation — surfaced concrete contradictions with what had
already been built:

- Registration Approval detail is its own deep-linkable screen in the
  prototype, not inline-only as the prior `ADR-0033` claimed.
- Assisted enrollment is available on any managed program's active roster in
  the prototype, not restricted to `ManagerOnly` programs as previously
  implemented.
- Account Permissions is a real multi-account role matrix in the prototype,
  not the actor's own projection as previously implemented.
- Care has no screen and no navigation slot in either prototype; it was
  previously carried as a Hub row and stub regardless.
- The prototype's event-recurrence UI is manual, one-meeting-at-a-time
  creation with a purely informational recurrence tag — it has no
  rule-based bulk-generation screen at all, unlike what had already been
  built on `main`.

The prior stack (PR #297 and issues #291–#296) was closed without merging.
See `.scratch/prototype-port-2026/GRILLING-DECISIONS.md` for the complete
decision record.

### Decision

1. **Source of truth**: `design/efcc-management-workspace-prototype.html`
   and `design/efcc-participant-checkin-prototype.html` are binding. Where
   any other document (an ADR, a spec, `docs/specs/design-tree-efcc-
   redesign.html`) conflicts with the decoded content of these two files,
   the prototype files win and the conflicting document must be corrected
   or retired.
2. **Screen inventory**: 31 real, rendered screens in the management
   prototype (of 34 declared — 3 are dead JS-only route names with no view
   markup) and 21 real, rendered screens in the participant prototype (of 22
   declared — `guest-scan` is dead). The three dead management routes are
   `program-notifications`, `participant-approval-detail`, and
   `assisted-enrollment` as a standalone route (see `dead-routes-and-dead-code.md`);
   `program-settings` is the 31st real screen — a currently-unimplemented
   Program Leader assignment surface requiring a future implementation slice.
   `docs/specs/design-tree-efcc-redesign.html`'s 47-screen inventory is
   retired; it is no longer maintained and must not be used as a screen-count
   reference. It stays in the repo only as historical record of the prior
   (incorrect) attempt.
3. **Port strategy**: production rebuilds every real prototype screen's DOM,
   copy, states, and interaction contract inside the existing Next.js/
   Worker/D1 architecture, against real data — not a copy of the bundle, not
   a visual-only restyle. Demo-only scaffolding (scenario switchers, offline
   simulation toggles, cross-prototype persona hard-links, `示範資料`
   labels) is never ported. Resolved contradictions recorded during
   reconciliation: the prototype's own `?screen=` demo router is not adopted
   (production's URL intent contract wins); the apparent `#176a87` vs
   `#6495aa` focus-ring discrepancy is not a divergence to port — the repo's
   existing `--focus: #176a87` in `web/app/globals.css` already matches
   `DESIGN.md` and is the established accessible focus ring.
4. **Scope corrections carried forward** from the contradictions above:
   Registration Approval detail becomes its own routable Task; assisted
   enrollment is capability-gated, not mode-gated; Account Permissions
   becomes a real multi-account projection; Care is removed outright, no
   redirect shim; the existing rule-based recurrence generator is kept as an
   additive, secondary capability behind the prototype's manual-creation
   primary path (not removed, since the prototype under-specifies rather
   than forbids it).
5. **Implementation specs**: `docs/specs/084-shell-auth-account-settings.md`
   through `docs/specs/087-management-hub-approvals-home-cms.md` are the
   subsystem-scoped implementation specs derived from these two prototypes,
   published in place of the retired `docs/specs/083-management-workspace-
   and-shell-contract.md`.

### Consequences

`CONTEXT.md`'s domain glossary is updated to remove the Care Dashboard entry
(no longer roadmap scope — absent from the binding design) and to clarify
that Schedule Rule generation is an additive capability alongside prototype-
primary manual event creation, not the prototype's own model. Any future
prototype screen or revision must be evaluated against the same two files,
decoded directly — not against a derived summary document, which is exactly
the failure mode this ADR corrects.
