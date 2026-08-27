# Responsive Sticky Overlays Audit — 2026-08-27

> **Ground truth:** user's 748×1366 photo of `http://127.0.0.1:8797/management?module=permissions` showing the unsaved-changes review/save overlay covering nearly the entire mobile viewport is correct. This report does **not** ship PASS based on the narrow prior suites (`responsive.test.ts:375×667/812/1280`, `s4-management-hardening:10 widths without 748`). Every shipped web route was re-checked at 320/375/390/414/600/799/800/1024/1440/1920 **plus** the 748×1366 reproduction case, with fixed/sticky headers, bottom nav, save/review bars, dialogs/sheets, toasts, camera/scanner overlays, and scroll behavior measured.

- **Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-management-implementation`
- **Branch / HEAD:** `feat/s4-12-shadcn-migration` / `d97af43`
- **Server:** `http://127.0.0.1:8797` (`wrangler dev --port 8797`, `workerd` LISTEN 8797)
- **Date:** 2026-08-27
- **Before evidence:**
  - `docs/qa/screenshots/2026-08-27-responsive-sticky-overlays/` — 240+ PNGs (20 routes × 12 viewports, plus `-full.png` for 748×1366 & 390×844 critical overlays)
  - `docs/qa/2026-08-27-responsive-sticky-overlays-evidence.json` — per-route/viewport geometry JSON (viewport, horizontalOverflow, shellContent.padBottom, navPhone/navDesktop/shellHeader/stickyBar/reviewPanel/policyToolbar rects, fixedCandidates[], bottomCoverPx/Pct, combinedBottomOcclusion)
  - `docs/qa/2026-08-27-sticky-layer-inventory.md` — static inventory of every `position: fixed|sticky|absolute` + importer trace

## 1. Executive summary

**Reproduced at 748×1366.** On every `<800px` viewport, `web/app/management/permissions-panel.module.css:648:.reviewPanel` (`position: sticky; bottom: calc(5.1rem + env(safe-area-inset-bottom,0px)); z-index:2`) plus `web/app/globals.css:147:.nav-phone` (`position: fixed; z-index:100; bottom: calc(0.625rem + env(safe-area-inset-bottom,0px)); height:62px`) stack at the bottom. `.reviewPanel` has **no `max-height` and no `overflow`** (`648-660`) and its inner `.changeSummary ul` (`689-708`) grows with dirty changes. At 748×1366 with 2 toggles it is ~238px (17.4% of 1366) and with 8 changes ~408px (29.9%), plus 62px dock = 300–470px total (22–34.4%). On 320×568 the same is 52.8–82.7% (or >100% with 8 changes) — literally covers the page.

**Systemic.** Two primitives share hard-coded `bottom: 5.1rem`: `web/app/management/management-action-framework.module.css:52:.stickyBar` (fixed, z-index 25, used by `web/lib/approval-queue.tsx:768:ManagementStickyActionBar`) and `web/app/management/permissions-panel.module.css:649:.reviewPanel` (sticky, z-index 2, local to `web/app/management/permissions-panel.tsx:526:aside`). Neither obeys a shared `max-height/overflow` contract nor is accounted for in `web/app/globals.css:361:.shell-content { padding-bottom: calc(84px + env(safe-area-inset-bottom,0px)) }` which only reserves the dock.

**Other routes:** No other shipped route mounts a viewport-bottom in-page action surface today. Scanner/camera/sheet/dialog/toast surfaces are modal or in-flow with explicit reserves and are PASS.

**Smallest safe fix:** One shared bottom-action utility (max-height + overflow-y + tokenized bottom offset) consumed by both `.stickyBar` and `.reviewPanel`, plus matching `padding-bottom / scroll-padding-bottom` bumps on their scroll containers. Explicit exceptions for dock, header, toolbar, modals.

## 2. Methodology

