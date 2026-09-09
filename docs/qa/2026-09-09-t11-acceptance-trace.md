# T11 / #516 acceptance trace

## Status

`IN PROGRESS` — Ticket 01 implementation and focused qualification are complete;
Tickets 02 and 03 remain open. This trace is the acceptance authority for the
T11 candidate and must be updated with fresh evidence before the implementation
can reach `T11 IMPLEMENTATION_GREEN — WAITING_OWNER_L2`.

## Base and scope

- Base: `main` at `3dd94e842b461461c87ef7687960e23e8198841c`.
- Worktree/branch: `/home/ubuntu/gh-repo/efcc-t11` / `codex/t11-issue-516`.
- Issue: #516.
- Execution order: Ticket 01 → Ticket 02 → Ticket 03.
- Scope: authenticated global shell chrome, route-title ownership, one shell
  scroll owner, shell reserve/safe-area geometry, one projected navigation
  landmark, the 799/800 transition, shell focus/offline/attention/scanner
  behavior, shipped-screen Storybook evidence, W7 Chromium evidence, and
  representative Firefox/WebKit evidence at 390px and 800px.
- Excluded: auth/session/server-navigation authority, Worker/D1 behavior,
  permission/business logic, route URLs/mutations, route-family redesign, and
  T12+ work.

## Acceptance trace

| ID | Observable contract | Evidence owner |
|---|---|---|
| T11-A01 | Ordinary member shell header presents global application/church chrome, not the current route title. | Authenticated shell component test + member Storybook baselines + browser inspection. |
| T11-A02 | Management identity, role presentation, attention entry, and existing `/programs` attention suppression remain intact. | Shell component tests + management Storybook baseline + focused browser assertions. |
| T11-A03 | Scanner suppresses the top header while authenticated navigation remains mounted. | Shell component test + scanner Storybook baseline + browser assertion. |
| T11-A04 | Notices and Messages retain a visible, semantic local route H1 at phone widths after shell title ownership is removed. | Route component tests + existing member Stories + 390px browser evidence. |
| T11-A05 | Existing route copy, URLs, Back/history behavior, domain state, mutations, permissions, auth/session and server-projected navigation remain unchanged. | Focused regression tests + affected/full verification + diff review. |
| T11-A06 | Exactly one `nav#main-navigation` landmark renders server-projected destinations with prefix-aware active state. | Shell/Nav component tests + shell browser suite. |
| T11-A07 | `#shell-content` is the sole authenticated-shell scroll outlet and owns shell dock/rail reserve and safe-area clearance; route content rhythm remains route-owned. | W7 Chromium numeric geometry evidence. |
| T11-A08 | W7 is exactly 320/375/390/414/799/800/1440, with compact behavior below 800px and desktop behavior at/above 800px. | Shell geometry runner and committed config/results. |
| T11-A09 | Skip link, main-content reachability, offline/recovery behavior, attention focus trap/Escape/restoration, and scanner navigation remain reachable. | Existing shell component tests + W7 browser evidence. |
| T11-A10 | Existing shipped-screen Stories remain directly openable and truthful for member, management, and scanner shell modes; no ordinary helper Story gains a PSN. | Storybook index/catalog checks + direct locators + visual inspection. |
| T11-A11 | Representative Firefox/WebKit shell qualification passes at 390px and 800px without changing Fast CI or multiplying full W7 across engines. | Explicit local cross-browser run/results. |
| T11-A12 | CEN-030 and CEN-058 are inspected and explicitly dispositioned; later route-family debt stays out of T11. | Live census output + final disposition entry. |
| T11-A13 | Each ticket has focused tests/typechecking, a two-axis Standards/Spec review with no unresolved blocker, and a commit on the same T11 branch. | Per-ticket logs, review notes, and commit history. |
| T11-A14 | Final state is `T11 IMPLEMENTATION_GREEN — WAITING_OWNER_L2`; the implementation agent does not self-approve the owner L2 gate. | Final trace update and handoff. |

## Planned seams

- Authenticated `AppShell` / `ShellHeader` / `NavBar` public behavior.
- Existing Notices/Messages member shipped-screen Stories.
- Existing management identity and scanner/attendance shipped-screen Stories.
- Chromium shell geometry at W7.
- Representative Firefox/WebKit shell geometry at 390px and 800px.

No Worker/D1 journey is added solely for shell presentation.

## Ticket 01 fresh evidence

- TDD red/green: the new phone route-title assertion failed on the pre-change
  1px clipped H1, then passed after the minimal Notices/Messages class removal.
- Focused component tests: `pnpm --dir web exec vitest run --config
  vitest.components.config.ts lib/app.test.tsx lib/messages-panel.test.tsx
  lib/notices-panel.test.tsx` — 108 passed.
- Focused shell route-title browser check: Chromium passed at 320, 390, 600,
  799, 800, 1024 and 1440px; Notices and Messages both retain a visible local
  H1 and the shell header remains global brand-only. The complete shell geometry
  suite had previously passed 32 tests with 3 pre-existing desktop skips.
- Fast typecheck: `pnpm verify:fast` passed for root and `web/` TypeScript.
- Storybook/catalog scope check: `pnpm test:storybook:scope` passed (13 tests).
- Owner Storybook spot-check at 390px: existing Notices and Messages member
  baselines show local H1s and global `顯恩堂` chrome; Management Account
  Directory retains identity and attention bell; Scanner Boundary retains the
  authenticated dock while suppressing the top shell header. No Story or PSN was
  added.
- Census/disposition: live `node scripts/t09-frontier-census.mjs --json` found
  CEN-030 (`web/app/home/page.tsx`, loading surface) and CEN-058
  (`web/lib/offline-banner.tsx`, offline surface), both existing
  `BOUNDED_LATER_DEBT`; neither is a shell-title defect. Home and offline code
  were left unchanged and the records remain deferred to their route-family
  owners.
- Ticket 01 review: Standards axis found and fixed the temporary prohibited
  `test.skip`/duplicated width allowlist; Spec axis found no production defect,
  and the component/browser evidence gaps were closed. Final two-axis review
  and commit remain to be recorded below.
