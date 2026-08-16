# Design Prototypes — Provenance

These two files are the authoritative design source for the EFCC webapp
redesign, per `docs/adr/0032-prototype-design-authority.md`.

- `efcc-management-workspace-prototype.html` — 顯恩堂 · 管理工作原型. The
  management-persona surface (Course Cockpit, Management Hub, Departments,
  Approvals, Home Content CMS, system Settings).
- `efcc-participant-checkin-prototype.html` — 顯恩堂 · 會員及簽到原型. The
  participant-persona surface (Home, Programs, Scanner check-in flow,
  Notices, Account).

## What these are

Single-file Bolt-bundled React artifacts: a gzip-compressed asset manifest
plus a JSON-escaped HTML template containing an inline `text/x-dc` logic
script (a `Component extends DCLogic` class holding all mock state,
navigation, and event handlers). Open either file directly in a browser to
walk every screen interactively — no build step required.

## How to read them without a browser

The manifest/template are machine-generated and not meant for direct
reading. To extract the human-relevant content (screen markup, copy, state
machine, validation rules) from either file, decode the two embedded
`<script>` blocks:

1. `script[type="__bundler/manifest"]` — JSON map of `uuid -> {mime,
   compressed, data}`. The runtime asset (`text/javascript`) is
   gzip-compressed base64; decompress with `DecompressionStream('gzip')` or
   equivalent.
2. `script[type="__bundler/template"]` — a JSON string containing the full
   HTML document. `JSON.parse` it to get the real markup, including a
   `<script type="text/x-dc" data-dc-script>` block with all app logic and
   mock data, and an `<x-dc>` element with `sc-if`/`sc-for` template
   directives marking every screen (`sc-if value="{{ onScreenName }}"`).

## Do not

- Do not treat the embedded mock data (`PROGRAMS_INIT`, `MEMBERS_INIT`,
  `APPROVALS_INIT`, etc.) as real fixtures — it is illustrative only.
- Do not port demo-only affordances (`offlineDemo` toggle, scenario
  switchers, `示範資料` labels, the `goSwitchPersona`/`logout` hard-links to
  the sibling prototype file) into production.
- Do not treat a JS-declared screen name with no corresponding view markup
  as a real screen — several `isKnownScreen()` entries in each file are dead
  (verified: `program-notifications`, `participant-approval-detail`,
  `assisted-enrollment` as a screen, `program-settings` as a screen in the
  management file; `guest-scan` in the participant file).

See `docs/specs/084-shell-auth-account-settings.md` through
`docs/specs/087-management-hub-approvals-home-cms.md` for the verified,
production-scoped specs derived from these prototypes.
