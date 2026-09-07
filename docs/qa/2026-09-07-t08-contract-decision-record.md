# T08 / #513 contract decision record

**Status: PROPOSED.** This record is a concise owner checkpoint. It does not
approve any contract, waiver, baseline, tolerance, or design review.

## D1 — Control Story subject and PSN interface

- Issue / scope: #513 Batch B; `web/.storybook/presentation-meta.ts` and the existing Story discovery/catalog path.
- Current documented expectation: every discovered presentation declaration is screen-shaped and must resolve to an independent Screen Catalog obligation.
- Proposed exact expectation: add a backward-compatible `subject` discriminator defaulting to `screen`; `subject: "control"` requires a non-empty `controlId`, requires `route` and `intent` to be `null`, shares PSN uniqueness/discovery/ApprovalPackage reference validation, and is excluded from Screen Catalog obligations. Existing screen PSNs, 35 obligations, and 39 T07 Stories remain unchanged.
- Necessary evidence: current exploratory Stories are real production imports and resolve to actual Storybook locators, but cannot yet be cataloged with PSNs without this decision.
- Preservation / public API impact: additive Story metadata only; no production control import direction, route, domain, permission, API, or URL contract changes.
- Replacement proof / negative test: control declaration is discoverable and PSN-referenceable; adding a control does not add a screen obligation; deleting a real screen baseline still fails; duplicate/deleted/replaced PSNs fail closed.
- Rollback checkpoint: revert the additive metadata/catalog commit; existing screen-only discovery remains valid.

## D2 — Shared control visual/API mapping

- Issue / scope: #513 B–E; `web/components/ui/{button,input,textarea,checkbox,switch,select}.tsx` and only the required callers.
- Existing authority already authorizing part of this scope: `DESIGN.md`, `--control-min-size: 44px`, existing `CTR-TK-07`, UI governance primitive ownership, and the live #513 requirement for long text, meaningful states, and target ownership.
- Current measured expectation at the exploratory Stories (390×844 Chromium): Button text `32px` high, Button icon `32×32`, Input `32px` high, Textarea `66px`, Checkbox `44×44`, Switch `32×18.39`, and Radix Select trigger `44px` high with a `477.31px` long selected-value width.
- Proposed exact expectation: preserve existing exports, variants, refs, native/Radix attributes and semantics; make app-facing text Button/Input geometry satisfy the existing 44px minimum with natural long-label wrapping; keep Textarea multiline minimum/rows/resize; keep Checkbox checked/indeterminate/disabled semantics and 44px root; give Switch a 44×44 interactive root while preserving its compact visual track/thumb ratios; keep Radix keyboard/typeahead/Escape/focus-return and make long trigger/item text readable within the approved composed layout. Busy remains caller-supplied `aria-busy` presentation, not a new async API.
- Affected states / callers: Button default/outline/destructive/disabled/busy/icon/asChild; Input empty/filled/invalid/disabled/readonly/search/password; Textarea multiline/invalid/disabled; Checkbox checked/unchecked/mixed/disabled; Switch on/off/disabled/busy; Select placeholder/selected/long/open/keyboard; Login, ProgramForm, PermissionEditor, Dialog/AlertDialog, DirectoryFrame, ApprovalQueue, shell attention, and existing native exceptions.
- Preservation impact: no route behavior, domain validation, permission decision, mutation, URL parsing, native exception, or overlay redesign may move into controls.
- Proposed alternative: retain current primitive mappings and keep all target/wrap behavior as caller patches. Rejected for T08 because it leaves the shared contract untruthful and cannot prove AC-05/08/09.
- Replacement proof / negative test: real Storybook browser measurements, composed Slot/form/Dialog/AlertDialog tests, long TC/Latin cases, and a deliberate below-floor/wrapping/focus fixture that fails against the approved requirement.
- Rollback checkpoint: revert the attributable primitive/caller commit before changing any historical T07 commit or approval record.

## D3 — Incremental caller override ratchet

- Issue / scope: #513 F; existing governance audit API and the changed-source boundary.
- Current documented expectation: existing direct caller overrides are inventoried and classified; new equivalent overrides are not accepted; valid layout, noninteractive status, hidden input, and documented native exceptions remain valid.
- Proposed exact expectation: add a narrow incremental check that examines newly added production caller class tokens for primitive-owned target/padding/radius/focus/icon/busy geometry, reports the exact file/line/property, and fails closed for unknown dynamic/spread cases. It must compare additions against the fixed T08 base, not reclassify historical debt, and must not add a blanket allowlist or waiver.
- Migrate-now callers: CALL-01/02/03/05/06/08/09/10/13/14/24/25 in [`2026-09-07-t08-caller-dispositions.md`](2026-09-07-t08-caller-dispositions.md).
- Bounded debt / exceptions: CALL-07/11/12/16/17/19/21/22 remain named later owners; CALL-18/20/23/28/29 remain native exceptions; CALL-04/26 remain valid layout; CALL-15/27/30 remain outside T08.
- Replacement proof / negative test: new equivalent Button/Input/Switch owned-property caller class fails, while an outer `absolute`/grid/full-width layout class and an approved native/hidden exception do not.
- Rollback checkpoint: revert only the ratchet integration; preserve the census/disposition record and existing governance rules.

## Owner decision (leave blank until real response)

- Result: PENDING
- Decider:
- Date/time:
- Exact decision source:
- Approved scope:
- Rejected / deferred scope:
- Conditions:

This is not final rendered design approval and does not authorize merge or
issue closure.
