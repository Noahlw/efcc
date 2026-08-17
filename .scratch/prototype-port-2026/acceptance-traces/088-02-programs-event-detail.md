# 088-02 Participant Programs and Event Detail

Status: proposed acceptance trace, written before production implementation  
Issue: #351  
Base SHA: `07aaf266eccea0a0b9c763791be021d7dc2e5ebe`

## Authority and truth ranking

1. The decoded `script[type="__bundler/template"]` from the binding Standalone
   file, including its inline markup, inline CSS values, and `sc-camel-on-click`
   handlers, is the visual and interaction authority.
2. Issue #351 and the existing production route/RPC contracts constrain how that
   authority is ported. Production behavior, enrollment state, authorization, and
   recovery behavior must be preserved.
3. Observable local DOM state and same-origin response state from focused Vitest
   and local-D1 Playwright are the acceptance evidence.
4. Live browser snapshots/screenshots are supporting evidence only. Generated
   screenshots are not used as a source of truth.

If live browser output disagrees with the decoded source, implement the decoded
source markup/CSS and keep the production route/data contract.

## Binding prototype and source verification

Binding file:

`/Users/noah.wong/Desktop/code/temp/EFCC Participant Check-in (Standalone).html`

SHA-256:

`3e52635e1309600a1957621829c9808f96cac74280aabaeb3940596fbeade1f2`

Before implementation, the file was hash-checked, its
`script[type="__bundler/template"]` payload was parsed with `JSON.parse`, and the
decoded screen blocks were read:

- `sc-if value="{{ onPrograms }}"` — decoded lines 269–325
- `sc-if value="{{ onProgramDetail }}"` — decoded lines 327–387
- `sc-if value="{{ onEventDetail }}"` — decoded lines 389–409

The source screen workflows are:

1. Open `?screen=programs`.
2. On the Programs directory, exercise `全部`, `可報名`, `已參加`, and `待審批`
   manually. Each chip is a 44px pill with `aria-pressed`; the selected chip is
   dark filled with white text, while unselected chips are white with a dark
   border. The real catalog rows remain status-tagged and filter by their
   viewer relationship.
3. Open `?screen=program-detail&program=discipleship`.
4. Open `?screen=event-detail&program=discipleship`.

The embedded browser was opened on the binding `?screen=programs` screen and all
four chips were clicked in sequence. The observed states were:

- `全部`: six source rows, `aria-pressed="true"` only on 全部.
- `可報名`: 慕道入門課程 and 姊妹福音班.
- `已參加`: 門徒訓練基礎課.
- `待審批`: 同行成長小組.

The embedded browser's current pane reported 962×746, so the exact requested
390×844 and 1280×800 layout evidence is supplied by the local Playwright
viewport projects and observable DOM assertions below.

## Source-derived visual contract

### Programs directory

- Contextual header text is `課程`.
- Page heading is `課程`; lead copy is
  `尋找合適的課程，查看聚會及報名狀態。`.
- Search is a full-width search input with an icon, visually pill-like 9px
  radius, 50px minimum height, white background, and `搜尋課程` label and
  placeholder.
- The filter group is horizontally scrollable, labelled `課程篩選`, and uses
  44px minimum-height 99px-radius chips.
- Rows are grouped into one white card with a 1px dark border and 10px radius.
  Each row is a full-width 72px-minimum-height button with 16px padding, a
  bottom separator, a two-column hierarchy, a status badge, title, secondary
  copy, and a chevron.
- Source status badges are distinct:
  success `#9cb49d/#2e6b37/#e9f0ea`, pending
  `#c1ad95/#8a5b16/#f3eee8`, neutral `#d6dcde/#59636a/#ffffff`, and danger
  `#d7a199/#b3261e/#fbecea`.
- Loading, recoverable error, forbidden/unavailable, and zero-match states
  remain readable with production copy and a retry/clear action.

### Program Detail

- Contextual header text is `課程詳情`.
- The source hierarchy is a 72px header, a 44px `課程` back button, a
  conditional 28px status badge, the program `h1`, and purpose copy.
- The next-meeting card is white, 20px padded, 1px `#d6dcde` bordered, and
  10px rounded. It contains the mono-style `下一次聚會` label, meeting title,
  date/time and location rows, optional conflict note, and
  `查看聚會詳情`.
- Schedule and enrollment-history groups are separated by 24px, use the same
  white bordered card hierarchy, and preserve long text by wrapping/scrolling
  within the available width.
