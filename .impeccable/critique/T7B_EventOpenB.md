# Assessment B: Detector & Browser Evidence — Event Detail (Check-in Open)

**Target Component:** `web/lib/programs/event-detail.tsx`  
**State:** Event Detail with Check-in Window OPEN (`E2E_CRITIQUE_開放簽到聚會` under `E2E_DEMO_成人查經`)  
**Assessment Date:** 2026-08-20  
**Method:** Assessment B (Automated CLI Detector + Real Headless Browser Evidence)  
**Viewport:** 390 × 844 (Mobile 1×)

---

## 1. CLI Detector Findings

### Summary Statistics

- **Target File:** `web/lib/programs/event-detail.tsx`
- **Total Antipattern Findings:** 0
- **Errors / Critical Issues:** 0
- **Advisories:** 0
- **Exit Code:** 0

### Scan Output

```bash
$ node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json web/lib/programs/event-detail.tsx
[]
```

### Static Analysis Notes

- **Component File Structure:** `event-detail.tsx` contains 893 lines covering both participant-facing view (`!canManage`, lines 395–472) and manager workspace view (`canManage`, lines 474–892).
- **Hardcoded Colors / Tokens:** None detected in `event-detail.tsx`. Colors and layout metrics route cleanly through CSS modules (`styles.programDetail`, `styles.programDetailInfoCard`, `styles.stickyActionBar`, etc.) referencing design tokens defined in `DESIGN.md` / `globals.css`.
- **Contrast & Layout Tokens:** The participant view cleanly consumes `EventFactIcon` SVG subcomponents (using `currentColor` and `strokeWidth: 1.8`), `styles.directoryStatusSuccess` (`var(--success)` with `var(--success-surface)` / `var(--success-border)`), and `styles.actionButton` (`var(--accent)` border/text with hover fill).

---

## 2. Real Browser Execution & Evidence

### Test Session Details

- **Dev Server URL:** `http://127.0.0.1:8787` (Cloudflare Worker + Next.js static shell)
- **Authenticated User:** `E2E_member` (Role: Member)
- **Program ID:** `06256d63-c014-4a5b-b0e4-2dacb7be983d` (`E2E_DEMO_成人查經`)
- **Event ID:** `cb5fdf4e-bcb0-4580-a396-bef817b414fb` (`E2E_CRITIQUE_開放簽到聚會`)
- **Event Status:** `status: "Active"`, `availability: "Active"`, `source: "MANUAL"`, `location: "二樓禮堂"`
- **Check-in Window:** Open (~2026-08-20T00:43Z to 2026-08-20T02:13Z, current time inside window)
- **Live Captured URL:** `http://127.0.0.1:8787/programs?program=06256d63-c014-4a5b-b0e4-2dacb7be983d&event=cb5fdf4e-bcb0-4580-a396-bef817b414fb`

### Accessibility Tree (Live Render Snapshot)

```yaml
- generic:
    - status: 聚會詳情
    - banner:
        - generic: 課程與活動
    - navigation "主要導航":
        - link "首頁" (/home)
        - link "課程與活動" (/programs)
        - link "簽到" (/scanner)
        - link "通知" (/notices)
        - link "帳戶" (/profile)
    - main:
        - region "課程":
            - region "E2E_CRITIQUE_開放簽到聚會":
                - button "返回" (← 返回)
                - generic:
                    - status "可簽到"
                    - paragraph: E2E_DEMO_成人查經
                    - heading "E2E_CRITIQUE_開放簽到聚會" [level=1] [focused]
                - article:
                    - paragraph:
                        - img (calendar icon)
                        - time: 8月20日（四）早上 8:43–10:13
                    - paragraph:
                        - img (pin icon)
                        - generic: 二樓禮堂
                - region "簽到說明":
                    - heading "簽到說明" [level=2]
                    - paragraph: 請於簽到時間內前往掃描，確認聚會後完成簽到。
                - link "前往掃描" (/scanner?event=cb5fdf4e-bcb0-4580-a396-bef817b414fb)
```

---

## 3. Structural Comparison: Live vs. Design Reference

### Visual Artifacts Captured

1. **Live Render Screenshot:**
   - Saved at: `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e81ae12d6b2c1.webp`
   - Viewport: 390 × 844
2. **Design Ground Truth (`event-detail.html`):**
   - Source: `design_export/participant/event-detail.html`
   - Saved at: `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e81be5278b6ad.webp`

### Key Observable Differences (Factual / Structural Only)

| Element / Area | Design Reference (`event-detail.html`) | Live Render (`/programs?program=...&event=...`) |
| :-- | :-- | :-- |
| **Top App Shell Header** | Fixed top bar displays `聚會詳情` (Event Detail) as title. | Outer AppShell header displays top section `課程與活動` (Programs) with nested page title `課程`. |
| **Back Button Affordance** | Inline text button `< 返回` with no border/background, aligned with title group. | Boxed button `← 返回` with border and background (`.programDetailBack`). |
| **Badge: Check-in Open (`可簽到`)** | Pill badge (`border-radius: 99px`), light green background `#e9f0ea`, dark green text `#2e6b37`, green border `#9cb49d`. Positioned adjacent/above title. | Pill badge (`border-radius: var(--radius-pill)`), green tint `styles.directoryStatusSuccess` (`var(--success-surface)` / `var(--success)` / `var(--success-border)`). |
| **Program Eyebrow & Title** | Title `第三課聚會` (H1, 24px) with program subtitle `門徒訓練基礎課` below it in muted ink. | Eyebrow `E2E_DEMO_成人查經` above H1 title `E2E_CRITIQUE_開放簽到聚會`. |
| **Title Focus / Ring** | Clean heading without focus indicator. | H1 receives programmatic focus on render (`tabIndex={-1}`, `document.getElementById('participant-event-title')?.focus()`), creating a visible focus outline box around the heading. |
| **Event Info Card** | Single white card with rounded border (`#d6dcde`), calendar row and location pin row with 19px SVG icons. | Single white card (`.programDetailInfoCard`), rounded border (`var(--line)`), SVG calendar and location pin icons. |
| **Instructions Section** | `簽到說明` H2 heading with description paragraph below. | `簽到說明` H2 heading (`.programDetailHeading`) with description paragraph below. |
| **Primary Action Affordance ("前往掃描")** | Solid Cinnabar red filled primary button (`background: #9c302c; color: #ffffff; border: 1px solid #9c302c; min-height: 48px; border-radius: 9px`) inside a frosted sticky action bar (`background: rgba(255,255,255,.94)`). | Outlined action button (`border: 1px solid var(--accent); color: var(--accent); background: none; min-height: 44px; border-radius: 8px`) inside a sticky action bar (`.stickyActionBar`). |
| **Bottom Navigation Bar** | 5-item bottom bar with elevated central circular `掃描` (Scan) button. | 5-item bottom navigation bar with active tab indicator on `課程與活動` and red circular floating button for `簽到`. |

---

## 4. Run Notes & Verification Status

- **Target Component:** `web/lib/programs/event-detail.tsx`
- **Assessment Mode:** Assessment B (Isolated subagent, no coordination with Assessment A)
- **Detector CLI Status:** Completed (0 errors, 0 advisories, exit code 0)
- **Browser Automation:** Headless Chromium at 390 × 844 mobile viewport
- **Authentication:** Logged in via UI as `E2E_member`
- **Live Event Opened:** `E2E_CRITIQUE_開放簽到聚會` (Open check-in window state confirmed in API and DOM)
- **Comparison File Tested:** `design_export/participant/event-detail.html` via `file://`
- **Screenshots Preserved:** Both live state and design export successfully saved to temp paths
