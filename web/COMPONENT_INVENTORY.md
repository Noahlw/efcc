# EFCC — Component Inventory (S1–S4) — shadcn migration

> **Source:** `web/components/ui/*` (vendored local shadcn primitives, 18 components). Generated 2026-08-27 from `feat/s4-12-shadcn-migration` (waves S1–S4). All shipped S1–S4 common visual elements are replaced by local shadcn primitives except the documented native retains below. Native retains are intentional: radio chooser (GOV.UK contract, ATT-02), selects with test contracts, and domain-row actions where a full Card/Button composition would hide list identity.

## Vendored primitives available

`Button` `Input` `Textarea` `Select` `Checkbox` `Switch` `Badge` `Card` `Tabs` `Accordion` `Dialog` `AlertDialog` `Sheet` `Alert` `Skeleton` `Table` `ScrollArea` `Tooltip`

Active usage in shipped surfaces is a strict subset (see per-surface). `Select`/`Checkbox`/`Dialog`/`AlertDialog`/`Sheet`/`Table`/`ScrollArea`/`Tooltip` are present in `web/components/ui` but not yet wired in shipped S1–S4 flows; native `<select>` and domain-row `<button>` remain where test contracts / a11y contracts require them.

---

## S1 — Shell / Auth / Profile

### Shell (`lib/app-shell.tsx`, `lib/shell-header.tsx`, `lib/nav-bar.tsx`, `lib/offline-banner.tsx`, `lib/forbidden-view.tsx`, `app/globals.css`)

- **shadcn used:** `Button` (nav actions, shell header), `Badge` (identity chip), `Skeleton` (shell loading), `Alert` (offline/forbidden)
- **native retains:** none — shell geometry is in `globals.css` (`.nav-phone`, `.nav-desktop`, `.shell`, `.shell-content`) and intentionally untouched
- **notes:** Shell tokens and dock geometry are shared and excluded from migration.

### Landing / Login (`app/page.tsx`)

- **shadcn used:** `Button` (submit, guest-check-in link via `asChild`, register link), `Input` (username/password, legacy upgrade fields), `Card` (form card, session-expired card), `Alert` (notice, error), `Skeleton` (restoring state)
- **native retains:** none — all controls are shadcn. Layout classes (`page`, `header`, `brand`, `main`, `bodyCenter`, `splitLogin`, `loginCopy`, `formCard`, `cardHead`, `cardTitle`, `cardLead`, `notice`, `form`, `field`, `fieldLabel`, `loginNote`, `guestEntry`, `registerEntry`, `restoring`, `sessionExpired*`) remain as layout/domain composition.

### Profile — QR / Account (`app/profile/page.tsx`, `app/profile/account-settings.tsx`, `app/profile/settings/page.tsx`, `lib/recovery-view.tsx`)

- **shadcn used:** `Button` (sign-out, upgrade, recovery actions), `Badge` (status), `Card` (qrCard, detailsCard, settings cards), `Input` (account settings forms), `Alert` (error/notice)
- **native retains:** none — forms use `Input`; no `Select`/`Checkbox` in this surface
- **layout kept:** `profile.module.css` and `settings.module.css` (page, header, intro, qrDisplay, details, etc.)

---

## S2 — Home / Programs / Notices / Messages

### Home (`app/home/page.tsx`, `lib/announcement-detail.tsx`, `lib/home-*`)

- **shadcn used:** `Badge` (enrolledBadge), `Button` (primaryAction, backButton, externalLink), `Card` (eventCard, venueCard, listCard, emptyCard), `Alert` (state/error), `Skeleton` (skeletonPage/Region/Block/Intro/EventCard etc.)
- **native retains:** `.backButton`/`.externalLink` are `Button asChild` (anchor) — native `<a>` remains where routing requires it; no native inputs/selects in home feed
- **layout kept:** `home.module.css` (page, intro, eventCard, listCard, section, detailPage, detailTopbar, etc.)

### Programs — Boundary / Directory / Detail / Workspace

`lib/programs/*` — participant-default boundary (PUI-01) + management directory/detail/workspace.

- **shadcn used:** `Button` (all program/workspace actions, enrollment, attention), `Badge` (program status, attention counts), `Card` (directoryCard, participantDirectoryCard, workspace sections), `Input` (search, program form), `Textarea` (programForm, settings), `Alert` (boundaryState/error, intentNotice), `Skeleton` (directorySkeleton*, boundaryState), `Tabs` (program-workspace, programs-boundary), `Accordion` (permissions-panel integration)
- **native retains:**
  - `Select` — participant directory filters and program settings use native `<select>` where test contracts assert option presence (`programs` tests look for native `<select>`); `web/components/ui/select.tsx` is vendored but not wired here
  - Radio chooser — `attendance-panel` `fieldset`/`radioRow`/`radioInput` (GOV.UK contract, see `attendance-panel.module.css` `.fieldset`, `.radioRow`, `.radioInput`) intentionally remains native (a11y, test contract)
