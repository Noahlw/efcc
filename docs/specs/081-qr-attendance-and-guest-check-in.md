# 081 — QR Attendance and Guest Check-In

**Status:** Ready for ticket decomposition
**Parent:** Attendance model revision following ADR-0028
**Domain basis:** `CONTEXT.md` and ADR-0028

## Problem Statement

The current attendance draft models only staff or Program Leaders scanning a member's QR code. That no longer matches the intended church workflow. Members should be able to scan a permanent Program Check-In QR or enter a per-Event Manual Check-In Code, visitors should be able to check in without an account, and authorized operators should retain an Event-scoped assisted check-in path.

The current login surface has no Guest Check-In entry, the D1 attendance model has no guest identity shape, and the historical attendance specification conflicts with the current Program/Event model.

## Solution

Provide one attendance capability with three explicit modes:

- **Self Check-In:** an enrolled authenticated user scans the Program Check-In QR or enters the Event Manual Check-In Code.
- **Guest Check-In:** a visitor, or an authenticated account holder explicitly choosing guest mode, scans the Program Check-In QR or enters the Event Manual Check-In Code, then supplies a required name and phone without creating or using a member identity for the attendance row.
- **Assisted Check-In:** Admin/Staff or the active Program Leader for the Event's Program scans a Member QR or searches for an enrolled member from the Event detail surface.

The signed-out login surface exposes a secondary Guest Check-In action. A Program QR deep link enters the same public flow directly. If a guest chooses to log in, the Event context is preserved and revalidated before authenticated Self Check-In. Guest and later member records are never automatically merged.

## User Stories

