# S2-INT-AVAIL-01 — Member self-check-in availability

**Ticket:** #401
**Authority:** `docs/specs/396-s2-participant-hardening-and-design-integration.md`
**Status:** Acceptance trace written before implementation

## Contract under test

The authenticated participant Program Detail response projects a boolean
`self_check_in_available` per visible Event summary. The Worker computes it at
load time from server state only:

- requesting actor has an `Active` enrollment for the Program;
- Program is not archived and is not a `ManagerOnly` participant surface;
- Event status and availability are `Active`;
- the current instant is within the Event check-in window, inclusive.

Management capability does not grant this participant affordance. Event Detail,
scanner, and the Worker attendance mutation remain the final authority; the
label is informational and does not create or authorize attendance.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| AVAIL-01 | Active enrolled Member, active Event, open window | Load participant Program Detail | Response contains boolean `self_check_in_available: true`; the Event row visibly contains `可簽到`. |
| AVAIL-02 | Non-enrolled Member, closed window, inactive Event, archived Program, ManagerOnly Program, or management-only actor | Load participant Program Detail | The field is `false`; no `可簽到` label is rendered; no check-in secret/window fields leak. |
| AVAIL-03 | Event window or enrollment changes after a prior load | Load again or attempt attendance | The new server projection reflects current state; the old label cannot grant attendance and existing Event Detail/Worker authorization remains unchanged. |
| AVAIL-04 | Response contains a malformed or truthy non-boolean projection | Render participant Program Detail | The browser does not treat the malformed value as available and does not add an attendance action. |

## Evidence required

- Worker contract tests cover positive, negative, boundary, stale-state, and
  malformed-window cases using disposable D1 fixtures only.
- Component tests cover the visible label and strict boolean handling.
- Existing Event Detail, scanner, and attendance authorization tests remain
  green.
- Run focused tests, typecheck, lint, and the local-first gate later in #405.
