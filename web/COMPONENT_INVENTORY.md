# EFCC — Component Inventory (S1–S4) — shadcn migration

> **Source:** `web/components/ui/*` (vendored local shadcn primitives, 18 components). Generated 2026-08-27 from `feat/s4-12-shadcn-migration` (waves S1–S4). All shipped S1–S4 common visual elements are replaced by local shadcn primitives except the documented native retains below. Native retains are intentional: radio chooser (GOV.UK contract, ATT-02), selects with test contracts, and domain-row actions where a full Card/Button composition would hide list identity.

## S4 Phase A (ticket #477) additions

This section records the Phase A foundation contract: the Civic Minimal token contract, the primitives required by shipped Phase A callers, and the native-exception registry.

### Token contract (`web/app/globals.css`)

The complete Civic Minimal Tailwind token contract (TK-01) is declared on `:root` and consumed by the shell:

| Family | Tokens | Documented role |
| --- | --- | --- |
| Color | `--surface`, `--surface-raised`, `--ink`, `--ink-muted`, `--line`, `--line-strong`, `--accent`, `--accent-deep`, `--focus`, `--success(-surface/-border)`, `--error(-surface/-border)`, `--pending(-surface/-border)`, `--skeleton` | Civic Minimal palette (DESIGN.md / `.impeccable/design.json`) |
| Spacing | `--space-1` … `--space-9` (4–48px) | DESIGN.md spacing scale; shell modules consume these names |
| Typography | `--text-display/title/subtitle/body/label/caption`, `--leading-*`, `--weight-*` | DESIGN.md type hierarchy |
| Target/control size | `--control-min-size: 44px`, `--control-radius` | DESIGN.md touch-target contract (≥44px) |
| Radius | `--radius-sm/md/pill`, `--radius-mark` | DESIGN.md shapes |
| Borders | `--border-hairline`, `--border-control` | Hairline dividers / functional control boundaries |
| Elevation | `--shadow-dock`, `--shadow-rail-active`, `--shadow-overlay` | Flat civic surfaces, restrained elevation |
| Widths | `--width-rail` (200px), `--width-container` (1180px), `--width-overlay` (420px) | Shell rail / content container / overlay panel |
| Layering | `--layer-dock` (100), `--layer-rail` (90), `--layer-offline-banner` (95), `--layer-overlay` (200) | Chrome z-order |
| Motion | `--duration-fast/med`, `--ease-standard` | Reduced-motion-aware transitions |
| Breakpoint | `--breakpoint-shell: 800px` (`@theme inline`) | Named 800px shell dock/rail transition (TK-06) |

The focused token test (`web/lib/shell/shell-tokens.test.ts`) asserts every family is declared and the named 800px breakpoint exists. The shell breakpoint test (`web/lib/shell/shell-breakpoint.test.ts`) asserts the single 800px transition.

### Primitive inventory (TK-02/TK-03)

Only primitives needed by at least one shipped Phase A caller are vendored/used; each entry names the owning caller and the variant in use.

| Primitive | Owning Phase A caller | Variant in use | Observable contract seam |
| --- | --- | --- | --- |
| `Button` (existing) | `lib/nav-bar.tsx` nav actions, `lib/shell-header.tsx` bell/close, `lib/recovery-view.tsx` retry | `ghost` nav item, `outline` close, `default` recovery | `web/lib/shell/authenticated-shell.test.tsx`, `web/lib/app.test.tsx`, `web/lib/components-contract.test.tsx` |
| `Dialog` (local shadcn/Radix) | `lib/attention-panel.tsx` attention dialog | Controlled `open`/`onOpenChange`; `DialogContent` with `attention-panel` and `attention-panel__overlay` Civic Minimal classes (both use the shell overlay layer above dock/rail) | Role/state (`role="dialog"`, labelled), keyboard (Escape), focus trap/restore, modal overlay — Radix Dialog contract; `web/lib/attention-panel.test.tsx`, `web/lib/shell/authenticated-shell.test.tsx`, `tests/e2e/shell-geometry.test.ts` (fixed overlay inside the viewport) |
| `Badge` (existing) | `lib/shell-header.tsx` bell count | `default` | `web/lib/app.test.tsx` |
| `Skeleton` (existing) | `lib/app-shell.tsx` loading shell | `rounded-full bg-[var(--skeleton)]` | `web/lib/app.test.tsx` |
| `Alert` (existing) | `lib/recovery-view.tsx` recovery state | `destructive` | `web/lib/app.test.tsx` |
| `LiveRegion` (shell-owned) | `app/layout.tsx` | single `output[role="status"][aria-live="polite"].sr-only` | `web/lib/app.test.tsx` RootLayout suite; `tests/e2e/responsive.test.ts` (one region) |

