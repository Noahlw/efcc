# T13A Assessment A — Messages EMPTY state (source-only, no live reproduction)

**source-only, no live reproduction** — This assessment was performed by static source comparison only. The seeded global `home_content` row was not deleted or mutated, and no live environment was used to reproduce the empty state, per assignment constraints.

## 1. Scope & Method

- Target: `web/lib/messages-panel.tsx` empty-state render branch.
- Comparators: `web/lib/notices-panel.tsx` (ADR-0034 reuse target), `web/app/home/page.tsx` (dashboard empty pattern), `design_export/participant/messages.html` (new screen export), shared CSS `web/lib/notices-panel.module.css`, copy `web/lib/copy.ts`.
- Worktree: `.worktrees/stack-385-389` (stack 385-389).

## 2. Messages Empty Branch (verified)

`web/lib/messages-panel.tsx:96-102` (inside `return` after loading/error guards):

```tsx
{
  state.announcements.length === 0 ? (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>{COPY.home.messagesEmpty}</h2>
      <p className={styles.emptyHint}>{COPY.home.messagesEmptyHint}</p>
    </div>
  ) : (
    <ul className={styles.list} aria-label={COPY.home.messagesListLabel}>
      {" "}
      …{" "}
    </ul>
  );
}
```

Guarded by `state.kind === "ready"` (ListState). Import: `import styles from "@/lib/notices-panel.module.css"` (line 15) — literal reuse, not a copy.

Copy: `web/lib/copy.ts:263-264` => `messagesEmpty: "暫時沒有教會消息"` / `messagesEmptyHint: "有新公告時會在這裡顯示。"`

CSS: `web/lib/notices-panel.module.css:150-168` defines `.empty { padding:2.125rem 1.375rem; border:1px solid var(--line,#d6dcde); border-radius:var(--radius-md,12px); background:var(--surface-raised,#fff); text-align:center }`, `.emptyTitle { margin:0; font-size:1.125rem; line-height:1.4 }`, `.emptyHint { margin:.5rem 0 0; color:var(--ink-muted,#59636a); line-height:1.6 }`.

## 3. Notices Empty Branch (reference)

`web/lib/notices-panel.tsx:187-195`:

```tsx
{
  notices.length === 0 ? (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>{COPY.notices.noticesEmpty}</h2>
      <p className={styles.emptyHint}>{COPY.notices.noticesEmptyHint}</p>
    </div>
  ) : (
    <ul className={styles.list} aria-label={COPY.notices.noticesListLabel}>
      {" "}
      …{" "}
    </ul>
  );
}
```

Copy: `copy.ts:290-291` => `noticesEmpty: "暫時沒有通知"` / `noticesEmptyHint: "有新消息時會在這裡顯示。"`

**Verdict: PASS — exact structural and stylistic reuse.** Same element tree (`div.empty > h2.emptyTitle + p.emptyHint`), same stylesheet import, same conditional pattern (`length===0 ? empty : list`). Only copy strings differ by domain (intentional). Satisfies ADR-0034 “reuse Notices empty-state chrome; do not invent new chrome” — see `.scratch/.../design_export/participant/messages.html:49-56` header comment and `ticket-s2-04-messages.md:6-7` / `spec-368-current.md:16,103-104` referencing ADR-0034.

Loading/error branches also mirror Notices (output aria-busy, p[role=alert]+button.retry) — consistent.

## 4. Home Empty Pattern (intentional divergence)

`web/app/home/page.tsx:453-461`:

```tsx
<section className={styles.emptyCard} data-testid="home-empty-state">
  <h2>{COPY.home.emptyTitle}</h2> // "暫時沒有與你有關的聚會"
  <p>{COPY.home.emptySubtitle}</p> //
  "你未有已報名的聚會。探索課程，尋找合適的參加機會。"
  <Link href="/programs" className={styles.primaryAction}>
    {COPY.home.explorePrograms}
  </Link>
</section>
```

CSS: `web/app/home/home.module.css:43-49,143-158` — `.emptyCard` with centered card + primaryAction CTA.

**Verdict: EXPECTED DIVERGENCE, not a defect.** Home is a dashboard placeholder (needs CTA to /programs), not a list empty. Messages correctly does NOT copy Home's `.emptyCard` + CTA; it copies Notices' `.empty`. This is the design intent.

## 5. Design Export: design_export/participant/messages.html

- **No live empty-state variant rendered in DOM** — must note explicitly per assignment.
- File: `.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/messages.html` (also mirrored in handoff-copy/worktree-archives).
- Body `43-60` comment states: “NEW SCREEN — not present in original Standalone … Empty state h2/p convention: matches production's existing NoticesEmpty pattern (this file shows the populated scenario per this export's own convention — see the trailing comment for the empty-state text).”
- List DOM `79-96` shows 3 populated `<a>` rows only.
- Empty spec is comment-only `111-118`: “EMPTY STATE (not rendered above, per this export's one-scenario-per-file convention…) replace the list container's children with production's existing NoticesEmpty-equivalent card: h2 ‘暫時沒有教會消息’ + p ‘有新公告時會在這裡顯示。’ centered, matching notices-panel.module.css's empty-card treatment exactly (do not invent new empty-state chrome for this screen).”

**Verdict: PASS.** Text matches `COPY.home.messagesEmpty/Hint` exactly. Export intentionally does not render empty DOM — consistent with `home.html` and `notices.html` one-scenario-per-file convention. No discrepancy.

Also checked: no file `design_export/messages.html` at legacy path; canonical path is above.

## 6. Cross-cutting checks

- No hardcoded strings: components use COPY only.
- No new CSS invented: Messages reuses Notices module; no `messages-panel.module.css` exists.
- ADR-0034 file not present as `docs/adr/ADR-0034*` but intent is documented in `spec-368-current.md:104` and `design_export/participant/messages.html:50-56`.
- Accessibility: empty branches render semantic h2+p; list carries `aria-label` when populated; no redundant roles needed.
- Test alignment: `web/lib/messages-panel.test.tsx:51-57` and `notices-panel.test.tsx:157-158` both assert the same h2+p chrome.

## 7. Defects / Risks

- **None blocking.** Lineage is clean.
- Nit: Messages header `教會消息` (`web/lib/messages-panel.tsx:96` + `copy.ts:244`) matches design export `messages.html:72,75` — consistent.
- Future risk: Home's teaser (`page.tsx:463-488`) conditionally renders only when `announcement` exists; Messages list is the only browse surface for history — empty state is therefore critical (correctly implemented).

## 8. Conclusion

Messages EMPTY state faithfully reuses Notices EMPTY chrome per ADR-0034: identical JSX structure, shared stylesheet, parallel conditional. Home EMPTY is intentionally distinct. Design export `messages.html` documents the same empty copy but does not render it (comment-only) — explicitly noted. No live reproduction performed; no data mutated.

Sources: `web/lib/messages-panel.tsx:15,96-102`, `web/lib/notices-panel.tsx:187-195`, `web/lib/notices-panel.module.css:150-168`, `web/app/home/page.tsx:453-461`, `web/app/home/home.module.css:43-49,143-158`, `web/lib/copy.ts:241-244,263-264,290-291`, `.scratch/.../design_export/participant/messages.html:43-60,79-96,111-118`, `spec-368-current.md:16,103-104`, `ticket-s2-04-messages.md:6-7`.