- **layout kept:** `programs.module.css` (page, card, deptList, eventsPanel, programDetail, workspace*, directory*) — 8 dead classes removed in Wave 5 (see report)

### Notices (`app/notices/page.tsx`, `lib/notices-panel.tsx`)

- **shadcn used:** `Button` (markAll, retry), `Badge` (unreadCount), `Card` (empty, list wrapper), `Alert` (error), `Skeleton` (loading)
- **native retains:** none — list rows are `<a>` (itemLink) with domain styling; no inputs/selects
- **layout kept:** `notices-panel.module.css` (page, pageHeader, panel, toolbar, list, item, itemLink, unreadDot, etc.) — 3 dead message* classes removed

### Messages (`app/messages/page.tsx`, `lib/messages-panel.tsx`, `lib/message-feed` via `notices-panel.module.css`)

- **shadcn used:** `Button` (mark-all, retry), `Badge` (unread), `Card`/`Card` wrappers, `Alert`, `Skeleton`
- **native retains:** none — shares `notices-panel.module.css` layout (messageFeed, messageCard*, messageDate etc. remain as composition; `messageLink`/`messageChevron`/`messageCategoryTag` removed as dead)

---

## S3 — Scanner / Guest

### Scanner — Self / Assisted / Operator (`app/scanner/page.tsx`, `lib/self-check-in-panel.tsx`, `lib/assisted-scanner-panel.tsx`, `lib/attendance-operator-panel.tsx`, `lib/attendance-panel.tsx`, `lib/attendance-scanner-ui.tsx`, `lib/attendance-roster.test.tsx`)

- **shadcn used:** `Button` (submit, cameraStop, confirmActions, modeSwitch), `Input` (code/entry), `Card` (card, confirmCard), `Alert` (cameraUnavailable, confirmError, chooserError), `Badge` (statusBadge, pill), `Skeleton` (chooserLoading)
- **native retains:**
  - Radio chooser — `attendance-panel.module.css` `.fieldset`, `.radioRows`, `.radioRow`, `.radioInput`, `.radioText` (intentional native GOV.UK radio group, ATT-02 contract; see `lib/attendance-panel.tsx` chooser)
  - Camera `<video>` and native form controls inside `inputRow`/`field` remain for scanner performance
- **layout kept:** `attendance-panel.module.css` (page, card, form, camera*, method*, confirmation, chooser, outcome, roster*, etc.) — 2 dead classes removed (`methodCardNote`, `correctionPanel`); `methodCard` composition retained

### Guest Check-In (`app/guest-check-in/page.tsx`, `lib/attendance-panel.tsx` guest surface)

- **shadcn used:** `Button`, `Input`, `Card`, `Alert` (via shared attendance panel)
- **native retains:** same radio chooser contract as scanner; no `Select`
- **layout kept:** `guest-check-in.module.css` (page, header, brand, main, `--seal` now `var(--accent)`)

---

## S4 — Management

### Management Hub & Settings Hub (`app/management/page.tsx`, `app/management/management-hub.tsx`, `app/management/settings-hub.tsx`, `app/management/management-settings.module.css`)

- **shadcn used:** none directly — hub is a composition of navigation cards; shared primitives are in child panels
- **native retains:** Row `<button>` (`row`, `entryLink`) and `BackIcon`/`chevron` SVGs are intentional domain rows (list identity, not generic Button)
- **layout kept:** `management-hub.module.css` (page, header, title, groupCard, row, etc.), `management-settings.module.css` (page, header, back, card, list, row, detailCard, etc.)

### Member Directory (`app/management/member-directory-panel.tsx`, `member-directory-panel.module.css`)

- **shadcn used:** none directly — directory is a searchable list with domain row affordances
- **native retains:** `Input` is native `<input class={styles.input}>` (test contract asserts `getByRole('searchbox')` and placeholder); `resultButton` rows are native `<button>` for list identity; `Select` not used (no role/status filter in this panel)
- **layout kept:** `member-directory-panel.module.css` (page, header, field, input, results, resultButton, detail, etc.)

### Account Directory (`app/management/account-directory-panel.tsx`, `account-directory-panel.module.css`)

- **shadcn used:** none directly — filter sheet uses `Sheet`-style overlay but via `ManagementFilterSheet` custom composition (not `components/ui/sheet`); badges/status use custom `.status` pills
- **native retains:** Native `<input>`/`<select>` with 44px/48px targets (test contracts assert select options for role/status; Sheet not wired to avoid Radix focus-trap in D1 panel tests)
- **layout kept:** `account-directory-panel.module.css` (page, header, controls, filterButton, desktopFilters, field, input, select, sheetFilters, sheetActions, results, avatar, status/active/pending/suspended/deactivated, detail, facts, etc.) — pending/suspended/deactivated are dynamic via `styles[statusClass(...)]` and retained

### Permissions & Roles (`app/management/permissions-panel.tsx`, `permissions-panel.module.css`)

