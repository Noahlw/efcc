# 01 — feat(shell): 5-Slot Phone-First Shell & Neutral Skeleton Hydration

**What to build:** A phone-first, unified 5-slot bottom dock and responsive desktop navigation shell that dynamically projects the correct persona destinations based on server-evaluated capabilities from `/auth/me`.

1. **Participant Dock:** `首頁 · 課程 · 〔掃描〕 · 通知 · 帳戶` (for congregation members).
2. **Management-Role Dock:** `首頁 · 課程 · 〔掃描〕 · 管理 · 帳戶` (for Staff, Admin, Department Managers, and Program Leaders).
3. **Neutral Skeleton Hydration:** During initial session restore (`isRestoring: true`), slot 4 renders a neutral geometric skeleton matching exact 44px dock dimensions, eliminating visual layout shift and preventing false 403 Forbidden flashes.
4. **Desktop Rail:** Viewports ≥920px adapt the 5 destinations into a sticky left rail.
5. **Legacy Route Redirection:** Direct URLs to `/events`, `/permissions`, and `/care` redirect safely into their respective Management Hub destinations.
6. **Design Tokens:** Extended with `--pending: #8a5b16`, `--pending-surface: #f3eee8`, and `--pending-border: #c1ad95`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Participant bottom dock renders 5 slots with central raised `掃描` button on mobile viewports (<920px).
- [ ] Management-role bottom dock swaps slot 4 from `通知` to `管理` when user holds management capabilities.
- [ ] Desktop viewports (≥920px) render the 5 destinations in a sticky left rail.
- [ ] Initial session restoration renders a neutral skeleton in slot 4 with zero layout shift or unauthorized flashes.
- [ ] Direct links to `/events` redirect permitted operators to `/management?module=events` and members to `/programs`.
- [ ] Direct links to `/permissions` redirect Admins to `/management?module=permissions` and unauthorized accounts to `/home`.
- [ ] Touch targets on all navigation items are ≥44px; active item is marked with `aria-current="page"`.
- [ ] Playwright tests assert zero horizontal overflow (`scrollWidth <= innerWidth`) at 320px, 390px, and 1280px.