1. As an enrolled Member, I want to open Check-In from the authenticated application, so that I can record attendance without finding a staff member.
2. As an enrolled Member, I want to scan the permanent Program Check-In QR, so that I do not need to type an identifier.
3. As an enrolled Member, I want to enter a short Event Manual Check-In Code when camera scanning fails, so that a weak camera or accessibility need does not block attendance.
4. As an enrolled Member, I want the system to identify the current Event for the Program, so that I cannot accidentally check into a different occurrence.
5. As an enrolled Member, I want an Event chooser when multiple Event Check-In Windows are open, so that I can select the intended occurrence explicitly.
6. As an enrolled Member, I want a clear result when the Event window is closed, so that I know why the QR or code no longer works.
7. As an enrolled Member, I want a quiet duplicate result, so that repeated scans do not create duplicate attendance or interrupt the queue.
8. As an authenticated but unenrolled account holder, I want to choose Guest Check-In deliberately, so that I can record visitor attendance without bypassing the enrolled-member Self Check-In rule.
9. As a visitor without an account, I want to tap Guest Check-In on the login surface, so that I can start attendance without logging in.
10. As a visitor without an account, I want a Program QR deep link to open Guest Check-In directly, so that I do not need to navigate the login page first.
11. As a visitor without an account, I want to scan the Program QR, so that I can identify the Event without knowing a route or identifier.
12. As a visitor without an account, I want to enter the Event Manual Check-In Code, so that I have a camera-free fallback.
13. As a visitor, I want to provide my name and required phone number, so that the church can record attendance and follow up when appropriate.
14. As a visitor, I want the system to accept ordinary Hong Kong local or `+852` phone formats, so that formatting does not block me.
15. As a visitor, I want a neutral duplicate notice when my phone has already checked in for the Event, so that another person's name or attendance time is not exposed.
16. As a visitor who sees a duplicate notice, I want instructions to ask the Event Leader for help, so that a mistaken duplicate can be corrected safely.
17. As a visitor who starts Guest Check-In and then chooses to log in, I want to return to the same Event context, so that I do not have to scan or type the code again.
18. As an authenticated user who completes that handoff, I want the server to revalidate the Event window and enrollment, so that a stale or tampered context cannot create attendance.
19. As an authenticated user who previously checked in as a guest, I want later Self Check-In to remain a separate record, so that the system never silently merges identities.
20. As a Program Leader, I want to open Assisted Check-In from a specific Event, so that the operator is always scoped to the correct occurrence.
21. As a Program Leader, I want to scan a Member QR from the member's phone, so that I can check in members who cannot self-scan.
22. As a Program Leader, I want to search enrolled members by name or phone, so that I have a camera-free assisted fallback.
23. As a Program Leader, I want unenrolled members rejected by the assisted path, so that attendance does not silently create enrollment.
24. As Staff, I want to assist check-in for any permitted Program, so that church operations are not blocked by a single leader's absence.
25. As Admin, I want to assist check-in for any Event, so that I can recover operational failures.
26. As a Member, I must not access the assisted operator controls, so that member attendance cannot be attributed to another person.
27. As Admin/Staff, I want to see guest names and full phone numbers, so that I can perform pastoral follow-up.
28. As the active Program Leader, I want to see guest names and full phone numbers for my Program, so that I can follow up after the Event.
29. As another Member, I must not see guest contact details, so that visitor privacy is preserved.
30. As an authorized Event manager, I want to correct a guest name or phone in place, so that a typo can be fixed without rewriting the attendance fact.
31. As an authorized Event manager, I want guest-data corrections to record old value, new value, actor, reason, and time, so that corrections remain accountable.
32. As an authorized Event manager, I want to void an incorrect guest or member attendance, so that history remains intact while the active record is removed.
33. As a guest whose record was voided, I want to check in again with the same phone, so that a correction does not permanently block attendance.
34. As an Event manager, I want cancellation to invalidate the Event QR/manual-code path immediately, so that cancelled gatherings cannot receive attendance.
35. As an Event manager, I must not reschedule an Event after attendance exists, so that existing check-in timestamps retain their meaning.
36. As an Event manager, I want a rescheduled Event before attendance to keep its never-reused Manual Code, so that already-shared code material remains stable.
37. As a Program/Event manager, I want to generate a fresh Event Check-In Sheet, so that the permanent Program QR and current Manual Code can be downloaded or printed together.
38. As a venue operator, I want the Program QR to remain a permanent venue marker, so that it does not need replacement for every recurring occurrence.
39. As a venue operator, I want the Event Manual Code to remain Event-specific and never reused, so that stale printed material cannot resolve to a later Event.
40. As a Member or visitor, I want only currently open Events shown in the Program QR chooser, so that I cannot select a future or expired attendance window.
41. As the system, I want public Guest Check-In writes rate-limited, so that an unauthenticated endpoint cannot be abused to flood attendance.
42. As the system, I want one active guest attendance per normalized phone and Event, so that repeated submissions do not create duplicate visitor rows.
43. As the system, I want guest attendance to retain an authenticated actor when one deliberately chooses guest mode, so that abuse and corrections remain attributable.
44. As the system, I want signed-out guest attendance to have no member identity, so that visitors do not become accounts implicitly.
45. As the system, I want all attendance writes and corrections audited, so that operational changes are explainable later.
46. As a phone user, I want the camera and manual-code controls to have clear loading, permission, error, success, and duplicate states, so that I can recover without support.
47. As a keyboard or assistive-technology user, I want labelled inputs, visible focus, announced status changes, and a manual fallback, so that camera use is not required.
48. As a church operator, I want the same attendance rules across mobile and desktop, so that the device does not change authorization or data meaning.

## Implementation Decisions