- **Server & fixtures:** `wrangler dev --port 8797` via `worker.ts` (`run_worker_first: ["/api/*"]`). Authenticated routes exercised with `E2E_admin` (`tests/e2e/dev-fixtures.ts`). Playwright `chromium` headless; for auth routes `localStorage["efcc_auth_active"]="1"` + `**/*` routed through `stubRoute()` mirroring real shapes: `GET /api/v1/auth/me → {requestId,data:{user,sections,navigation}}` (`web/lib/api.ts:AuthMeResult` → `web/lib/session.ts:buildBootstrap`, fixture from `web/lib/permissions-panel.test.tsx:50-166`), `POST /api/v1/auth/refresh`, `GET /api/v1/programs/account-permissions → {requestId,data:VIEW}` with correct `VIEW={accounts:[{userId,name,role:"admin|department-manager|staff",departments}],roles:[{key,assignmentState}],policy:{revision,actor:{role:"Admin",canRead,canEdit},capabilities}}` plus 25 dummy caps for stress, plus account-directory/registration-queue/home-content/attendance stubs.
- **Viewports:** 320×568, 375×667, 375×812, 390×844, 414×896, 600×800, **748×1366 (user report)**, 799×1200, 800×1200 (rail breakpoint), 1024×768, 1440×900, 1920×1080.
- **Probe (`tmp-audit-runner2.mjs:measurePage`):** `getBoundingClientRect()` for `.nav-phone` (fixed dock), `[class*="stickyBar"]` (fixed bar), `[class*="reviewPanel"] || aside[role="region"]` (sticky review), `[class*="policyToolbar"]` (sticky top), `#shell-content` padBottom, `fixedCandidates[]` (position fixed|sticky visible), `bottomCoverPx = max(vh - fixed.y)` for fixed y>vh*0.5, `combinedBottomOcclusion=(review||sticky||0+nav)/vh`, `horizontalOverflow=max(scrollWidth)-vw`. Screenshots at `scrollTop=250` inside `#shell-content`; dirty induced via `button[aria-pressed]` and `input[type="checkbox"]`.
- **Code trace:** `grep -rn "position:\s*\(fixed\|sticky\)"` + `ast_grep` for `ManagementStickyActionBar`, `.reviewPanel`, `.nav-phone`, `.shell-content`.

## 3. Shared primitives

| ID | File:symbol | Position | Anchor | z | Reserve | Callers | Violation |
|---|---|---|---|---|---|---|---|
| S-01 dock | `globals.css:147:.nav-phone` | fixed | `bottom:calc(0.625rem+env(safe-area))` height 62 | 100 | `.shell-content:361` reserves 84px+safe | `lib/nav-bar.tsx`, `lib/app-shell.tsx:70` | — healthy |
| S-02 outlet | `globals.css:356:.shell-content` | flex1 overflow-y:auto | `pad-bottom 84px+safe` on <800 else 0 | — | — | `lib/app-shell.tsx:70` | Only S-01, not M-01/M-05 |
| M-01 bar | `management-action-framework.module.css:52:.stickyBar` | fixed | `bottom:calc(5.1rem+env(safe-area))` 58px | 25 | none | `lib/approval-queue.tsx:768` only | No max-height/overflow, duplicates 5.1rem |
| M-05 review | `permissions-panel.module.css:648:.reviewPanel` | sticky | `bottom:calc(5.1rem+env(safe-area))` | 2 | `policyLayout:891` pad 12rem (192px) | `permissions-panel.tsx:526` only | No max-height/overflow, 12rem <408px worst |
| M-02 toolbar | `permissions-panel.module.css:441:.policyToolbar` | sticky top:0 z3 | — | — | — | `permissions-panel.tsx:459` | healthy |
| O-01 attention | `globals.css:370:.attention-overlay` | fixed inset0 z200 | modal | — | — | `lib/attention-panel.tsx` | expected modal |
| O-02 dialog/sheet | `components/ui/dialog.tsx:42,63` `sheet.tsx:40,64` | fixed | modal | 50 | — | `approval-queue.tsx:834` etc | expected modal |
| C-01 camera | `lib/attendance-panel.module.css:258:.cameraStage` | in-flow | `min-height:min(760px,calc(100dvh-84px-safe))` | — | explicit dock reserve | `attendance-panel.tsx` | healthy |

Hard-coded `5.1rem` duplication: `management-action-framework.module.css:56` and `permissions-panel.module.css:650`.

## 4. Route-by-route

### 4.1 Unauthenticated (no dock)

