# Minimal Product Redesign Contract & All-Surface Acceptance Matrix

**Feature:** Minimal product redesign contract and all-surface acceptance matrix (Issue #179)  
**Parent Maps:** [Map #117](https://github.com/Noahlw/efcc/issues/117) (Frontend Migration & Feature Ownership), [Map #158](https://github.com/Noahlw/efcc/issues/158) (D1 Identity, Login & Registration Foundation)  
**Design Authority:** `DESIGN.md` & `.impeccable/design.json` (Variant A: Official Civic Minimal)  
**Spec Authority:** Spec 000 (product truth), Spec 074 (shell responsive/accessibility baseline), Spec 071 (accessibility criteria), ADR-0017 (static export), ADR-0018 (HTTP boundary), ADR-0020 (D1 identity split)  
**Date:** 2026-08-06  
**Status:** **IN REVIEW** — Variant A is selected; the contract remains open on Issue #179 while the grilling session confirms the full domain vocabulary and acceptance boundary.  

---

## 1. Product Stance & Brand Identity

1. **Official Church Name:** The primary brand title across all surfaces is **中國基督教播道會顯恩堂** (full church title). Shorter marks such as `顯恩堂` or `顯恩堂系統` are legacy shorthand only and must not replace the official name in headers.
2. **System Stance:** An internal operational system for Members, Program Leaders, Staff, and Admins. It refuses SaaS marketing hero templates, commercial CTAs ("Try Free"), fake testimonials, and decorative pastel gradients.
3. **Replaceable Mark Slot:** The squar-cut seal container (`6px` radius, `恩` mark) is structured as a clean replaceable component slot (`SealSlot`) ready for future official church icon replacement.
4. **Language & Timezone:** Cantonese Chinese (`zh-Hant`) is the primary product language. Timestamps and calendar schedules use Church Time: `Asia/Hong_Kong`, 24-hour clock.

---

## 2. Design System Primitives (Variant A: Official Civic Minimal)

### Color Tokens
- `--surface`: `#f4f5f3` (Base neutral civic surface)
- `--surface-raised`: `#ffffff` (Card, panel, and input background)
- `--ink`: `#171a1d` (Primary typography and high-contrast titles)
- `--ink-muted`: `#59636a` (Secondary text, metadata, and field labels)
- `--line`: `#d6dcde` (Hairline section dividers)
- `--line-strong`: `#aeb8bc` (Panel and input borders)
- `--accent`: `#9c302c` (Restrained cinnabar red action accent)
- `--accent-deep`: `#76231f` (Hover and active cinnabar state)
- `--focus`: `#176a87` (High-contrast focus ring teal)

### Typography Hierarchy
- **Stack:** `-apple-system`, `BlinkMacSystemFont`, `"PingFang TC"`, `"Noto Sans TC"`, `"Microsoft JhengHei"`, `Arial`, `sans-serif`
- **Display:** `clamp(2.65rem, 6vw, 5rem)`, weight 800, `line-height: 1.08`, `letter-spacing: -0.035em`
- **Title:** `1.5rem`, weight 800, `line-height: 1.25`
- **Subtitle:** `1.35rem`, weight 800
- **Body:** `1rem`, weight 400, `line-height: 1.6`
- **Label:** `0.9rem`, weight 700

### Shapes & Depth
- **Border Radius:** `8px` (`rounded-sm`) for inputs, buttons, and badges; `12px` (`rounded-md`) for cards and panels.
- **Elevation:** Flat civic surfaces with hairline borders (`1px solid #d6dcde` / `#aeb8bc`). Depth is conveyed through background contrast (`#f4f5f3` vs. `#ffffff`) rather than heavy drop shadows.
- **Touch Targets:** All interactive elements maintain `min-height: 44px` (WCAG 2.5.5).

### Role Boundary
- **Global Role:** Every account has exactly one canonical global Role: `Admin`, `Staff`, or `Member`.
- **Registration Default:** Self-service registration and approval create `Member`; elevated Role assignment is outside the approval transition.
- **Program Leader:** A separate per-Program relationship under Program detail/management; it is never stored as the account's global Role.
- **Department Model:** Department is a first-class, user-extensible parent of Programs. Initial rollout is `青區` (`Active`), with `成區` and `兒區` (`PendingDevelopment`); permitted users may add Departments and Programs through capability-gated management without changing global Roles.
- **Department Modules:** A Department composes product-owned modules such as Program Catalog, Enrollment, Events, Attendance, and future Custom Forms. Permitted users may enable or configure existing modules, but cannot create executable modules, arbitrary D1 tables, or new authorization rules from the UI.
- **Activity Model:** Programs use descriptive, user-configurable Activity Categories and one fixed behavior type: `Recurring` or `OneOff`. Both types may own dated Events; recurring schedules and one-off Event creation are module behavior, not category semantics. Program lifecycle (`Draft`, `Active`, `Archived`), discoverability (`Listed`, `Unlisted`), and enrollment mode (`MemberRequest`, `ManagerOnly`) are independent settings.
- **Enrollment Approval:** Member self-enrollment creates a `Pending` request. An active actor with the effective management/approval capability for that exact Program may approve or reject it; an authorized manager may also use the audited direct-active assisted path.
- **Enrollment Record Model:** `EnrollmentRequest` and `Enrollment` are separate records. Requests preserve submission/decision history; approved or direct-manager actions create Enrollment records; cancellation is soft and re-enrollment creates a new record.
- **SQL Invariant:** The management specification owns the D1 migration and `CHECK (role IN ('Admin', 'Staff', 'Member'))` enforcement. The current D1/API `Teacher` spelling is transitional and must not remain the deployed contract.
- **Permission Policy:** The companion management specification must provide configurable Role-to-capability policy management under the hierarchy `Admin > Staff > Member`: Admin may edit Admin, Staff, and Member policies; Staff may edit Member policy; Member may edit none. Admin-policy edits must preserve at least one Admin policy editor. A lower Role cannot edit its own or a higher Role's policy. For a specific Program, every active actor whose effective global-role policy or scoped Program Leader grant includes the required management/approval capability may approve or perform the permitted Program action; authorization is not a hard-coded role allowlist. This policy controls what each Role sees and may use; it does not permit client-side authorization bypass or mutation of the account's global Role through approval.
- **Permission Data Shape:** The target relational shape is a capability catalog plus `role_capabilities` assignments, with `program_leader_assignments` remaining a separate Program-scoped relationship. Users may assign existing capability keys; the system specification owns introducing new capability keys.
- **Program Data Strategy:** Issue #184 conditionally makes D1 canonical for a new, empty Department/Programs/Enrollment domain. No legacy Departments, Programs, Program Leaders, Enrollments, or domain audit rows are imported. The existing Google Sheet remains out-of-band historical reference only; it is not a staging adapter or dual-write target, and agents must not mutate it.

---

## 3. All-Surface Acceptance Matrix

| # | Surface / State | Domain Category | Visitor Mode | Primary Task | Required DOM Elements & States | Responsive Behavior (375px vs 1280px) | Accessibility Proof | Implementation Owner Ticket |
|---|---|---|---|---|---|---|---|---|
| **S1** | **Login (登入)** | Auth Surface | Operate / Read | Direct sign-in | Header title `中國基督教播道會顯恩堂`, `SealSlot`, username & password inputs with programmatically associated `<label htmlFor="...">`, submit `登入` | **Desktop (≥800px):** 2-column layout (copy left, form right). **Phone (<800px):** Form stacked FIRST at top of screen; max 400px width. | `getByLabelText("用戶名稱")`, `getByLabelText("密碼")`, min-height ≥44px, `:focus-visible` ring | [CF0-08 / Issue #164](https://github.com/Noahlw/efcc/issues/164) |
| **S2** | **PIN Upgrade (設定新密碼)** | Auth Surface | Operate | Forced credential upgrade | Legacy member username (disabled input), legacy PIN input (`#prototype-upgrade-pin`), new password input (`#prototype-upgrade-new`), submit `設定新密碼並登入`, alert notice | Single centered card (max 440px), no-scroll on 667px height phone frame | `role="alert"` for upgrade notice, inputs properly labeled, `autoComplete` attributes set | [AUTH-01 / Issue #159](https://github.com/Noahlw/efcc/issues/159) |
| **S3** | **Registration (註冊帳戶)** | Auth Surface | Operate | Self-service account application | Chinese name, username, phone, and password inputs; submit `提交註冊申請` | Single centered card, fits within phone screen height without overflow | All inputs have `htmlFor`/`id` matching, inputs ≥44px height | [AUTH-05 / Issue #163](https://github.com/Noahlw/efcc/issues/163) |
| **S4** | **Approval Queue (審核隊列)** | Auth Surface | Operate | Admin/Staff registration review | Header with badge count (`N 筆待審核`), structural data rows with action buttons (`批准 Member`, `拒絕`) | Desktop side-by-side action buttons; Phone stacked action buttons with touch targets ≥44px | Accessible button text, semantic list structure; direct unauthorized access renders Forbidden | [AUTH-05 / Issue #163](https://github.com/Noahlw/efcc/issues/163) |
| **S5** | **Profile (個人檔案)** | Section | Operate / Read | View member details & check-in QR | Avatar, name/username block, role tag (`Member / Staff / Admin`), status/phone grid, **centered 220×220px square QR code** | Fits phone screen (667px height) **without page scroll** (`scrollHeight <= offsetHeight`); QR code `aspect-ratio: 1/1` | `alt` / ARIA description on QR slot, clear text hierarchy | [AUTH-01 / Issue #159](https://github.com/Noahlw/efcc/issues/159) |
| **S6** | **Programs (課程與活動)** | Section | Read / Operate | Browse programs & enrollments | Header `課程與活動`, authentic placeholder `內容建置中` (transitional section) | Fits shell without overflow, top/bottom navigation adapts; unauthorized deep links are Forbidden | Heading `h2`, semantic landmark structure | [Issue #184](https://github.com/Noahlw/efcc/issues/184) |
| **S7** | **Events (聚會管理)** | Section | Operate | View gatherings & check-in status | Header `聚會管理`, authentic placeholder `內容建置中` (transitional section) | Fits shell without overflow; unauthorized deep links are Forbidden | Heading `h2`, semantic landmark structure | Map #117 / Map #158 |
| **S8** | **Scanner (掃描簽到)** | Section | Operate | Camera QR check-in | Header `掃描簽到`, authentic placeholder `內容建置中` (transitional section) | Viewfinder scales within phone bounds; unauthorized deep links are Forbidden | ARIA label on camera origin container | Map #117 |
| **S9** | **Care (關懷儀表板)** | Section | Operate | Pastoral follow-up | Header `關懷儀表板`, authentic placeholder `內容建置中` (transitional section) | Fits shell without overflow; unauthorized navigation is hidden and direct links are Forbidden | Heading `h2`, semantic landmark structure | Map #117 |
| **S10** | **Permissions (權限與角色)** | Section | Read | View role-aware access state | Header `權限與角色管理`, role/access summary or authentic placeholder `內容建置中`; no role mutation in the UI-rebuild spec | Fits shell without overflow; unauthorized navigation is hidden and direct links are Forbidden | Heading `h2`, semantic landmark structure | Companion Program/Admin Management specification |
| **S11** | **Loading (載入中)** | System State | State | Session restore / spinner | Centered loading spinner (`.spinner`), text `正在還原工作階段…` | Centered vertically in viewport | Announced via `LiveRegion` (`COPY.restore.loading`) | [CF0-06 / Issue #142](https://github.com/Noahlw/efcc/issues/142) |
| **S12** | **Empty (無資料)** | System State | State | Data empty state for built views | Header, icon/graphic, empty text `目前沒有課程資料。` | Centered text layout | High contrast text (≥4.5:1), screen-reader readable | Spec 076 / Spec 079 |
| **S13** | **Error / 403 (錯誤 / 存取被拒)** | System State | State | Forbidden / error state | Alert block `您沒有權限執行此操作。`, secondary action `返回個人檔案` | Centered layout | `role="alert"` on error block, action button ≥44px | Spec 069 / Spec 074 |
| **S14** | **Recovery (還原與重試)** | System State | State | Transient network error recovery | Alert block `無法連接伺服器，請檢查網路後再試。`, primary action `重試連接` | Centered layout | `role="alert"` on alert block, submit button ≥44px | Spec 069 / Issue #182 |
| **S15** | **Shared Shell (應用程式外殼)** | Shared Shell | Shell | App navigation | Header (`MockHeader`), Nav bar (`MockNav`). **Phone (<800px):** Fixed bottom nav bar (`.navPhone`). **Desktop (≥800px):** Top/side rail nav (`.navDesktop`). Unauthorized Sections are omitted from navigation; direct links still receive server authorization. | Automatic breakpoint transition at 800px width | `aria-label="主要導航"`, `aria-current="page"` on active item, touch targets ≥44px | [CF0-06 / Issue #142](https://github.com/Noahlw/efcc/issues/142) |
| **S16** | **Account Settings (帳戶資料)** | Auth Surface | Operate | Change login username or password | Profile sub-surface: section title 帳戶資料, two forms (username: single input; password: 目前密碼 + 新密碼 with the ≥8-char hint 密碼須至少 8 個字元。, no confirmation field). Inline errors: 此用戶名稱已被使用 (409), 目前密碼不正確 (422). Success state 已更新 then route to login with one-time notice 帳戶資料已更新，請重新登入 (sessionStorage-carried). sessionRevoked transitions the client to signed-out immediately | Single-column stacked forms; cards ≤600px on desktop; fits phone width without horizontal overflow | Labeled inputs (htmlFor/id), inline errors role="alert", touch targets ≥44px, :focus-visible rings, prefers-reduced-motion support; no password/hash/token/secret in UI output | [UI-04 / Issue #196](https://github.com/Noahlw/efcc/issues/196) |

---

## 4. Specification Boundary

This contract intentionally separates two related deliverables:

1. **Current UI Rebuild Specification (this document):** Variant A visual language, Auth Surface and Section taxonomy, Shared Shell behavior, role display, server-authorized navigation visibility, direct-link Forbidden behavior, responsive behavior, and accessibility states. It does not define role mutation or Program Leader assignment.
2. **Program and Admin Management Specification (companion document):** D1 role migration from `Teacher` to `Staff`, SQL enum/check enforcement, account-role administration, hierarchical Permission Policy management, audited role/policy changes, and the frontend management contract. Its Program Detail and Program Leader management behavior must consume the domain decisions in Issue #184; it must not redefine the Program-domain data lifecycle or migration boundary. Policy editing follows `Admin > Staff > Member`: Admin may edit all three policies with last-admin-editor protection; Staff may edit Member policy; Member may edit none. It must preserve the boundary that Program Leader is not a global Role. Issue #184 is the decision authority for the expanded Programs/Enrollment domain slice, including Program Detail relationships, Program Leader lifecycle, enrollment approval, and D1/Sheets ownership.

The ownership split is deliberate: D1 owns identity, global Roles, capability policy, policy audit history, and—under the conditional #184 restart—the complete new Programs/Enrollment domain from an empty baseline. The legacy Google Sheet is historical reference only and is not read or written by the new domain path. Issue #184 decides the Program Detail relationships and enrollment lifecycle; the companion document defines the management surface and consumes those decisions without moving global Role management into the Program domain.

The prototype's Permissions view is a basic UI placeholder. It is evidence for the shell's visual treatment only, not evidence that role or Program Leader administration has been designed or implemented.

## 5. Verification Boundary & Test Strategy

1. **Static Analysis & Types:** `pnpm --dir web typecheck` must pass with 0 diagnostics.
2. **Component Tests:** `pnpm --dir web test:components` must pass 100% (asserting default auth contracts, session restore, and copy constants).
3. **Build Target:** `pnpm --dir web build` must generate static routes cleanly ( preredering all static routes without runtime SSR dependencies per ADR-0017).
4. **Impeccable Detector:** `node .agents/skills/impeccable/scripts/detect.mjs --json` must return zero layout-thrashing or design anti-pattern findings.
5. **Headless Gate / E2E:** Deployed Worker/assets verification must assert each criterion in the observable DOM before `READY` handoff.