- The login surface adds a secondary Guest Check-In action; it does not create a guest account or Session.
- Program QR deep links enter the public Guest Check-In flow directly.
- Guest Check-In is an explicit attendance mode and may be selected by a signed-out visitor or an authenticated account holder.
- An authenticated guest-mode submission keeps `member_user_id` NULL while retaining the authenticated actor in `checked_in_by` and audit history.
- An authenticated user who chooses the login handoff returns to the preserved Event context; the server revalidates the Event window and enrollment before Self Check-In.
- Guest and later member attendance records are never automatically merged.
- `Program Check-In Token` is permanent and program-scoped; it is not the opaque D1 `program_id`.
- `Event Manual Check-In Code` is short, globally unique, assigned once per Event, and never reused. It is accepted only while that Event's Check-In Window is open.
- The Program QR resolves directly when one Event window is open and presents an Event chooser by name/time when multiple windows are open. The chooser lists open Events only.
- Event cancellation invalidates its QR/manual-code check-in immediately. Rescheduling keeps the code only before attendance exists; after attendance, a new Event is required.
- The permanent Program QR may be printed. A fresh Event Check-In Sheet may combine the Program QR and current Manual Code for download/printing; it is Event-specific and must be regenerated after Event changes.
- Self Check-In requires an Active account and Active enrollment in the Event's Program.
- Assisted Check-In is available to Admin/Staff globally and the active Program Leader for the Event's Program. It scans Member QR or searches enrolled members.
- Guest Check-In requires name and phone. Hong Kong local and `+852` phone forms normalize to one duplicate key; other international formats are accepted using a canonical flexible representation.
- Only one Active guest attendance may exist for a normalized phone and Event. A Voided guest row releases the slot.
- Guest name and phone remain attached to attendance history. Full contact details are visible to Admin/Staff globally and the active Program Leader for the Event's Program.
- Public Guest Check-In uses rate limiting and duplicate guards rather than OTP.
- Guest-data correction is an audited in-place change by Admin/Staff or the active Program Leader for that Event's Program.
- Attendance voids preserve the row, require a reason, are audited, and permit a later check-in.
- Public duplicate responses reveal no existing guest name or time and direct the visitor to the Event Leader.
- Attendance methods distinguish `self_qr_scan`, `self_manual_code`, `leader_qr_scan`, `leader_manual_search`, `guest_qr_scan`, and `guest_manual_code`.
- The attendance model permits a nullable member identity for guest rows and retains guest name/phone fields.
- The highest acceptance seam is a fresh deployed browser flow covering the login CTA, direct QR entry, manual code entry, Event chooser, authenticated handoff, enrollment gating, guest duplicate behavior, assisted check-in, corrections, voids, cancellation, and responsive/accessibility states.

## Testing Decisions

- Tests assert observable user behavior and persisted outcomes, not component structure or private helper calls.
- D1 migration tests verify attendance schema constraints, Event-code uniqueness/non-reuse, nullable guest identity, active duplicate guards, and audit immutability.
- Worker request tests cover public guest writes, rate limits, phone normalization, guest duplicate responses, authenticated guest attribution, login context handoff, self-check-in enrollment gating, assisted capability gating, cancellation, rescheduling restrictions, correction, and void behavior.
- Component tests cover the login Guest Check-In CTA, Event chooser, manual-code fallback, guest form validation, neutral duplicate notice, and authenticated return path.
- Playwright acceptance tests use fresh deployed Worker state and assert every criterion through observable DOM state at phone and desktop viewports.
- Existing D1 auth and PRG Playwright patterns are the prior art for authenticated storage state, deployed request context, and disposable test data.
- Public guest tests use disposable Event/phone fixtures and never mutate the production Users data.

## Out of Scope

- Guest account creation or automatic registration.
- OTP/SMS verification.
- Location verification or offline attendance capture.
- Automatic guest-to-member conversion or record merging.
- Reusing expired Event Manual Check-In Codes.
- Changing the Program QR token for every recurring Event.
- Allowing Event rescheduling after attendance exists.
- Guest attendance without a phone number.
- Guest contact visibility to ordinary Members.

## Further Notes

- The historical attendance draft is explicitly stale and must not be used as implementation authority.
- The prototype under `prototype/scanner/` demonstrates the three attendance modes and the Civic Minimal responsive direction; production behavior must use the Worker/D1 ownership boundary and deployed acceptance gate.
- Rate-limit thresholds and the exact canonical representation for non-Hong-Kong international phone numbers remain implementation parameters, but must preserve the duplicate-key contract.
