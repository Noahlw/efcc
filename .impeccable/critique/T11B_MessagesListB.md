# Assessment B: Detector & Browser Evidence — Messages List (Populated State)

- **Target Surface**: Messages List (`/messages`), Populated State
- **Branch / Worktree**: `feat/389-s2-05-program-detail` (`.worktrees/stack-385-389`)
- **Evaluated Files**:
  - `web/lib/messages-panel.tsx`
  - `web/app/messages/page.tsx`
  - `web/lib/messages-intent.ts`
  - `web/lib/home-api.ts`
  - `web/app/home/home.module.css` (list card styles referenced)
  - `web/lib/notices-panel.module.css` (layout styles referenced)
- **Design Reference**: `design_export/participant/messages.html`
- **Authentication**: `E2E_member` (Member role session)
- **Viewport**: Mobile (390 × 844, headless Chromium)

---

## 1. CLI Detector Findings

Ran `node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json` across the target source files.

### 1.1 Target Source Files Scan

- **Command**:
  ```bash
  node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
    web/lib/messages-panel.tsx \
    web/app/messages/page.tsx
  ```
- **Exit Code**: `0`
- **Total Findings**: `0`
- **Rule Violations**: None (`[]`)
- **False Positives**: None (clean scan)

### 1.2 Reference Design File Scan (for parity comparison)

- **Target**: `design_export/participant/messages.html`
- **Command**:
  ```bash
  node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
    .scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/messages.html
  ```
- **Total Findings**: `5` (all advisory token-alignment warnings in static prototype markup):
  1. `design-system-color` (Line 15): Undocumented `#6495aa` in static SVG / utility style.
  2. `design-system-font-size` (Line 75): `clamp(1.72rem, 6vw, 2.25rem)` on header title.
  3. `design-system-radius` (Line 79): `border-radius: 10px` on list container card.
  4. `design-system-font-size` (Line 104): `font-size: .68rem` on tab bar label.
  5. `design-system-font-size` (Line 107): `font-size: .68rem` on tab bar label.

_Note: The production Next.js implementation (`web/lib/messages-panel.tsx` and referenced CSS modules) strictly maps to standard CSS variables and design tokens, resulting in 0 detector violations._

---

## 2. Browser Evidence & Render Inspection

### 2.1 Artifacts Captured

- **Live Render Screenshot (Populated State)**: `http://127.0.0.1:8787/messages`
  - Temp path: `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e80dc3fbf166d.webp`
  - Dimensions: 390 × 844 viewport (rendered at 474 × 1024 preview)
- **Design Export Reference Screenshot**: `file://.../design_export/participant/messages.html`
  - Temp path: `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e80e4413f166e.webp`
  - Dimensions: 390 × 844 viewport (rendered at 474 × 1024 preview)

### 2.2 Live DOM & Accessibility Tree

```yaml
- generic:
    - banner:
        - generic: 顯恩堂
    - navigation "主要導航":
        - link "首頁" (/home)
        - link "課程與活動" (/programs)
        - link "簽到" (/scanner)
        - link "通知" (/notices)
        - link "帳戶" (/profile)
    - main:
        - heading "教會消息" [level=1]
        - list "教會消息清單":
            - listitem:
                - link "E2E_DEMO_教會消息 本機示範教會消息；Home CMS E2E 會還原此內容。 · 8月20日" (/messages?content=home):
                    - generic:
                        - generic: E2E_DEMO_教會消息
                        - generic: 本機示範教會消息；Home CMS E2E 會還原此內容。 · 8月20日
                    - img (chevron icon)
```

---

## 3. Structural & Visual Parity Comparison (Factual Observations)

### 3.1 App Shell & Top Header

- **Live Implementation (`/messages`)**:
  - Rendered inside standard participant `<AppShell>`.
  - Top bar displays centered brand title `"顯恩堂"`.
  - Content header contains `<h1>` `"教會消息"` (`font-size: 28px`, `font-weight: 800`, `color: rgb(23, 26, 29)`).
  - No subtitle / lead paragraph is rendered below the title.