- The enrollment action area is sticky above the unchanged shared dock geometry.
  Manager-only, archived, error, unavailable, and no-data copy remains
  production-owned and readable.

### Event Detail

- Contextual header text is `聚會詳情`.
- The source hierarchy is a 72px header, a 44px `返回` button, optional
  `可簽到` success badge, event title, and program name.
- A white 20px-padded metadata card contains date/time and location rows.
- `簽到說明` and its production instruction copy follow the metadata card.
- The sticky bottom action is a full-width 48px red `前往掃描` button above the
  unchanged shared dock/FAB/rail.
- Back navigation returns through the existing history/query-driven boundary;
  the event deep link is `/programs?program=<id>&event=<eventId>`.

## Production route and data contract

Keep the existing flow:

`ProgramsPage -> ProgramsBoundary -> ParticipantDirectory /
ParticipantProgramDetail / ParticipantEventDetailPage -> EventDetail`

Participant detail URLs remain query-driven:

- `/programs?program=<id>`
- `/programs?program=<id>&event=<eventId>`

Do not add pathname-segment routes, `/programs/:id`, demo data, alternate RPC
paths, or a new enrollment implementation. Preserve malformed intent, loading,
forbidden, unavailable, recoverable-error, real catalog/enrollment data, and
server authorization behavior. Do not touch NavBar, global dock/FAB/rail
geometry, Account/Home bodies, scanner/notices/auth/management hub, scanner
copy, or dock labels.

## Observable acceptance assertions

At `390×844` and `1280×800`, the focused checks must assert through DOM or
response state:

- `/programs` renders one main Programs surface, the `搜尋課程` searchbox, a
  `課程篩選` group, four filter buttons, and one selected
  `aria-pressed="true"` chip.
- Clicking each chip changes `aria-pressed`, the visible row set, and the
  status-badge class/style without changing the catalog response or enrollment
  records.
- Search filters by name/description/category and clear restores the same
  real rows.
- Rows preserve status text and open `/programs?program=<id>`; no
  `/programs/<id>` route is emitted.
- Program Detail exposes `課程詳情`, a focusable program heading, status,
  purpose, next-meeting metadata/action when available, schedule/history or
  readable empty state, and a back action.
- Event Detail exposes `聚會詳情`, a focusable event heading, program,
  date/time/location metadata, instructions, `前往掃描`, and back navigation.
- `前往掃描` keeps the selected event in the `/scanner?event=<eventId>` href
  and the subsequent attendance resolve response contains only that event when
  the window is open.
- Malformed, unavailable, forbidden, recoverable-error, empty, and loading
  states expose their existing production copy and observable status/alert
  roles.
- Shell navigation and dock/rail labels remain unchanged; only the contextual
  title changes for the two detail query states.

## TDD seams

Write failing assertions before implementation at these existing public seams:

- `ParticipantDirectory` component: grouped-card structure, searchbox, selected
  filter chip, status badge classes, real viewer-state filtering, empty/error
  readability, and row handoff.
- `ParticipantProgramDetail` component: source hierarchy, next-meeting metadata,
  schedule/history, status/action variants, long/unavailable/error copy, and
  back/open-event callbacks.
- Participant branch of `EventDetail`: source hierarchy, metadata,
  check-in-dependent badge, scan href, error copy, and back callback.
- `parseProgramsIntent` / `buildProgramsHref`: participant program/event query
  contract and malformed input preservation.
- `ShellHeader` and its existing app test seam: contextual `課程詳情` and
  `聚會詳情` titles without changing shared shell navigation.

## Exact local verification commands

From the assigned worktree:

```sh
pnpm --dir web exec vitest run \
  lib/programs/participant-directory.test.tsx \
  lib/programs/participant-program-detail.test.tsx \
  lib/programs/event-detail.test.tsx \
  lib/programs/programs-intent.test.ts
pnpm --dir web typecheck
pnpm db:seed:local
pnpm db:seed:demo
pnpm dev:local
pnpm exec playwright test -c tests/e2e/programs-d1.config.ts \
  --grep 'PUI-02|PUI-03|PUI-05'
pnpm verify
git diff --check
```

`pnpm dev:local` must serve local `wrangler dev` on
`127.0.0.1:8787`; the Playwright command must run against disposable local
`E2E_`/`E2E_DEMO_` D1 fixtures only. No Cloudflare account, Apps Script, Google
Sheet, or `/exec` smoke is part of this gate.