No new primitive file was vendored in Phase A: the Dialog primitive already existed in `web/components/ui/dialog.tsx` and is now consumed by a shipped caller (the attention dialog), which closes the previous inventory note that Dialog was vendored-but-unwired. The attention dialog's tab strip keeps explicit `role="tab"`/`aria-selected` semantics (its two tabs switch one panel; the shadcn `Tabs` primitive is already wired in shipped S2 callers and would duplicate this single-panel switch).

### Native-exception registry (TK-11)

Retained native controls in the Authenticated Shell, with documented reasons (reviewable, not auto-generated):

| Retained native control | Location | Reason |
| --- | --- | --- |
| Skip link `<a href="#shell-content">` | `lib/app-shell.tsx` | Document navigation anchor (semantic): a real anchor is the correct element for skip-to-content; a Button would break the "jump to landmark" contract. |
| Phone dock / desktop rail `<nav>` links | `lib/nav-bar.tsx` | Navigation landmark with `<a>` destinations — native anchors, not buttons; server-projected destinations must stay plain links (Spec 089). |
| Offline banner `role="status"` div | `lib/offline-banner.tsx` | Status region (polite) — a live-region status element, not an interactive control; native semantics required. |
| Live region `output[role="status"]` | `lib/live-region.tsx` | Spec 074 single polite region — native `output` + explicit role required; no control replacement exists. |
| RecoveryView `<main tabIndex={-1}>` | `lib/recovery-view.tsx` | Focusable region (not a control) — `tabindex` on a region, no Button replacement applies. |

Native retains elsewhere in the app (radio chooser GOV.UK ATT-02, selects with option-test contracts, domain-row buttons) remain as previously documented.

### Shell chrome behavior (TK-04/TK-05/TK-07/TK-08)

- **Phone dock / desktop rail:** `lib/nav-bar.tsx` renders ONE `nav#main-navigation` landmark; `app/globals.css` presents it as the fixed dock below 800px and the sticky rail at/above 800px. Exactly one navigation landmark at every width (screen readers never hear two).
- **Shell outlet/scroll:** `#shell-content` is the single scroll container; phone reserve `calc(84px + env(safe-area-inset-bottom))` clears the fixed dock; desktop reserve 0.
- **Safe-area reserve:** dock `bottom: calc(0.625rem + env(safe-area-inset-bottom))`; header/dock respect `viewport-fit=cover`.
- **Skip link:** first focusable element, targets `#shell-content`.
- **Offline/recovery:** `OfflineBanner` (shell-owned status) + `RecoveryView` (focus moved in, retry preserves session); one Live Region announces once per transition (TK-08).
- **Focus order:** skip link → primary nav → main → dock (phone). Tests: `web/lib/shell/authenticated-shell.test.tsx`.

## Vendored primitives available

`Button` `Input` `Textarea` `Select` `Checkbox` `Switch` `Badge` `Card` `Tabs` `Accordion` `Dialog` `AlertDialog` `Sheet` `Alert` `Skeleton` `Table` `ScrollArea` `Tooltip`

Active usage in shipped surfaces is a strict subset (see per-surface). `Select`/`Checkbox`/`AlertDialog`/`Sheet`/`Table`/`ScrollArea`/`Tooltip` are present in `web/components/ui` but not yet wired in shipped S1–S4 flows; native `<select>` and domain-row `<button>` remain where test contracts / a11y contracts require them.

---

## S1 — Shell / Auth / Profile

### Shell (`lib/app-shell.tsx`, `lib/shell-header.tsx`, `lib/nav-bar.tsx`, `lib/offline-banner.tsx`, `lib/forbidden-view.tsx`, `lib/attention-panel.tsx`, `app/globals.css`)

- **shadcn used:** `Button` (nav actions, shell header), `Badge` (identity chip), `Skeleton` (shell loading), `Alert` (offline/forbidden), `Dialog` (attention overlay, Phase A)
- **Native retains:** skip link `<a>`, nav `<a>` links, offline `role="status"`, live region `output` (see Phase A registry)

### Landing / Login (`app/page.tsx`)

