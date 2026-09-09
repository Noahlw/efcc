# T11 / #516 acceptance trace

## Status

`T11 MACHINE_GREEN — READY_FOR_OWNER_L2` — T11 implementation and machine
qualification are complete; human owner L2 review remains explicitly open. The
implementation agent does not claim that approval.

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
| T11-A07 | `#shell-content` is the sole authenticated-shell page/content outlet and owns shell dock/rail reserve and safe-area clearance; route-local nested scroll regions remain route-owned. | W7 Chromium numeric geometry evidence + structural-owner regression probe. |
| T11-A08 | W7 is exactly 320/375/390/414/799/800/1440, with compact behavior below 800px and desktop behavior at/above 800px. | Shell geometry runner and committed config/results. |
| T11-A09 | Skip link, main-content reachability, offline/recovery behavior, attention focus trap/Escape/restoration, and scanner navigation remain reachable. | Existing shell component tests + W7 browser evidence. |
| T11-A10 | Existing shipped-screen Stories remain directly openable and truthful for member, management, and scanner shell modes; no ordinary helper Story gains a PSN. | Storybook index/catalog checks + committed Storybook W7 runner + implementation-agent self-review. |
| T11-A11 | Representative Firefox/WebKit shell qualification passes at 390px and 800px without changing Fast CI or multiplying full W7 across engines. | Explicit local cross-browser run/results. |
| T11-A12 | CEN-030 and CEN-058 are inspected and explicitly dispositioned; later route-family debt stays out of T11. | Live census output + final disposition entry. |
| T11-A13 | Each ticket has focused tests/typechecking, a two-axis Standards/Spec review with no unresolved blocker, and a commit on the same T11 branch. | Per-ticket logs, review notes, and commit history. |
| T11-A14 | Final machine state is `T11 MACHINE_GREEN — READY_FOR_OWNER_L2`; the implementation agent does not self-approve the owner L2 gate. | Final trace update and handoff. |

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
- Implementation-agent Storybook self-review at 390px: existing Notices and Messages member
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

## Ticket 02 fresh evidence

- Runner reconciliation: `tests/e2e/shell-geometry.config.ts` now contains
  exactly 320/375/390/414/799/800/1440; stale 600 and 1024 shell-policy
  projects were removed. The shell breakpoint remains 799 compact / 800
  desktop.
- W7 Chromium: `pnpm test:shell-geometry` — 35 passed. The geometry contract
  now asserts one `nav#main-navigation`, shell-content horizontal containment,
  no document-level vertical overflow, one shell-frame content scroll owner,
  and at least 84px phone dock/safe-area reserve.
- Safe-area qualification: the existing responsive `bottom nav and page outlet
  reserve safe-area inset` test was run with Chromium CDP safe-area override at
  375x812, 375x667 and 1280x800 — 3 passed; phone reserve resolved to 118px
  (84px dock reserve + 34px inset) and desktop reserve remained 0px.
- Navigation regression: `pnpm exec playwright test --config=tests/e2e/responsive.config.ts
  tests/e2e/shell-nav.test.ts` — 24 passed at 375x812, 375x667 and 1280x800.
- Component/type checks: `web/lib/app.test.tsx` — 90 passed; `pnpm verify:fast`
  passed. The NavBar component now explicitly asserts one navigation landmark.
- Ownership disposition: live W7 produced no shell overlap, overflow, duplicate
  reserve or second content scroll owner, so no production CSS was changed and
  no route-owned bottom rhythm was removed. Existing `.shell-content` remains
  the shell source of truth; route padding remains route-owned. The committed
  probe adds a nested `overflow-y:auto` route panel that passes, then makes
  `.shell-body` scrollable and confirms the structural-owner assertion fails.
- Ticket 02 review: Standards found no hard violation; Spec’s initial proof gap
  was closed by the shell-frame/document overflow assertions and the existing
  CDP safe-area evidence. Cross-browser qualification remains Ticket 03 scope.

## Ticket 03 fresh evidence

