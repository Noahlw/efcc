# Assessment B: Detector & Browser Evidence — Notices (Populated State)

- **Target Surface**: Notices Panel (`/notices`), Populated State
- **Branch / Worktree**: `feat/389-s2-05-program-detail` (`.worktrees/stack-385-389`)
- **Evaluated Files**:
  - `web/lib/notices-panel.tsx`
  - `web/lib/notices-panel.module.css`
  - `web/app/notices/page.tsx`
- **Design Reference**: `design_export/participant/notices.html`
- **Authentication**: `E2E_member` (Member role)
- **Viewport**: Mobile (390 × 844, 2x DPR)

---

## 1. CLI Detector Findings

Ran `node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json` across target source files.

### 1.1 Target Source Files Scan

- **Command**:
  ```bash
  node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
    web/app/notices/page.tsx \
    web/lib/notices-panel.tsx \
    web/lib/notices-panel.module.css
  ```
- **Total Findings**: `0`
- **Rule Violations**: None (`[]`)
- **False Positives**: N/A (no findings generated)

### 1.2 Reference Design File Scan (for parity comparison)

- **Target**: `design_export/participant/notices.html`
- **Total Findings**: `5` (all advisory quality warnings regarding tokens outside `DESIGN.md` in static handoff prototype):
  1. `line 15`: `design-system-color` — Color `#6495aa` outside documented palette.
  2. `line 93`: `design-system-font-size` — Font size `clamp(1.72rem,6vw,2.25rem)` outside type ramp.
  3. `line 94`: `design-system-font-size` — Font size `1.14rem` outside type ramp.
  4. `line 97`: `design-system-radius` — Border radius `10px` outside rounded token scale (`8px`, `12px`, `999px`).
  5. `line 124`: `design-system-font-size` — Font size `.82rem` outside type ramp.

_Note: The production Next.js implementation (`web/lib/notices-panel.tsx` + `web/lib/notices-panel.module.css`) strictly maps to `DESIGN.md` CSS custom properties (`var(--line)`, `var(--radius-md)`, `var(--ink)`, `var(--ink-muted)`, `var(--error)`), producing 0 detector warnings._

---

## 2. Browser Evidence & Render Inspection

### 2.1 Artifacts Captured

- **Live Render Screenshot**: `http://127.0.0.1:8787/notices`
  - _Path_: `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e8040e5aadbbb.webp` (390 × 844 viewport, DPR 2.0)
- **Design Export Screenshot**: `file://.../design_export/participant/notices.html`
  - _Path_: `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e804e281349cd.webp` (390 × 844 viewport, DPR 2.0)

---

## 3. Structural & Visual Parity Comparison (Factual Observations)

### 3.1 Header & Page Intro

- **Live Implementation**:
  - Top persistent AppShell bar displays page section title "通知".
  - Main heading `h1` renders "通知".
  - Lead subhead paragraph renders `COPY.notices.noticesLead` ("最新消息與報名狀態。").
  - Subtle hairline divider separates page header block from list panel.
- **Design Reference**:
  - Top navigation bar title displays "通知".
  - Main heading `h1` renders "通知".
  - Lead subhead paragraph renders "聚會、報名及帳戶相關消息。".

### 3.2 List Toolbar / Status Bar

- **Live Implementation**:
  - Left element: Dynamic counter badge displaying `"2 未讀"` when `unread_count > 0`.
  - Right element: Interactive `<button>` for `"全部標示已讀"` (`type="button"`, disabled when `marking || unreadCount === 0`, includes `aria-busy` indicator).
- **Design Reference**:
  - Left element: Static section header `<h2>` displaying `"最新"`.
  - Right element: Text action button displaying `"全部標示已讀"`.

### 3.3 Notice Rows & List Layout