- **shadcn used:** `Button` (submit, guest-check-in link via `asChild`, register link), `Input` (username/password, legacy upgrade fields), `Card` (form card, session-expired card), `Alert` (notice, error), `Skeleton` (restoring state)

### Profile — QR / Account (`app/profile/page.tsx`, `app/profile/account-settings.tsx`, `app/profile/settings/page.tsx`, `lib/recovery-view.tsx`)

- **shadcn used:** `Button` (sign-out, upgrade, recovery actions), `Badge` (status), `Card` (qrCard, detailsCard, settings cards), `Input` (account settings forms), `Alert` (error/notice)

---

## S2 — Home / Programs / Notices / Messages

### Home (`app/home/page.tsx`, `lib/announcement-detail.tsx`, `lib/feed-presentation.tsx`)

- **shadcn used:** `Badge` (enrolled state), `Button` (event/announcement/navigation actions), `Card` (event, venue, list, empty states), `Alert` (load recovery), `Skeleton` (loading)
- **shared presentation:** `FeedPresentation` owns feed state/focus/announcement semantics; Home keeps projection fetching, CTA validation, history, and domain links local. Tailwind utilities own layout.

### Programs — Boundary / Directory / Detail / Workspace

`lib/programs/*` — participant-default boundary (PUI-01) + management directory/detail/workspace.

- **shadcn used:** `Button` (all program/workspace actions, enrollment, attention), `Badge` (program status, attention counts), `Card` (directoryCard, participantDirectoryCard, workspace sections), `Input` (search, program form), `Textarea` (programForm, settings), `Alert` (boundaryState/error, intentNotice), `Skeleton` (directorySkeleton*, boundaryState), `Tabs` (program-workspace, programs-boundary)

### Notices (`app/notices/page.tsx`, `lib/notices-panel.tsx`, `lib/feed-presentation.tsx`)

- **shadcn used:** `Button` (mark-all, retry), `Badge` (unread count), `Card` (empty/list surfaces), `Alert` (read/load recovery), `Skeleton` (loading)
- **shared presentation:** `FeedPresentation` owns state/focus/announcement semantics; Notices keeps notice queries, read mutation, timestamps, and Programs/Profile destinations local. Tailwind utilities own layout.

### Messages (`app/messages/page.tsx`, `lib/messages-panel.tsx`, `lib/feed-presentation.tsx`)

- **shadcn used:** `Button` (retry/back), `Badge` (published date), `Card` (message/empty surfaces), `Alert` (load/intent recovery), `Skeleton` (loading)
- **shared presentation:** `FeedPresentation` owns state/focus/announcement semantics; Messages keeps announcement fetching, `messages-intent`, history, and HTTPS CTA validation local. Tailwind utilities own layout.

---

## S3 — Scanner / Guest

### Scanner — Self / Assisted / Operator (`app/scanner/page.tsx`, `lib/self-check-in-panel.tsx`, `lib/assisted-scanner-panel.tsx`, `lib/attendance-operator-panel.tsx`, `lib/attendance-panel.tsx`, `lib/attendance-scanner-ui.tsx`, `lib/attendance-roster.test.tsx`)

- **shadcn used:** `Button` (submit, cameraStop, confirmActions, modeSwitch), `Input` (code/entry), `Card` (card, confirmCard), `Alert` (cameraUnavailable, confirmError, chooserError), `Badge` (statusBadge, pill), `Skeleton` (chooserLoading)

### Guest Check-In (`app/guest-check-in/page.tsx`, `lib/attendance-panel.tsx` guest surface)

- **shadcn used:** `Button`, `Input`, `Card`, `Alert` (via shared attendance panel)

---

## S4 — Management

### Management Hub & Settings Hub (`app/management/page.tsx`, `app/management/management-hub.tsx`, `app/management/settings-hub.tsx`)

- **shadcn used:** none directly — hub is a composition of navigation cards; shared primitives are in child panels

### Member Directory (`app/management/member-directory-panel.tsx`, `app/management/directory-frame.tsx`)

- **shadcn used:** `Button`, `Input`; `DirectoryFrame` owns typed state slots, selection, pagination, and focus restoration while Member keeps its two-character search, rows, detail, URL, and permissions local

### Account Directory (`app/management/account-directory-panel.tsx`, `app/management/directory-frame.tsx`)

- **shadcn used:** `Button`, `Input`, `Select`; `DirectoryFrame` owns typed state slots, selection, pagination, and focus restoration while Account keeps `q`, `role`, `status`, `department`, detail queries, URLs, and permissions local

