# Design Prototypes — Provenance

For Spec 088, the operator-provided **Standalone** files are binding (see **Binding originals** below). The two HTML files in this folder are snapshots of those Standalone exports, per `docs/adr/0032-prototype-design-authority.md`.

- `efcc-management-workspace-prototype.html` — 顯恩堂 · 管理工作原型. The management-persona surface (Course Cockpit, Management Hub, Departments, Approvals, Home Content CMS, system Settings).
- `efcc-participant-checkin-prototype.html` — 顯恩堂 · 會員及簽到原型. The participant-persona surface (Home, Programs, Scanner check-in flow, Notices, Account).

## What these are

Single-file Bolt-bundled React artifacts: a gzip-compressed asset manifest plus a JSON-escaped HTML template containing an inline `text/x-dc` logic script (a `Component extends DCLogic` class holding all mock state, navigation, and event handlers). Open either file directly in a browser to walk every screen interactively — no build step required.

## How to read them without a browser

The manifest/template are machine-generated and not meant for direct reading. To extract the human-relevant content (screen markup, copy, state machine, validation rules) from either file, decode the two embedded `<script>` blocks:

1. `script[type="__bundler/manifest"]` — JSON map of `uuid -> {mime, compressed, data}`. The runtime asset (`text/javascript`) is gzip-compressed base64; decompress with `DecompressionStream('gzip')` or equivalent.
2. `script[type="__bundler/template"]` — a JSON string containing the full HTML document. `JSON.parse` it to get the real markup, including a `<script type="text/x-dc" data-dc-script>` block with all app logic and mock data, and an `<x-dc>` element with `sc-if`/`sc-for` template directives marking every screen (`sc-if value="{{ onScreenName }}"`).

## Do not

- Do not treat the embedded mock data (`PROGRAMS_INIT`, `MEMBERS_INIT`, `APPROVALS_INIT`, etc.) as real fixtures — it is illustrative only.
- Do not port demo-only affordances (`offlineDemo` toggle, scenario switchers, `示範資料` labels, the `goSwitchPersona`/`logout` hard-links to the sibling prototype file) into production.
- Do not treat a JS-declared screen name with no corresponding view markup as a real screen — several `isKnownScreen()` entries in each file are dead (verified: `program-notifications`, `participant-approval-detail`, `assisted-enrollment` as a screen, `program-settings` as a screen in the management file; `guest-scan` in the participant file).

See `docs/specs/084-shell-auth-account-settings.md` through `docs/specs/088-visual-shell.md` for the verified, production-scoped specs derived from these prototypes. Spec 088 (visual Shared Shell) additionally requires implementers to **open the Standalone HTML files in a browser** at each `?screen=` — reading a spec, `CONTEXT.md`, `design/*.html` (if hashes diverge), or `127.0.0.1:8787` is not looking at the prototype.

## Binding originals (Spec 088)

Open these paths. They are the operator-provided prototypes:

- `/Users/noah.wong/Desktop/code/temp/EFCC Participant Check-in (Standalone).html` SHA-256 `3e52635e1309600a1957621829c9808f96cac74280aabaeb3940596fbeade1f2`
- `/Users/noah.wong/Desktop/code/temp/EFCC Management Workspace (Standalone).html` SHA-256 `b101731d680e4c18054be396048207a355d73ce46135701ecfd83579dbc52754`

The two files in this folder are snapshots. If `shasum -a 256` disagrees with the Standalone files, **Standalone wins** — recopy before continuing.

**Not the prototype** (do not restyle against these):

- `docs/specs/design-tree-efcc-redesign.html` — retired (ADR-0032)
- `web/out/prototype.html` — old civic-minimal export
- `prototype/scanner/prototype-index.html` — old scanner stub
- `127.0.0.1:8787` — production chrome being changed
- Spec prose, `CONTEXT.md`, or screenshot galleries **without** opening the Standalone HTML

Open a screen from the Standalone file, e.g. `.../EFCC Participant Check-in (Standalone).html?screen=home` (management cockpit screens also `&program=discipleship&mode=management`). Phone reference viewport is 390×844; desktop is 1280×800. Shell breakpoint in production is 920px (ADR / Spec 084). Screen inventory: `docs/specs/088-prototype-screen-map.md`.
