# 085-04 Event Detail acceptance trace

Authority: issue #323, `docs/specs/085-participant-experience.md` (event detail US), and the canonical participant prototype (onEventDetail + 前往掃描 CTA).

Run against local `wrangler dev`/local D1 with an authenticated E2E member fixture. Assert each step through visible DOM or response state; no fabricated data.

1. Open an event detail (e.g. via Home / Program detail / Notices / Scanner).
   - Observe 可簽到 badge when this event's check-in window is currently open.
2. Detail shows title, program name, when, where, and brief check-in instructions.
3. 前往掃描 CTA.
   - Observe navigation into the scanner flow with this exact event pre-selected (the scanner lands on this event's resolution result).
4. Back-navigation.
   - From at least two different entry points (e.g. Home and Program detail) verify the back button returns to the originating screen, NOT a hardcoded target.
   - **Notices origin:** covered by `programs-d1` E2E (notice link → event detail → back → `/notices`).
   - **Scanner origin:** N/A — there is no Scanner → Event Detail route in the D1 app (only Event Detail → Scanner via 前往掃描 per spec 085 US23).

Focused proof: component tests (badge + CTA + back-nav from two origins) + worker test for the event scanner pre-select path + e2e; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.