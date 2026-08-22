# Impeccable Design Critique: Participant Notices (Populated State)

Method: dual-agent (A: T9A_NoticesA · B: T9B_NoticesB)

## Design Health Score

| # | Heuristic | Score | Key Issue |
| --- | --- | :-: | --- |
| 1 | Visibility of System Status | 3/4 | Unread count & status dots are clear; loading state uses plain text causing layout shift (CLS) instead of skeleton cards. |
| 2 | Match Between System and Real World | 3/4 | Natural Hong Kong Cantonese phrasing; notice descriptions lack specific program name context in preview text. |
| 3 | User Control and Freedom | 3/4 | Bulk "全部標示已讀" is readily available; lacks individual notice mark-as-read/unread toggles and undo action. |
| 4 | Consistency and Standards | 4/4 | Strict adherence to EFCC Civic Minimal palette (`#f4f5f3`, `#ffffff`, `#d6dcde`); unread dot alignment with transparent spacers preserves typography rhythm. |
| 5 | Error Prevention | 3/4 | "全部標示已讀" disables safely when unread count is 0; lacks confirmation or undo toast for accidental bulk clear. |
| 6 | Recognition Rather Than Recall | 3/4 | Generic body copy ("你的報名申請已獲核准。") forces users to remember which program they applied for rather than naming it directly. |
| 7 | Flexibility and Efficiency of Use | 3/4 | Entire card row is an accessible link; lacks categorization filters or swipe gestures for high-volume notification management. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Clean civic card container with hairline borders; mobile breakpoint (<560px) forces timestamp below body, creating excessive vertical whitespace. |
| 9 | Help Users Recognize, Diagnose, and Recover from Errors | 4/4 | Structured error container with distinct retry button and polite ARIA announcements on action failure. |
| 10 | Help and Documentation | 3/4 | Self-explanatory interface; lacks retention policy note (e.g. 90-day retention) present in original design spec. |

**Total Score**: **32/40** (80.0% — **Good**)

---

## Design Specificity Verdict

**Verdict**: **Authored for EFCC with high civic dignity, with minor layout and content-specificity gaps.**

The Notices screen embodies the **Official Civic Minimal** design language established for 中國基督教播道會顯恩堂. It eschews generic social-media badge clutter in favor of restrained typographic structure: an off-white background (`#f4f5f3`), a unified white card list (`#ffffff`) bounded by hairline dividers (`#d6dcde`), and crisp ink hierarchy (`#171a1d` / `#59636a`). The unread indicators use a disciplined 8px cinnabar dot with transparent spacers on read rows, maintaining flawless left-margin alignment across mixed read/unread states.

However, the screen exhibits two notable areas where design specificity and mobile polish could be deepened:

1. **Generic Notice Copy**: Live notice bodies (e.g., `報名結果 / 你的報名申請已獲核准。`) omit the program/gathering name from the summary text. In contrast, the design export grounded each notice in church life (e.g. `門徒訓練基礎課 · 晚上 7:30`). Without the program title in the card preview, church members enrolled in multiple ministries must tap through to learn which program updated.
2. **Mobile Timestamp Placement**: At viewport widths under 560px, the CSS forces `.itemTime` onto a third line beneath the description rather than keeping it top-right aligned beside the title as shown in `notices.html`. This inflates the card height, leaves excessive empty space on the right side of the card, and breaks the immediate scan-path linking message subject with its arrival time.

---

## Overall Impression

A dignified, focused, and accessible church notification hub that feels quiet and respectful. It communicates unread activity without aggressive pushy aesthetics. The biggest opportunity is restoring top-right timestamp anchoring on mobile and injecting program titles into notification bodies to reduce unnecessary tap-throughs.

---

## What's Working

1. **Disciplined Unread Indicator & Typographic Rhythm**: The 8px dot badge paired with a transparent spacer on read rows keeps all notification titles and body text on a single, clean vertical axis. Screen-reader users receive explicit `<span className="sr-only">未讀</span>` announcements without visual noise.
2. **Cohesive Civic Card Enclosure**: Grouping individual notifications into a single rounded card container (`border-radius: 12px`, `border: 1px solid #d6dcde`) with hairline item dividers reinforces the official record aesthetic over fragmented, floating card clutter.
3. **Direct Bulk Workflow**: The "全部標示已讀" action is accessible at the top of the list, gracefully disabling when unread count reaches zero or while the request is in flight, backed by screen reader live region announcements (`announce()`).

---

## Priority Issues

### [P1] Mobile Layout Drops Timestamp to New Line Creating Excessive Card Height

- **What**: In `notices-panel.module.css` (`@media (max-width: 560px)`), `.itemLink` switches from a 3-column grid to a 2-column grid and places `.itemTime` on `grid-column: 2` with `margin-top: 0.125rem`.
- **Why**: This wraps the timestamp (`今天`) below the description text, inflating card height to over 92px with 60%+ empty white space on the right half of the card. In `notices.html`, the timestamp sits neatly in the top-right corner on the same horizontal baseline as the title.
- **Fix**: Maintain a 3-column grid (`12px minmax(0, 1fr) auto`) or use a nested header row (`display: flex; justify-content: space-between`) for title and timestamp, keeping the timestamp anchored top-right across all mobile viewports.