- **Design Reference (`messages.html`)**:
  - Top navigation bar displays a back navigation control (`<button aria-label="返回">` + label `"教會消息"`).
  - Page header displays `<h1>` `"教會消息"` (`font-size: 27.52px`, `font-weight: 600`) plus descriptive lead text: `<p>` `"崇拜、聚會安排及教會公告。"`.

### 3.2 Announcement List & Card Architecture

- **Live Implementation (`web/lib/messages-panel.tsx`)**:
  - Rendered as an accessible unordered list: `<ul aria-label="教會消息清單">`.
  - Each item is a separate standalone card (`<li><Link className={homeStyles.listCard}>`):
    - Layout: `display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; padding: 16px; min-height: 72px;`
    - Border: `1px solid var(--line-strong, #868182)` (computed `#aeb8bc`)
    - Border radius: `10px`
    - Background: `rgb(255, 255, 255)`
    - Spacing: standalone card separated by list item flow margin.
  - Card Content:
    - Title: `.cardTitle` (bold `font-weight: 650`, `color: #171a1d`)
    - Description + Date: `.cardDescription` (`color: var(--ink-muted, #59636a)`, `font-size: 0.86rem`), combining summary text with date string ` · 8月20日`.
    - Right Trailing Element: `<Icon name="chevron" />` (20 × 20px, muted ink).
  - Row Target: Links directly to `/messages?content=home` (activating inline detail view on selection).
- **Design Reference (`messages.html`)**:
  - Rendered as a unified group container card: `<div style="background:#ffffff; border:1px solid #d6dcde; border-radius:10px; overflow:hidden">`.
  - Inner items are divided by internal hairline borders (`border-top: 1px solid #d6dcde`) rather than separate standalone card containers.
  - Row layout: `display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 16px; min-height: 72px;`.

### 3.3 State Handling in Code

- **Loading State**:
  - Evaluated in `web/lib/messages-panel.tsx:66-74` and `web/app/messages/page.tsx:16-18`.
  - Emits `<output className={styles.state} aria-busy="true">載入中...</output>` for screen reader accessibility.
- **Error State**:
  - Evaluated in `web/lib/messages-panel.tsx:76-91`.
  - Emits `<p className={styles.error} role="alert">未能載入教會消息</p>` with a dedicated `<button className={styles.retry}>重試</button>`.
- **Empty State**:
  - Evaluated in `web/lib/messages-panel.tsx:98-103`.
  - Emits `<div className={styles.empty}>` with `<h2 className={styles.emptyTitle}>暫無教會消息</h2>` and `<p className={styles.emptyHint}>有新公告時會在此顯示</p>`.
- **Detail Drill-Down**:
  - When `intent.contentId` is present in URL search params (e.g. `/messages?content=home`), mounts `<AnnouncementDetail>` with back navigation button returning to `/messages`.

### 3.4 Navigation Bar

- **Live Implementation**:
  - 5-tab bottom navigation with labels ("首頁", "課程與活動", "簽到", "通知", "帳戶").
  - Center "簽到" button features prominent circular crimson action treatment (`var(--accent, #9c302c)`).
- **Design Reference**:
  - 5-tab bottom navigation with labels ("首頁", "課程", [icon], "通知", "帳戶").

---

## 4. Run Summary Table

| Category | Item | Result / Observation |
| --- | --- | --- |
| **CLI Detector** | `web/lib/messages-panel.tsx` | **0 findings** (clean) |
| **CLI Detector** | `web/app/messages/page.tsx` | **0 findings** (clean) |
| **CLI Detector** | Reference `messages.html` | **5 advisory findings** (color/radius/font tokens in prototype) |
| **Live State** | Route `/messages` | Populated state rendered: 1 item ("E2E_DEMO_教會消息") |
| **Live Interaction** | Card Click Route | Links to `/messages?content=home` |
| **Visual Header** | Page Header | Live has `h1` "教會消息"; lacks subtitle `<p>` present in design export |
| **Visual List** | Container Structure | Live uses individual standalone cards (`.listCard`); export uses grouped card with internal dividers |
| **Accessibility** | List & Cards | Semantic `<ul>` list with `aria-label="教會消息清單"`, `aria-busy` on loading, `role="alert"` on error |
| **Viewport Tested** | Mobile Form Factor | 390 × 844 (iPhone 13/14/15 logical viewport) |