| Route | State | 320-1920 occlusion | File:symbol | Severity | Before evidence | Observed |
|---|---|---|---|---|---|---|
| `/` login | signed-out | 0% all widths | `app/page.tsx:LoginPage` | PASS | `login-320x568.png` … `login-748x1366.png` | No bottom surface, `horizontalOverflow=0` |
| `/register` | form | 0% | `app/register/page.tsx` | PASS | `register-*.png` | same |
| `/guest-check-in` | initial/validation/success/duplicate/chooser/long-name | 0% fixed; compact `max-height:640px` tier keeps submit above fold | `app/guest-check-in/page.tsx` + `lib/attendance-panel.module.css:18` | PASS | `guest-check-in-*.png` | No fixed bar; `horizontalOverflow=0` |
| `/prototype` | gallery | 124px overflow at 320, 69 at 375, 54 at 390, 30 at 414, 0 ≥600 | `app/prototype/page.tsx` `prototype.module.css:925:.navPhone sticky bottom:0` | Minor | `prototype-320x568.png` shows horizontal scrollbar | Live-only prototype overflow, not release gate |
| `/permissions` | redirect → `/management?module=permissions` | — | `app/permissions/page.tsx` | PASS | `permissions-redirect-*.png` | same as permissions below |

### 4.2 Shell chrome (every auth route)

| Viewport | header h | nav h | padBottom | bottomCoverPx | bottomCover% | horizontalOverflow |
|---|---|---|---|---|---|---|
| 320×568 | 48 | 62 | 84px+safe | 72 | 12.7% | 0 |
| 375×667 | 48 | 62 | 84px | 72 | 10.8% | 0 |
| 375×812 | 48 | 62 | 84px | 72 | 8.9% | 0 |
| 390×844 | 48 | 62 | 84px | 72 | 8.5% | 0 |
| 414×896 | 48 | 62 | 84px | 72 | 8.0% | 0 |
| 600×800 | 48 | 62 | 84px | 72 | 9.0% | 0 |
| **748×1366** | 48 | 62 | 84px | **72** | **5.3%** | **0** |
| 799×1200 | 48 | 62 | 84px | 72 | 6.0% | 0 |
| 800×1200 | — rail | 0 | 0 | 0 | 0% | 0 |
| 1024×768 | — | 0 | 0 | 0 | 0% | 0 |
| 1440×900 | — | 0 | 0 | 0 | 0% | 0 |
| 1920×1080 | — | 0 | 0 | 0 | 0% | 0 |

Dock alone is healthy (`globals.css:147,356`). Bug is additional bottom layers at same `5.1rem`.

### 4.3 Management