### [P2] Missing Program Context in Notification Preview Copy

- **What**: Live notification bodies display generic messages (e.g., `報名結果 / 你的報名申請已獲核准。`, `聚會提醒 / 你已報名的聚會即將開始。`) without naming the specific program or event.
- **Why**: Members active in more than one program (e.g., 成人查經 and 青年團契) cannot determine which ministry or gathering is notifying them without clicking through, causing unnecessary navigation and cognitive friction.
- **Fix**: Ensure the backend notice generation or frontend notice renderer incorporates the program title into the preview (e.g. `【成人查經】你的報名申請已獲核准。` or subtitle `成人查經 · 晚上 7:30`).

### [P3] Section Header Instability and Visual Hierarchy Shift

- **What**: The toolbar replaces the section heading (`<h2>最新</h2>` in design export) with `{unreadCount} 未讀`. When all notices are read (`unreadCount === 0`), the unread text unmounts completely, leaving the "全部標示已讀" button floating alone on the right with no left-hand section anchor.
- **Why**: The visual structure of the page shifts when read state changes. An empty left toolbar weakens the boundary between the page header lead text and the list container.
- **Fix**: Retain a permanent section title `<h2>最新消息</h2>` on the left of the toolbar, and place the unread count badge either alongside the heading (e.g., `最新 (2 未讀)`) or within a subtle pill badge.

### [P3] Lack of Tap Affordance for Interactive Destination Links

- **What**: Each notice is a clickable `<a className={styles.itemLink}>` navigating to `/programs?program=...` or `/profile`, but visually appears as a flat text item with no trailing chevron icon (`chevron-right`) or touch indicator.
- **Why**: First-time and senior church members may mistake notice rows for static read-only text alerts and fail to realize tapping the card opens the corresponding program detail or check-in view.
- **Fix**: Add a subtle muted chevron icon (`#aeb8bc`) on the right edge or provide an explicit `:active` highlight background (`#f4f5f3`) to signal interactiveness.

---

## Persona Red Flags

### Casey (Distracted Mobile User)

- **Red Flag 1**: **Timestamp Scannability**: Checking notifications while walking into church gathering, Casey's eye has to zig-zag vertically from Title -> Body -> Time at the bottom left of every item rather than scanning down a unified top-right timestamp column.
- **Red Flag 2**: **Thumb Reach**: "全部標示已讀" sits at the upper right of the screen content (Y ≈ 218px), well outside the natural one-handed bottom thumb comfort zone on modern phones.
- **Red Flag 3**: **Ambiguous Action Target**: When seeing "報名結果", Casey cannot tell which of their two pending applications was approved without leaving the screen.

### Sam (Accessibility-Dependent User)

- **Red Flag 1**: **Live Region Re-render on Read**: When "全部標示已讀" is triggered, the removal of the unread count node and the red dot elements causes layout mutations; while `announce()` works well, the button remains disabled with `opacity: 0.7` and lacks an explicit aria-description explaining why it is disabled.
- **Red Flag 2**: **Focus Outline Visibility**: On keyboard navigation (Tab), `.itemLink` needs high-contrast focus rings (`outline: 3px solid #176a87; outline-offset: -2px;`) to ensure full visibility against the white card background.

### Jordan (First-Timer / Senior Member)

- **Red Flag 1**: **Missing Affordance**: Jordan reads "聚會提醒：你已報名的聚會即將開始。" and does not realize clicking the row opens the event location and check-in QR sheet. A right chevron icon or subtle hint would guide them.
- **Red Flag 2**: **Disappearing Notifications Anxiety**: Without the 90-day retention note mentioned in the design export, Jordan may worry that clicking "全部標示已讀" deletes their past notices permanently.

---

## Minor Observations

- **Lead Text Distinction**: Live lead text is `最新消息與報名狀態。` whereas design export uses `聚會、報名及帳戶相關消息。` — both are clear, but the design export's mention of "帳戶" matches the account update notice kind.
- **Token Consistency**: `.unreadDot` uses `var(--error, #b3261e)`. In the EFCC design token taxonomy, `#9c302c` is the primary Cinnabar Accent for active states. While visually close, aligning on `--accent` preserves design system token semantics.
- **Empty State Pre-styling**: The empty state (`.empty`) is cleanly styled with `border-radius: 12px` and centered copy (`暫無通知`), ensuring graceful degradation when notices expire.

---

## Questions to Consider

1. **Program Title Elevation**: What if notice titles consistently featured the program badge prefix (e.g. `[成人查經] 報名已核准`) so members instantly recognise the context without opening the item?
2. **Inline Action / Direct Check-in**: For event reminders (`kind === "event"`), could the card include a direct "查看聚會" or "立即簽到" secondary micro-action button right on the card?
3. **Retention Guidance**: Should a subtle footer note (`已讀通知會保留 90 日`) be restored at the bottom of the list to clarify notification lifecycle for church members?
