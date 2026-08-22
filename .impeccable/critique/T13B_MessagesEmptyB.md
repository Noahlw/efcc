# Assessment B: Detector + Source Evidence — Messages, EMPTY State

> **SOURCE-ONLY, NO LIVE REPRODUCTION** — No browser was launched and no D1 state was mutated for this assessment. Reproducing the live empty state would require deleting shared seeded announcements in D1, which is explicitly out of bounds for this wave (clean/unenrolled baseline is read-shared concurrently). All evidence below is CLI detector output and static source inspection of `web/lib/messages-panel.tsx` vs `web/lib/notices-panel.tsx`.

- **Target Surface**: Messages (`/messages`), EMPTY state (`state.announcements.length === 0`)
- **Branch / Worktree**: `feat/389-s2-05-program-detail` (`.worktrees/stack-385-389`)
- **Evaluated File (primary)**: `web/lib/messages-panel.tsx`
- **Comparison File**: `web/lib/notices-panel.tsx` (empty-state copy/structure reference)
- **Shared Styles**: `web/lib/notices-panel.module.css` (both panels import it)
- **Copy Source**: `web/lib/copy.ts`
- **Design Reference (not rendered)**: `design_export/participant/messages.html` — path noted only; not opened in this source-only assessment

---

## 1. CLI Detector Findings

### 1.1 Command

```bash
node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
  /Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/lib/messages-panel.tsx
```

Shim: `scripts/detect.mjs` → `scripts/detector/detect-antipatterns.mjs` → `scripts/detector/cli/main.mjs` + `scripts/detector/engines/regex/detect-text.mjs` (static regex engine for source files; no browser engine invoked for `.tsx` target).

### 1.2 Raw Output

- **Exit code**: `0`
- **Stdout (JSON)**: `[]`
- **Stderr**: empty
- **Total findings**: `0`
- **Rule violations**: none
- **Advisory findings**: none (partition `isAdvisory()` returns 0)

`formatFindings([], jsonMode=true)` emits a single JSON array `[]`; the 0 count drives the non-advisory failure summary `0 anti-patterns found.` and exit 0.

### 1.3 Additional Scan (comparison file, same invocation)

```bash
node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
  /Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/lib/notices-panel.tsx
```

Also `[]` / exit 0 — included only to confirm the comparison file is equally clean; not required by the task but avoids a false delta.

### 1.4 False Positives

None — clean scan has nothing to triage. The detector's regex engine targets CSS-in-JS / inline-style / hard-coded color / typography antipatterns; this panel delegates all visual tokens to the shared CSS module (`notices-panel.module.css`) and to `COPY`, so nothing triggers.

### 1.5 What the Detector Cannot See Here (structural note)

The engine is static-text only for `.tsx` inputs. It does not evaluate runtime state-machine reachability (whether the empty branch is actually reachable when D1 is seeded), contrast ratios of the rendered empty card, or heading hierarchy in the live DOM. Those would require the browser engine (`detect-url` / `detect-html`) against a live render or a static `design_export` HTML file — both deliberately skipped in this source-only wave.

---

## 2. Browser Evidence

**Not captured — intentionally.**

- No tab was opened at `http://127.0.0.1:8787` for this target.
- No login as `E2E_member` was performed.
- No screenshot, accessibility-tree dump, or `elementAt` probe was taken.
- Reason: task directive states _Do NOT attempt live reproduction (would require deleting shared seeded data — out of bounds)_. The seeded D1 currently has announcements; reaching the empty state live would require mutating shared state that another subagent is reading concurrently. This wave's invariant is the clean/unenrolled baseline for that _other_ target; the Messages empty state is therefore proven from source only.

Evidence that _would_ have been collected in a live wave (for record): live screenshot at `/messages` in the `announcements.length === 0` branch, side-by-side `file://` screenshot of `design_export/participant/messages.html` at 390×844, and the live DOM snippet for the `div.empty` subtree. All omitted here.

---

## 3. Source Evidence — Exact Empty-State JSX Block