| Route | Module state | With surface | Combined vs viewport | 320×568 | **748×1366** | 800×1200 | File:symbol | Severity |
|---|---|---|---|---|---|---|---|---|
| `/management` hub | 3 groups 7 rows | none | 12.7% | 72px | 5.3% | 0% | `app/management/management-hub.tsx` | PASS |
| `?module=accounts` | directory/paging/detail | none | same | PASS | PASS | sticky `detail top:88px` healthy | `account-directory-panel.tsx/.module.css:412` | PASS |
| `?module=members` | roster | none | same | PASS | PASS | — | `member-directory-panel.tsx` | PASS |
| `?module=home-content` | editor | none (in-flow `.actions`) | same | PASS | PASS | — | `home-cms-editor.tsx/.module.css:332` | PASS |
| `?module=attendance` | operator chooser | none | same | PASS | PASS | — | `lib/attendance-operator-panel.tsx` | PASS |
| `?module=settings` | hubs | none | same | PASS | PASS | — | `settings-hub.tsx` | PASS |
| **`?module=approvals`** queue | **tray collapsed** `ManagementStickyActionBar` `fixed bottom:5.1rem 58px z25` | 120px | 21.1% (120/568) | **8.8% (120/1366)** | PASS (floats `right:1rem bottom:1rem`) | `lib/approval-queue.tsx:768` `management-action-framework.module.css:52` | **Major collapsed / Blocker expanded** |
| | **tray expanded** + `trayItems` ~180px extra → ~238px bar | 300px | **52.8% (300/568)** | **21.9% (300/1366)** | same | same | **Blocker expanded phone** |
| **`?module=permissions` roles list** | `screen="roles"` | none | 12.7–5.3% | PASS | PASS | — | `permissions-panel.tsx:678:RoleList` | PASS |
| **permissions role detail / assigned** | detailActions in-flow | none | same | PASS | PASS | — | `740:RoleDetail` `834:AssignedAccounts` | PASS |
| **permissions · dirty collapsed** (`reviewPanel` sticky `bottom:5.1rem` z2, no max-height, collapsed `changeSummary` hidden, height ~238px) | sticky 238px + dock 62 =300px | **52.8% at 320×568** (300/568) | **22.0% at 748×1366** (300/1366) | **0% desktop** (`position:static` at 800, `sticky top:1rem` at 1024) | `permissions-panel.tsx:372:PermissionPolicy` `.module.css:648:reviewPanel` `:889:policyLayout` | **Blocker phone collapsed** (last rows need scroll past 12rem=192px reserve, short 46px) / **Major at 748 collapsed** (visually huge, fused to dock — photo) |
| **permissions · dirty expanded** (`reviewOpen=true`, `檢視變更→隱藏變更`, `ul` visible, each `li` ~45px; 2 changes +90→328px panel →390 total; 8 changes +360→598px →660 total) | 2 changes: 390px → **68.7% at 320** (390/568) **28.5% at 748** (390/1366); 8 changes: 660px → **>100% at 320** **48.3% at 748** (660/1366); `policyLayout` 192px short 136–468px, no `overflow-y` on panel so save button not scrollable | **>>> BLOCKER <<< at all phone widths (320–799)** — **748×1366 photo is this state** (2–4 changes, ~300–380px panel fused to dock) | same | same | same | **Blocker** |

Desktop exceptions ≥800px: both overlays leave bottom stack (`reviewPanel:static→sticky top:1rem`, `stickyBar:right:1rem bottom:1rem`).

### 4.4 Other auth routes

| Route | Phone | Desktop | File:symbol | Severity | Before evidence |
|---|---|---|---|---|---|
| `/home` | dock only | rail | `app/home/page.tsx` | PASS | `home-*.png` |
| `/programs` | dock only (runner showed loading gap at 320/375 due to stub for `/api/v1/programs/*` but screenshots show shell+ skeleton, no overlay — code confirms no bar) | rail | `app/programs/page.tsx` | PASS | `programs-*.png` |
| `/notices` | dock only | rail | `app/notices/page.tsx` | PASS | `notices-*.png` |
| `/messages` | dock only | rail | `app/messages/page.tsx` | PASS | `messages-*.png` |
| `/profile` | dock only (QR 220px fixed) | rail | `app/profile/page.tsx` | PASS | `profile-*.png` |
| `/profile/settings` | dock only | rail | `app/profile/settings/page.tsx` | PASS | `profile-settings-*.png` |
| `/scanner` | Phone dock + `cameraStage` reserves `calc(100dvh-84px-safe)` correctly (72px cover only) ; Desktop rail | — | `app/scanner/page.tsx` `lib/scanner-boundary.tsx` `attendance-panel.module.css:258` | PASS | `scanner-*.png` all 12 viewports |

### 4.5 Dialogs/sheets/toasts/attention

| Surface | Mounted? | Position | Severity |
|---|---|---|---|
| `dialog.tsx:DialogOverlay/Content` (`fixed inset-0 z50`) | only when `approval-queue.tsx:834:dialog.confirmDialog` open | modal full-screen with backdrop | PASS (expected modal) |
| `sheet.tsx` `ManagementFilterSheet` (`fixed inset0 z110 max-height:82dvh`) | closed in screenshots | modal bottom-sheet on phone / centered desktop | PASS |
| `globals.css:370:.attention-overlay` z200 | bell not clicked (closed) | modal drawer | PASS |
| Toasts (`@radix-ui/react-toast` in lockfile but no `toast.tsx`, no `useToast`) | none | — | PASS |

**Scroll:** `globals.css:348:.shell {height:100dvh flex column overflow:hidden}` + `.shell-content {flex:1 overflow-y:auto}` is sole scroller. `permissions-panel.module.css:892:scroll-padding-bottom:calc(12rem+env(safe-area))` is 192px while expanded panel is 328–598px → last 136–406px of rows occluded until panel collapsed.