### Permissions & Roles (`app/management/permission-editor-panel.tsx`, `app/management/role-hierarchy-panel.tsx`)

- **shadcn used:** `Switch`, `Sheet`, `AlertDialog`, `Button`, `Input`, and `ActionSurface`; Permission Editor owns selected Role Definition draft/review state while identity remains server-authoritative

### Home CMS Editor (`app/management/home-cms-editor.tsx`)

- **shadcn used:** `Button`, `Input`, `Textarea`, `Card`, `ActionSurface`, `ManagementPageHeader` via Tailwind/token utilities; `home-cms-editor.module.css` deleted in Phase E and replaced with Tailwind — no module CSS remains. Template chooser and publish actions use `Button` with `aria-pressed` as before.

### Approval Queue & Detail (`lib/approval-queue.tsx`, `lib/approval-detail.tsx`, `lib/registration-form.tsx`)

- **shadcn used:** `ActionSurface`, `Button`, `Checkbox`, `Select`, `AlertDialog`, `Input`, `Textarea`, `Card`, `Alert`; domain selection, registration queries, confirmation copy, decision mutations, and conflict reconciliation remain local

---

## Summary statement

All shipped S1–S4 **common visual elements** (submit/primary actions, secondary/outline actions, text inputs, textareas, cards, badges, alerts, skeletons, tabs, accordion, switch, lists, and — since Phase A — the attention overlay dialog) are replaced by local shadcn primitives (`web/components/ui/*`) except the native retains documented above and in the Phase A native-exception registry. Native `<select>` remains in management and program filters where tests assert native option semantics; the GOV.UK radio chooser remains in the attendance domain; domain-row `<button>`s (`resultButton`, `roleLink`, `detailAction`, `eventButton`, `row`) remain where a list-identity affordance is required rather than a generic Button variant. Vendored but currently unused primitives — `Select`, `Checkbox`, `AlertDialog`, `Sheet`, `Table`, `ScrollArea`, `Tooltip` — are available for future waves and were not introduced where test or a11y contracts require native semantics.

## Layout vs. control split

| Module | Layout / domain classes kept | Control primitives replaced |
| --- | --- | --- |
| `app/page.tsx` | Tailwind page, header, main, bodyCenter, splitLogin, loginCopy, formCard, etc. | `Button`, `Input`, `Card`, `Alert`, `Skeleton` |
| `app/home/page.tsx`, `lib/announcement-detail.tsx`, `lib/feed-presentation.tsx` | Tailwind page/detail/feed layout and semantic state slots | `Badge`, `Button`, `Card`, `Alert`, `Skeleton` |
| `app/programs/page.tsx`, `lib/programs/*.tsx` | Tailwind page, card, directory, detail, workspace, and task layouts | `Button`, `Badge`, `Card`, `Input`, `Textarea`, `Alert`, `Skeleton`, `Tabs`, `Accordion` |
| `lib/attendance-panel.tsx`, `lib/attendance-scanner-ui.tsx`, `lib/self-check-in-panel.tsx` etc. | Tailwind page, card, camera, method, confirmation, chooser, roster layout via tokens — `lib/attendance-panel.module.css` deleted in Phase E | `Button`, `Input`, `Card`, `Alert`, `Badge`, `Skeleton` (native retains below) |
| `app/notices/page.tsx`, `lib/notices-panel.tsx`, `lib/messages-panel.tsx` | Tailwind page/list/detail layout and semantic state slots | `Button`, `Badge`, `Card`, `Alert`, `Skeleton` |
| `app/management/*` (Hub, Settings, DirectoryFrame, Home CMS) | Tailwind page, header, groupCard, row, workspace, detail, policyLayout via tokens — `app/management/management-hub.module.css` and `app/management/home-cms-editor.module.css` deleted in Phase E; `web/app/globals.css` holds only shell, safe-area and irreducible print/safe-area selectors, no route-specific CSS | `Button`, `Input`, `Select`, `Textarea`, `Switch`, `Sheet`, `AlertDialog`, `ActionSurface`, `ManagementPageHeader`, `DirectoryFrame` via Tailwind |
| `lib/approval-queue.tsx`, `lib/approval-detail.tsx` | Tailwind page, tabs, rows, tray, confirm layout via tokens — `lib/approval-queue.module.css` and `lib/approval-detail.module.css` deleted in Phase E | `Button`, `Card`, `Alert`, `ActionSurface`; `Checkbox`/`Select` stay native for test contracts |