### 3.1 Messages Panel — `web/lib/messages-panel.tsx:93-103`

Quoted verbatim (lines 93–103, `return` branch after `loading`/`error` early-returns):

```tsx
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{COPY.home.churchNews}</h1>
      </header>
      {state.announcements.length === 0 ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{COPY.home.messagesEmpty}</h2>
          <p className={styles.emptyHint}>{COPY.home.messagesEmptyHint}</p>
        </div>
      ) : (
        <ul className={styles.list} aria-label={COPY.home.messagesListLabel}>
          {state.announcements.map((row) => (
```

Full empty ternary (lines 98–125) for completeness — the condition and the fallback list are part of the block:

```tsx
{
  state.announcements.length === 0 ? (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>{COPY.home.messagesEmpty}</h2>
      <p className={styles.emptyHint}>{COPY.home.messagesEmptyHint}</p>
    </div>
  ) : (
    <ul className={styles.list} aria-label={COPY.home.messagesListLabel}>
      {state.announcements.map((row) => (
        <li key={row.contentId}>
          <Link
            className={homeStyles.listCard}
            href={buildMessagesHref(row.contentId)}
          >
            <span>
              <span className={homeStyles.cardTitle}>{row.title}</span>
              <span className={homeStyles.cardDescription}>
                {row.summary}
                {row.publishedAt
                  ? ` · ${hkMonthDayLabel(row.publishedAt)}`
                  : ""}
              </span>
            </span>
            <Icon name="chevron" className={homeStyles.chevron} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

State machine context (lines 31–91): `ListState = loading | ready(announcements) | error`. Early-returns render `COPY.home.messagesLoading` (`aria-busy="true"`) and `COPY.home.messagesLoadError` + retry. The empty branch only executes inside the final `return` when `state.kind === "ready"` is implied (neither early-return taken) and `announcements` is an empty array. Data source is `listAnnouncements()` (`@/lib/home-api`), no pagination or filter param — length-zero means D1 returned no announcements for the caller.

### 3.2 Notices Panel — `web/lib/notices-panel.tsx:191-202`

Quoted verbatim (lines 191–202):

```tsx
{
  notices.length === 0 ? (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>{COPY.notices.noticesEmpty}</h2>
      <p className={styles.emptyHint}>{COPY.notices.noticesEmptyHint}</p>
    </div>
  ) : (
    <ul className={styles.list} aria-label={COPY.notices.noticesListLabel}>
      {notices.map((notice) => (
        <NoticeRow key={notice.notice_id} notice={notice} />
      ))}
    </ul>
  );
}
```

Full return context (lines 169–203): `NoticesState = loading | ready(result) | error` where `result: { notices, unread_count }`. Empty check is `notices.length === 0` inside the `ready` branch after `loading`/`error` early-returns, wrapped in `<section className={styles.panel} aria-label={COPY.notices.noticesListLabel}>` with a persistent `div.toolbar` above it (unread count + mark-all-read button).

### 3.3 Copy Values — `web/lib/copy.ts`

| Key | Value | Line |
| --- | --- | --- |
| `COPY.home.messagesEmpty` | `暫時沒有教會消息` | 263 |
| `COPY.home.messagesEmptyHint` | `有新公告時會在這裡顯示。` | 264 |
| `COPY.notices.noticesEmpty` | `暫時沒有通知` | 290 |
| `COPY.notices.noticesEmptyHint` | `有新消息時會在這裡顯示。` | 291 |
| `COPY.notices.noticesEmptyTitle` (legacy/alt key, same surface) | `目前沒有新通知` | 524 |
| `COPY.notices.noticesEmptyHint` (second definition under `programs` group, merged at runtime) | `有新通知時會在這裡顯示。` | 525 |

All six strings are Traditional Chinese, centralized in `COPY` per repo convention (`no hardcoded text in components`), satisfying Spec 074 user story 29.

### 3.4 Shared Styles — `web/lib/notices-panel.module.css:150-168`

Both panels import the **same** CSS module:

```ts
// messages-panel.tsx:15
import styles from "@/lib/notices-panel.module.css";
// notices-panel.tsx:13
import styles from "./notices-panel.module.css"; // same file, relative import
```

Empty block tokens (lines 150–168):

```css
.empty {
  padding: 2.125rem 1.375rem;
  border: 1px solid var(--line, #d6dcde);
  border-radius: var(--radius-md, 12px);
  background: var(--surface-raised, #fff);
  text-align: center;
}

.emptyTitle {
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.4;
}

.emptyHint {
  margin: 0.5rem 0 0;
  color: var(--ink-muted, #59636a);
  line-height: 1.6;
}
```

No inline styles, no hard-coded colors, no per-panel override — the class names and token values are identical at render time.

---

## 4. Confirmation — Does Messages Match Notices Empty Copy/Structure?

**Yes — structure is identical; copy follows the same pattern with surface-appropriate wording.**

| Dimension | Messages (`messages-panel.tsx:98-102`) | Notices (`notices-panel.tsx:191-195`) | Match? |
| --- | --- | --- | --- |
| **Conditional guard** | `state.announcements.length === 0 ? (` | `notices.length === 0 ? (` | ✅ Same pattern (length-zero ternary inside `ready` branch) |
| **Container** | `<div className={styles.empty}>` | `<div className={styles.empty}>` | ✅ Exact |
| **Heading** | `<h2 className={styles.emptyTitle}>{COPY.home.messagesEmpty}</h2>` | `<h2 className={styles.emptyTitle}>{COPY.notices.noticesEmpty}</h2>` | ✅ Same element + class; COPY key is surface-specific |
| **Hint** | `<p className={styles.emptyHint}>{COPY.home.messagesEmptyHint}</p>` | `<p className={styles.emptyHint}>{COPY.notices.noticesEmptyHint}</p>` | ✅ Same element + class; COPY key is surface-specific |
| **CSS module** | `notices-panel.module.css` (via `@/lib/…`) | `notices-panel.module.css` (via `./…`) | ✅ Same file |
| **No CTA in empty branch** | No button/link inside `div.empty` | No button/link inside `div.empty` | ✅ Same (both CTAs live in the non-empty branches or, for notices, the toolbar) |
| **Copy semantics** | `暫時沒有教會消息` / `有新公告時…` | `暫時沒有通知` / `有新消息時…` | ✅ Parallel phrasing; differs only by domain noun (`教會消息` vs `通知`, `公告` vs `消息`) |
| **Surrounding chrome** | `div.page > header.pageHeader > h1.pageTitle` (`教會消息`) above the ternary | `section.panel[aria-label] > div.toolbar` (unread count + 全部標示已讀) above the ternary | ⚠️ Chrome differs (expected — different surfaces); the empty block itself is still identical |

**Code-level confirmation, not runtime:** this was established by reading the two files at the cited line ranges, not by rendering. The empty-state JSX is a direct copy-paste with only the `COPY` namespace and the length-checked array swapped.

---

## 5. Structural & Visual Facts (from Source, Not Screenshots)

- **State machine**: `loading → ready | error`. Empty is a sub-state of `ready` (array length check), not a separate `ListState` variant. Both panels use the same `if (loading) return …; if (error) return …; return (… empty ? … : …)` shape.
- **No empty-state illustration / icon**: Neither panel renders an `Icon` inside `div.empty`. The empty UX is title + hint only. (Design export `messages.html` — uninspected here — would need separate visual comparison in a live wave.)
- **Accessibility**:
  - Loading branch uses `<output className={styles.state} aria-busy="true">` in both panels (messages: `div.page > output`; notices: `section.panel > output`).
  - Error branch uses `<p className={styles.error} role="alert">` + `<button className={styles.retry}>` in both.
  - Empty branch: no `role="status"` / `aria-live` wrapper, no illustration `alt`, heading is `h2` under the page `h1` (messages) — correct hierarchy. Notices empty lives inside `section[aria-label="通知清單"]`, so it inherits the landmark label; messages empty inherits `aria-label="教會消息清單"` only when non-empty (the `ul` carries it) — minor landmark-label gap when empty, but not a detector rule.
- **No retry / CTA in empty**: Empty branch does not offer a `重試載入` button or a link to another surface. Rotation/retry is only in the `error` branch. This matches notices (its `div.toolbar > button.markAll` is disabled when `notices.length === 0` / `unread_count === 0`, but the empty block itself still has no CTA).
- **Card vs list divergence (non-empty only)**: Messages non-empty renders `homeStyles.listCard` (from `app/home/home.module.css`) inside `styles.list`; notices non-empty renders `NoticeRow` with `styles.item` / `styles.itemLink`. The divergence does not leak into the empty branch.
- **Stale-request guard**: Notices has `requestVersion` ref + cleanup (`++requestVersion` on unmount) to drop late `listNotices()` results; messages has no version guard (single `load` callback, no ref). Not relevant to the empty branch but noted for parity.

---

## 6. Detector vs Source — What Was NOT Flagged and Why

The detector's static engine looks for hard-coded hex colors, un-tokenized spacing, generic font stacks, and inline `style=` antipatterns. This file cleanly avoids all of them:

- All spacing/border/background via `var(--line)`, `var(--surface-raised)`, `var(--ink-muted)` in the shared module.
- No `<style>` block or `style={{…}}` prop in `messages-panel.tsx`.
- No custom font stack in the file; typography is inherited from `notices-panel.module.css` (`font-size: 1.125rem`, `line-height: 1.4/1.6`).

Hence `[]` is a true negative, not a false negative — the file has no CSS-in-JS or hard-coded-style surface for the engine to flag. A meaningful antipattern here (if one existed) would be a duplicated empty-state CSS block or a hard-coded Chinese string inline, and neither is present.

---

## 7. Run Summary Table

| Category | Item | Result / Observation |
| --- | --- | --- |
| **Scope** | Target file | `web/lib/messages-panel.tsx` (128 lines; empty branch 98–102) |
| **Comparison** | Reference file | `web/lib/notices-panel.tsx:191-195` — same structure |
| **Detector** | Command | `detect.mjs --json <messages-panel.tsx>` |
| **Detector** | Exit / Findings | `0` / `0` (`[]`) |
| **Detector** | False positives | None (no findings to triage) |
| **Detector** | Notices-panel scan | Also `0` (`[]`) — parity clean |
| **Source** | Empty JSX | `div.empty > h2.emptyTitle(COPY.home.messagesEmpty) + p.emptyHint(COPY.home.messagesEmptyHint)` — quoted §3.1 verbatim |
| **Source** | Copy match | Mirrors notices pattern `div.empty > h2.emptyTitle(COPY.notices.noticesEmpty) + p.emptyHint(COPY.notices.noticesEmptyHint)` — §4 table = **identical structure, surface-appropriate copy** |
| **Source** | Styles | Shared `notices-panel.module.css:150-168` — `.empty`/`.emptyTitle`/`.emptyHint` reused, no drift |
| **Source** | CTA in empty | None in either panel |
| **Browser** | Live screenshot | **Not captured** — source-only per task |
| **Browser** | Design export screenshot | **Not captured** — source-only per task |
| **Browser** | Live DOM / a11y tree | **Not captured** — source-only per task |
| **State** | D1 mutation | None — no enrollment request, no deletion, no login |

---

## 8. Files Referenced

- `web/lib/messages-panel.tsx` — primary target (empty ternary 98–102, early-returns 66–91, state 17–49)
- `web/lib/notices-panel.tsx` — comparison (empty ternary 191–195, state 15–18, toolbar 175–190)
- `web/lib/notices-panel.module.css` — shared empty styles (150–168)
- `web/lib/copy.ts` — copy keys (263–264, 289–291, 524–525)
- `web/lib/home-api.ts` / `web/lib/hk-time.ts` — data + `hkMonthDayLabel` (non-empty branch only, not exercised here)