- **Live Implementation**:
  - Root container: `<ul class={styles.list} aria-label="通知列表">` with `background: var(--surface-raised, #fff)`, `border: 1px solid var(--line, #d6dcde)`, and `border-radius: var(--radius-md, 12px)`.
  - Number of items rendered in live test fixture: 3 items (2 unread, 1 read).
  - Row item 1 (Unread):
    - Red unread indicator dot (`<span className={styles.unreadDot} aria-hidden="true" />`, `8px × 8px`, `background: var(--error, #b3261e)`).
    - Screen-reader accessible label: `<span className="sr-only">未讀</span>`.
    - Title: `"報名結果"` (bold).
    - Body: `"你的報名申請已獲核准。"`.
    - Timestamp: `<time dateTime="2026-08-20T...">今天</time>`.
    - Target URL: `/programs?program=a50dab0b-c952-4abf-adce-39a46a4dce07`.
  - Row item 2 (Unread):
    - Red unread indicator dot.
    - Title: `"聚會提醒"` (bold).
    - Body: `"你已報名的聚會即將開始。"`.
    - Timestamp: `<time dateTime="2026-08-20T...">今天</time>`.
    - Target URL: `/programs?program=06256d63-c014-4a5b-b0e4-2dacb7be983d&event=5abf5e16-ded6-4f9e-8ac1-75d29a8a5e60`.
  - Row item 3 (Read):
    - Spacer dot (`<span className={styles.readDot} aria-hidden="true" />`, `8px × 8px`, `background: transparent`) preserving left alignment column.
    - Title: `"帳戶更新"` (bold).
    - Body: `"你的帳戶資料已更新。"`.
    - Timestamp: `<time dateTime="2026-08-20T...">今天</time>`.
    - Target URL: `/profile`.
  - Responsive layout details:
    - Mobile (≤560px media query): `.itemLink` uses `grid-template-columns: 12px minmax(0, 1fr)`. The `.itemTime` is placed in `grid-column: 2` beneath `.itemBody`.
    - Desktop (>560px): `.itemLink` uses `grid-template-columns: 12px minmax(0, 1fr) auto`, positioning the timestamp in the right column.
  - Interactive element type: Rendered as `<a className={styles.itemLink} href="...">` with `min-height: 92px` touch target.
- **Design Reference**:
  - Container with `border-radius: 10px` and `border: 1px solid #d6dcde`.
  - 3 mock rows:
    - Row 1: Red dot, title "聚會將於星期三開始", subtitle "門徒訓練基礎課 · 晚上 7:30", timestamp "今天" on top-right.
    - Row 2: Red dot, title "報名已確認", subtitle "你已成功參加門徒訓練基礎課。", timestamp "昨天" on top-right.
    - Row 3: Empty spacer, title "帳戶資料已更新", subtitle "你的聯絡電話已完成核對。", timestamp "8月12日" on top-right.
  - Interactive element type: Rendered as `<button type="button">`.
  - Below-card disclaimer footnote explaining 90-day retention policy and role-based staff tabs.

### 3.4 Navigation Bar

- **Live Implementation**:
  - 5-tab bottom navigation: 首頁 (Home), 課程與活動 (Programs), 簽到 (Floating center circle with cinnabar background `#9c302c` and white icon), 通知 (Active tab in red accent), 帳戶 (Profile).
- **Design Reference**:
  - 5-tab bottom navigation: 首頁, 課程, 掃描 (Floating center circle with white background and dark border), 通知 (Active tab with red badge indicator dot), 帳戶.

---

## 4. Run Summary Table

| Category | Item | Result / Observation |
| --- | --- | --- |
| **Detector** | `web/lib/notices-panel.tsx` | 0 findings |
| **Detector** | `web/lib/notices-panel.module.css` | 0 findings |
| **Detector** | `web/app/notices/page.tsx` | 0 findings |
| **Live Route** | `/notices` (Member session) | HTTP 200, 3 notices (2 unread, 1 read) |
| **A11y Semantics** | Unread Indicator | `aria-hidden="true"` dot + `.sr-only` "未讀" |
| **A11y Semantics** | List Structure | Semantic `<ul aria-label="通知列表">` + `<li>` + `<a>` |
| **Touch Target** | Row Min Height | `min-height: 92px` (exceeds ≥44px guideline) |
| **Mobile Layout** | Timestamp Alignment | Wrapped to column 2 under body on ≤560px viewports |