- **shadcn used:** `Switch` (policySwitch), `Accordion` (policyGroupTrigger/Body), `Input` (searchField), `Badge` (roleCount/revision)
- **native retains:** `roleLink`/`detailAction`/`backButton`/`reviewButton`/`saveButton`/`reloadButton` are domain-row native `<button>`s (list affordance, not generic Button); `Table` not used — role matrix is list (`roleList`, `policyCells`), not `components/ui/table`
- **layout kept:** `permissions-panel.module.css` (page, header, section, roleList, detailActions, policyLayout, groupStack, etc.)

### Home CMS Editor (`app/management/home-cms-editor.tsx`, `home-cms-editor.module.css`)

- **shadcn used:** none directly — editor retains custom `templateButton`/`templateActive`/`primaryButton`/`secondaryButton` composition for template chooser and publish actions (test contracts assert `getByRole('button', {name: EDITOR.*})` with `aria-pressed`)
- **native retains:** Native `<input>`/`<textarea>`/`<select>` inside `editorCard`/`publishCard` (tests assert input/textarea roles; `Select` not wired)
- **layout kept:** `home-cms-editor.module.css` (page, header, backLink, titleRow, state/error/conflict/notice, templateSwitch, editorForm, publishOptions, auditList, preview*, etc.)

### Approval Queue & Detail (`lib/approval-queue.tsx`, `lib/approval-detail.tsx`, `lib/registration-form.tsx`)

- **shadcn used (approval-detail/registration-form):** `Button`, `Card`, `Alert` (detail cards share shadcn Card/Alert where migrated); **approval-queue** still uses raw `<button>` for `refresh`/`tabs`/`tray` and native `<input>`/`<select>`/`<checkbox>` for queue controls (test contracts assert `getByRole('tab')`, `getByRole('checkbox')`, `select` options)
- **native retains:** Native `<select>` (role filter), native `<input type="checkbox">` (selectAll/row selection) with `accent-color: var(--accent)` — `Select`/`Checkbox` vendored but not wired to keep `role=tab/checkbox` contracts and batch-approval `confirmDialog` as native `<dialog>`
- **layout kept:** `approval-queue.module.css` (page, tabs, controls, rows, tray, confirm*), `approval-detail.module.css` (page, card, detailRow, actions) — 16 dead classes removed from queue (pageBody, pageCard, queueHeader, titleGroup, count, lead, approve, reject, tableWrap/table/th/td, actions, rejectNote*, moreNames)

---

## Summary statement

All shipped S1–S4 **common visual elements** (submit/primary actions, secondary/outline actions, text inputs, textareas, cards, badges, alerts, skeletons, tabs, accordion, switch, lists) are replaced by local shadcn primitives (`web/components/ui/*`) except the native retains documented above. Native `<select>` remains in management and program filters where tests assert native option semantics; the GOV.UK radio chooser remains in the attendance domain; domain-row `<button>`s (`resultButton`, `roleLink`, `detailAction`, `eventButton`, `row`) remain where a list-identity affordance is required rather than a generic Button variant. Vendored but currently unused primitives — `Select`, `Checkbox`, `Dialog`, `AlertDialog`, `Sheet`, `Table`, `ScrollArea`, `Tooltip` — are available for future waves and were not introduced where test or a11y contracts require native semantics.

## Layout vs. control split

| Module | Layout / domain classes kept | Control primitives replaced |
| --- | --- | --- |
| `app/page.module.css` | page, header, main, bodyCenter, splitLogin, loginCopy, formCard, etc. | `Button`, `Input`, `Card`, `Alert`, `Skeleton` |
| `app/home/home.module.css` | page, intro, eventCard, listCard, section, detailPage, etc. | `Badge`, `Button`, `Card`, `Alert`, `Skeleton` |
| `app/programs/programs.module.css` | page, card, deptList, eventsPanel, programDetail, workspace*, directory* | `Button`, `Badge`, `Card`, `Input`, `Textarea`, `Alert`, `Skeleton`, `Tabs`, `Accordion` |
| `lib/attendance-panel.module.css` | page, card, camera*, method*, confirmation, chooser, roster* | `Button`, `Input`, `Card`, `Alert`, `Badge`, `Skeleton` (radio chooser stays native) |
| `lib/notices-panel.module.css` | page, pageHeader, panel, toolbar, list, item, messageFeed/Card* | `Button`, `Badge`, `Card`, `Alert`, `Skeleton` |
| `app/management/*` | page, header, groupCard, row, results, detail, policyLayout, etc. | `Switch`, `Accordion`, `Input`, `Badge` where used; row-buttons stay native |
| `lib/approval-queue.module.css` | page, tabs, rows, tray, confirm* | `Button`/`Alert` partially; checkbox/select stay native for test contracts |
| `lib/approval-detail.module.css` | page, header, card, detailRow, actions | `Button`, `Card`, `Alert` |