- Representative cross-browser qualification: `pnpm exec playwright test
  --config=tests/e2e/shell-cross-browser.config.ts` — 20 passed across
  Firefox/WebKit at 390px and 800px. The config reuses the shell assertions and
  does not expand Fast CI or multiply W7 across additional engines; the
  breakpoint assertion now parses the width from suffixed project names, so
  cross-browser 390/800 runs exercise the same responsive contract.
- Implementation-agent Storybook self-review and live self-review used the
  existing production baselines and direct locators at 390/799/800:
  - `t07-2-public-auth-member-communications--home` — global brand-only
    header, visible member content, fixed dock below 800px, rail at 800px.
  - `t07-4-management-identity--account-directory` — management identity and
    attention bell remain visible; management nav stays one landmark across
    the breakpoint.
  - `t07-5-attendance-scanner-guest--scanner-boundary` — top shell header is
    suppressed while authenticated navigation remains present at every width.
  Full-page captures were inspected by the implementation agent for each mode at the breakpoint widths;
  no in-scope overlap, clipped title, duplicate reserve, or long-content
  containment defect required an integration repair.
- W7 presentation spot-check expanded to 320/375/390/414/799/800/1440 for
  member, management and scanner baselines. Direct locators found one
  `#main-navigation` and one `main#shell-content` at every width, zero
  horizontal overflow, and no top header in scanner mode; the phone dock and
  desktop rail remained on their expected sides of the 800px breakpoint.
- Storybook integrity: `pnpm --dir web storybook:build` passed, then
  `pnpm --dir web storybook:verify-index` passed with 60 Stories, 35 Screen
  Catalog obligations, 7 control Stories and 12 foundation Stories; all
  registered declarations and baselines resolved.
- Final local qualification: the `pnpm verify` precommit portion passed
  (typechecking, Storybook scope, repository tests, governance, identity,
  Worker/D1 contract, Worker 606-test suite and web component 924-test suite).
  The aggregate responsive command then reported 89 passed, 1 intended desktop
  skip and 3 failures in the unchanged `tests/e2e/account-settings.test.ts`
  username-flash assertion across its three viewports; this unrelated
  pre-existing failure is preserved and is not claimed as T11 green.
- Base confirmation: the same three-test username-flash slice was rerun in
  clean `/home/ubuntu/gh-repo/efcc` at `main` and reproduced 3 failures with
  the same missing login alert. No T11 file or shell change is involved.
- T11-focused responsive qualification excluding that unrelated account-settings
  file: `pnpm exec playwright test --config=tests/e2e/responsive.config.ts
  tests/e2e/responsive.test.ts tests/e2e/shell-nav.test.ts` — 62 passed and 1
  intended desktop-only skip. Full Chromium W7 remained 35 passed, and the
  Firefox/WebKit qualification remained 20 passed.
- Existing T11 census disposition remains unchanged: CEN-030 and CEN-058 are
  bounded later debt; Home and offline behavior remain untouched, and route
  family debt remains outside this branch.
- Final two-axis review against `197bdd7e` found no unresolved Standards or Spec
  implementation finding. Ticket 03 is committed as `33db2a73`
  (`fix(t11): qualify authenticated shell`). Human L2 owner review is not
  claimed by the implementation agent.

## Review-fix qualification

- Shell-owner contract narrowed to the structural `.shell`, `.shell-body`, and
  `#shell-content` elements; arbitrary descendants of `#shell-content` are
  route composition and are no longer treated as competing shell owners.
- Storybook W7 runner: `pnpm test:t11:storybook` — 35 passed across the
  existing Home, Notices, Messages, Account Directory, and Scanner Boundary
  baselines at exactly 320/375/390/414/799/800/1440px. Assertions cover one
  navigation landmark, one shell outlet, containment, member branding,
  route-owned Notices/Messages H1s, management identity/attention, scanner
  header suppression, and the 799/800 dock/rail switch.
- The visual evidence above is implementation-agent/AI Storybook self-review.
  Owner Storybook spot-check: PENDING. L2 human review: PENDING.
- No new Story, PSN, Screen Catalog declaration, production shell abstraction,
  skip, allowlist, or tolerance widening was added.