## S4 Phase E — shared integration (tickets #492/#493)

Deleted route CSS verified absent via `grep -r "\.module\.css" web --include="*.tsx" --include="*.ts"` (0 hits for `attendance-panel.module.css`, `management-hub.module.css`, `home-cms-editor.module.css`, `approval-queue.module.css`, `approval-detail.module.css`). No route-specific selectors remain in `web/app/globals.css`; only shell, safe-area (`env(safe-area-inset-bottom)`, `calc(84px+env(...))`) and irreducible `@media print` roster visibility (print-media DOM visibility is automated evidence, native print preview/paper remains manual) are global.

**Native exceptions retained intentionally (reviewable, not auto-generated):**

| Native control / API | Location | Reason |
| --- | --- | --- |
| `<video>` + MediaStream/device APIs (`getUserMedia`, `BarcodeDetector`/`wasm` decoder, `MediaStreamTrack.stop`) | `lib/use-qr-camera.ts`, `lib/self-check-in-panel.tsx`, `lib/attendance-scanner-ui.tsx` | Real camera capture and QR decode — browser device capability, not a design primitive; harden tests assert `<video>` presence and denied/unsupported/unavailable callbacks, not decoder quality |
| Native `<fieldset>`/`<legend>` + `<input type="radio">` chooser (GOV.UK ATT-02) | `lib/attendance-panel.tsx` `ScannerEventChoiceGroup` | Event-choice radio semantics with no preselection or implicit submission — native fieldset/legend + radio contract, harden tests assert fieldset/legend and native radios |
| Native `window.print()` + `@media print` / `print-color-adjust` | `lib/attendance-roster.tsx`, `web/app/globals.css` (irreducible print selector) | Roster/check-in sheet print-media visibility — `window.print()` is the correct imperative API; print preview/paper is manual evidence, print-media DOM visibility is automated |
| Native `<select>` / `<input type="date">` where test contracts assert native option semantics | `app/management/account-directory-panel.tsx`, `app/management/member-directory-panel.tsx`, `lib/approval-queue.tsx` | Native select/date preserves option-test contracts and platform picker; shadcn `Select` would break those contracts |
| Skip link `<a href="#shell-content">`, nav `<a>` links, `output[role="status"]`, `output[role="alert"]` | `lib/app-shell.tsx`, `lib/nav-bar.tsx`, `lib/offline-banner.tsx`, `lib/live-region.tsx` | Document navigation anchor, navigation landmark links, and live-region status/alert semantics — native elements required (Phase A registry, preserved) |

Historical/prototype notes preserved: `src/gas/`, `程式碼.js`, `src/frontend/` retired frontends remain in git history only; `/prototype` and historical evidence excluded from CSS/module searches. No new scanner/directory/action/form/auth/compatibility layer was introduced; `DirectoryFrame`, `ManagementPageHeader`, `ActionSurface`, `ManagementFilterSheet`, `useAsyncResource`, and `rememberDeepLink`/`consumeDeepLink` remain the shared seams.

## S4 Phase F — contraction and release ledger (#494 / #495)

- **Shipped CSS ownership:** zero `.module.css` imports remain under the shipped `web/app` and `web/lib` surfaces. The final Auth Shell, Guest Check-In, and Section View ownership islands were migrated to Tailwind/token utilities and their files were deleted. `/prototype` and historical evidence are excluded.
- **Global CSS exceptions:** `globals.css` retains only Civic Minimal tokens, base/document behavior, shell dock/rail and safe-area rules, reduced-motion behavior, and irreducible print/platform selectors. Route-specific layout recipes do not return there.
- **Native platform/semantic exceptions:** camera/video/device APIs and decoder state, `window.print()`/print media, native selects/date inputs, navigation anchors, live regions, and the attendance fieldset/radio chooser remain documented exceptions. They are not substitutes for shared controls.
- **Normalized identity modules:** identity hierarchy, permission editing, Account Access, account directory, registration approval, and management projections use Role Categories, Role Definitions, Role Assignments, capabilities, and explicit scope. Account status and domain membership remain directory context; fixed Account-role filters are retired.
- **Evidence boundary:** numeric JSON attachments and the rendered `docs/qa/2026-09-01-s4-phase-f-release-evidence.{json,html}` report cover DOM geometry/state only. Human keyboard/AT, real-device, print-preview, forced-colors, zoom/reflow, and text-spacing rows remain explicitly `UNCLAIMED` in the Phase F release-gate record.