## 5. Root-cause verdict

**Shared 90%:** No shared contract for bottom-anchored in-page action surfaces. `.stickyBar` and `.reviewPanel` duplicate `5.1rem` without token, max-height, overflow, or pad coordination. `shell-content` only reserves dock.

**Page-specific 10%:** `.reviewPanel` unbounded grow (no max-height, 100% save button, `changeSummary ul` unbounded) and `approval-queue.tsx:802:trayItems` unbounded when `trayOpen`.

## 6. Exact file:symbol

| Symbol | File | Lines | Role |
|---|---|---|---|
| `.nav-phone` | `web/app/globals.css` | 147-164 | dock ref |
| `.shell-content` | `web/app/globals.css` | 356-368 | outlet reserve 84px+safe |
| `.shell` | `web/app/globals.css` | 348-353 | flex host |
| `.stickyBar` | `web/app/management/management-action-framework.module.css` | 52-68 | fixed bar bug |
| `ManagementStickyActionBar` | `web/app/management/management-action-framework.tsx` | 62-72 | wrapper, only caller `lib/approval-queue.tsx:768` |
| `.reviewPanel` | `web/app/management/permissions-panel.module.css` | 648-660 | sticky review bug |
| `.policyLayout` | same | 487-492, 889-894 | 12rem reserve under-count |
| `.policyToolbar` | same | 441-453 | sticky top healthy |
| `.changeSummary`, `.saveButton` | same | 689-783 | unbounded inner |
| `PermissionPolicy` aside | `web/app/management/permissions-panel.tsx` | 372-639 esp 526-636 | only caller of reviewPanel |
| `ApprovalQueue` tray | `web/lib/approval-queue.tsx` | 767-832 | only caller of stickyBar |
| `.tray`, `.trayItems` | `web/lib/approval-queue.module.css` | 483-539 | unbounded tray |

Importers: `ManagementStickyActionBar` → `lib/approval-queue.tsx:9` only; `.reviewPanel` → `permissions-panel.tsx:529` only; `.nav-phone/.shell-content` → `lib/app-shell.tsx:58,70` + `lib/nav-bar.tsx`.

## 7. Before-evidence index

| Evidence | Path |
|---|---|
| Screenshots (20 routes × 12 viewports, +full) | `docs/qa/screenshots/2026-08-27-responsive-sticky-overlays/management-permissions-320x568.png` … `management-permissions-748x1366.png`, `management-permissions-748x1366-full.png`, `management-approvals-320x568.png` … `management-approvals-748x1366-full.png` etc (244 PNGs) |
| Geometry JSON | `docs/qa/2026-08-27-responsive-sticky-overlays-evidence.json` (240 entries; each: viewport, route, file, measure{horizontalOverflow, shellContent{padBottom}, navPhone{h}, stickyBar{h}, reviewPanel{h}, bottomCoverPx/Pct, combinedBottomOcclusion}) |
| Layer inventory + trace | `docs/qa/2026-08-27-sticky-layer-inventory.md` |

Runner log sample: `bottomCoverPx=72` nav; `combinedBottomOcclusion` 52.8% at 320 collapsed permissions, 22% at 748 collapsed, 68.7% expanded 2 changes at 320, 48.3% expanded 8 changes at 748. Prototype `horizontalOverflow=124` at 320.

## 8. Preservation

New files only under `docs/qa/screenshots/2026-08-27-responsive-sticky-overlays/` and `docs/qa/2026-08-27-responsive-sticky-overlays-evidence.json` plus `docs/qa/2026-08-27-sticky-layer-inventory.md` and this report; no production code/tests/package/existing audits modified, no commits.

## 9. Fix pointer

Shared bottom-action utility `max-height:min(48dvh,420px); overflow-y:auto;` + tokenized `bottom` + pad/scroll-pad bumps; see `docs/omp-plans/2026-08-27-responsive-sticky-overlays.md`.

*Generated 2026-08-27 from 127.0.0.1:8797. 748×1366 treated as ground truth.*
