# S2-INT-SCH / PERM / ENR — Program Detail affordances

**Ticket:** #402
**Authority:** `docs/specs/396-s2-participant-hardening-and-design-integration.md`
**Blocked-by:** #401 (implemented on the lower stack layer)
**Status:** Acceptance trace written before implementation

## Contract under test

Participant Program Detail keeps recurrence rules and concrete upcoming Events as
separate domain sources inside one grouped presentation. It presents active
future Events ordered by `starts_at`, with four rows at widths below 800px and
eight rows at widths at or above 800px. The list is responsive without a hidden
keyboard-only row, duplicate row, reordered row, or overflow.

Lifecycle status uses the selected neutral dot treatment; `可簽到` is visible
text only when the server-derived `self_check_in_available` field is strictly
true. The requestable non-enrolled Member advisory appears only when a visible
Event is gated by enrollment. ManagerOnly, archived, already-authorized, and
no-Event states do not expose it. Existing single sticky enrollment mutation
ownership, offline guards, confirmation focus, and read-only precedence remain
unchanged. No enrollment history timeline or View All route is added.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| SCH-01 | Rules and/or concrete Events are present | Load Program Detail | One grouped schedule presentation keeps `時間規則` and `即將舉行` semantically distinct; empty groups are hidden; both empty produces one truthful empty state. |
| SCH-02 | More than four active future Events | Render at 320/375/390/414/799/800/1440px and resize across 800px | Four rows show below 800px; eight show at/above 800px after mount; rows remain ordered, unique, keyboard reachable, and overflow-free. |
| SCH-03 | Active Event rows include true/false availability | Render schedule | Active lifecycle treatment is neutral and `可簽到` is visible text only for strict `true`; status is never color-only. |
| PERM-01 | Requestable non-enrolled Member, visible upcoming Event | Load Program Detail | `加入後可查看聚會詳情` is visible without revealing unauthorized Event facts. |
| PERM-02 | ManagerOnly, archived, already-authorized, or no-Event state | Load Program Detail | Advisory is absent; existing Event Detail authorization and one-control action precedence remain intact. |
| ENR-01 | Every enrollment mutation lifecycle and manager/archived state | Interact with Program Detail | One sticky action owner remains; confirm/offline/focus/read-only behavior is unchanged; no history timeline is introduced. |

## Evidence required

- Component tests cover group headings/empty states, cap and resize behavior,
  lifecycle/availability labels, advisory gating, one action owner, focus, and
  the rejected history timeline/View All scope.
- Local Playwright coverage asserts observable DOM, keyboard/focus, target sizes,
  overflow, and the seven required widths against local Worker/D1 fixtures.
- Existing Worker/API authorization and attendance tests remain green.
