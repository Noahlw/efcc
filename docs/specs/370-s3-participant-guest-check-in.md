# Spec: S3 — Participant and guest check-in (from #370)

Status: Ready for agent
Parent: Decision ticket [#370](https://github.com/Noahlw/efcc/issues/370). **#370 stays as the
originating decision ticket and is not otherwise modified.** This document is the buildable spec.
Baseline: `main` @ `0780062b`.
Blocked by: S2 (#368 / #383 / #396) — merged.

---

## Parent

#370 was written as a build ticket on the premise that the participant and guest check-in journey
was largely unbuilt. Reconnaissance against `main` disproves that premise. Ten attendance endpoints
ship, idempotency is enforced by partial unique indexes, audit outcomes are written on every
terminal path, and ~3,100 lines of tests cover the flow. Two of #370's stated build items are
already satisfied and one is unreproducible.

Rather than amend #370, this spec records the corrected premise and the work that actually remains.
The mechanism mirrors S2: #368 stayed immutable and #383 carried the buildable deltas.

**Prior art that #370 does not cite.** `docs/specs/085-participant-experience.md` (US 25–40) and its
acceptance traces `.scratch/prototype-port-2026/acceptance-traces/085-05-scanner-resolve.md` and
`085-06-scanner-confirm.md` already specified this flow under issues #308/#313. Both traces are
satisfied by shipped code and tested in `web/lib/self-check-in-panel.test.tsx`. Spec 085 was marked
superseded during S2 with "Scanner stories deferred to S3", but the scanner stories were
*implemented*, not deferred. S3 does not rebuild their behaviour; it rebuilds their presentation.

---

## Problem Statement

### P1 — The design source cited by #370 does not exist

`.scratch/efcc-redesign-handoff-2026-08-18/` contains four empty subdirectories and no files. Every
path in #370's "Read first" list resolves to nothing. The live package is
`/Users/noah.wong/Desktop/temp/efcc-redesign-handoff-2026-08-18/` and stays untracked; the `.scratch`
copy is being deleted.

**Consequence for this spec:** every normative fact is inlined below. Design-tree paths are
provenance footnotes, never dependencies. This spec must remain executable after its source is
deleted.

### P2 — Camera QR scanning is dead on every iPhone

`web/lib/use-qr-camera.ts:33-41` hard-gates the camera on `window.BarcodeDetector`:

```ts
const cameraAvailable = useState(() =>
  typeof window !== "undefined" &&
  Boolean(window.BarcodeDetector && navigator.mediaDevices?.getUserMedia)
)[0];
```
WebKit implements no Barcode Detection API, so Safari, Chrome iOS, and every other iOS browser
resolve `cameraAvailable = false`, fire `onUnavailable()` on mount, and never render a viewfinder.
Firefox is equally affected. In a Hong Kong congregation this is the majority device. The dock
renders `COPY.sections.scanner` — **簽到** today (`copy.ts:287` via `sections.ts` → `nav-bar.tsx`);
the design's 掃描 is the delta D5 will adopt, not the current name.

**This constraint was known, recorded, and then lost.** Two research notes in this repository
rejected exactly the design that later shipped:

> "For a phone-first church app (iPhone Safari is a primary target), a `BarcodeDetector`-only design
> is **non-functional on iOS**. It is acceptable *only* as an internal accelerator inside a library
> that has its own fallback decoder."
> — `docs/research/2026-07-31-external-scanner-origin-approach.md:145`

`docs/research/2026-08-01-f5-qr-scanner-best-method.md:106` lists `BarcodeDetector`-only as option D
and marks it **"Reject as sole strategy"**, citing MDN BCD and Can I Use. Its recommended shape —
"uses native `BarcodeDetector` when present, bundled decoder otherwise"
(`2026-07-31…:147`) — is structurally the decision this spec adopts in D2. The knowledge did not
survive the Apps Script → D1 migration: the D1 scanner shipped the rejected design, and no test
catches it because `web/lib/use-qr-camera.test.tsx` installs a stub detector.

The camera ADR produced by S3-02 must cite both notes, so the constraint stops being re-discovered.

### P3 — The shipped surfaces were never designed

`docs/adr/0037-warm-community-visual-system.md` reskinned the six S2 participant Sections. `/scanner`
and `/guest-check-in` are outside its scope and were not in PR #423's screens table. They are the
last participant surfaces still in the pre-S2 visual language.

### P4 — 42 concrete deltas between the design and production

Full table with per-delta direction in [Delta register](#delta-register). Counts:

| Group | Subject | Count |
| --- | --- | --- |
| A | Structure & information architecture | 9 |
| B | Copy & labels | 13 |
| C | States & transitions | 5 |
| D | Tokens / visual | 9 |
| E | Accessibility & responsive | 6 |
| | **Total** | **42** |

Roughly fifteen of these are places where **production is deliberately better than the prototype**.
Porting them design-ward would be a regression. See [Frozen contracts](#frozen-contracts).

### P5 — The guest surface has no completion state

`web/lib/attendance-panel.tsx:52-60` announces a live-region string on success. There is no
confirmation screen. #370 requires "a safe completion state"; an unauthenticated visitor currently
receives only an ARIA announcement as evidence their attendance was recorded.

### P6 — Two closed contradictions from #370, recorded

- **"Repair the documented normal `onScanContext` blank path."** Not reproducible in production.
  `web/lib/self-check-in-panel.tsx:285-376` is a total fallback; every `events: []`, unknown-event,
  not-enrolled and malformed-intent tuple lands on `scan + invalidEntry` or a `ScannerOutcome`.
  Prototype bug B1 is a `currentProgramKey`-vs-`eventCtx` race in the demo harness with no
  production analogue. The acceptance criterion is **kept** and satisfied by a characterization
  test, so the rebuild cannot reintroduce the failure mode.
- **"Is 聚會開始前 30 分鐘 hardcoded?"** No. `web/lib/attendance.ts:374-380` computes openness from
  `event.check_in_window_opens_at` / `closes_at`, and
  `web/lib/attendance-scanner-ui.tsx:454-468` renders the 30-minute clause only when the event
  actually opens 30 minutes early. `7:00 PM` and the unconditional clause are prototype literals.

---

## Solution

Make the Scanner Section camera-first. A plain `/scanner` entry immediately becomes a full-screen
dark camera surface and starts the camera/decoder probe; it does not show the method list first. The
live state contains only a short overlay instruction, the middle scanning frame and one bottom
`停止掃描` action. No top chrome appears, but the persistent Shared Shell dock/rail remains visible.

When the user stops scanning, release camera tracks and return to a light fallback surface with two
equal, real controls: `輸入代碼` and `出示會員 QR`. When camera permission is denied, explain the
cause and recovery, show a separate primary `重試相機` action, and keep the two fallback cards
available. When the browser/device cannot provide a usable decoder, omit retry and show the same
fallback cards. Manual entry is an in-flow screen, not an always-visible entry card.

A deep link carrying `program_token`, `manual_code` or `event` skips camera opening and resolves its
known intent directly. Guest entry remains public, one visible step for the common single-event
case, and never requests camera permission.

Add the iOS/Firefox QR decode fallback and freeze every server, authorization, audit, state and
accessibility contract that production already establishes. The prototype at `.scratch/s3-prototype/`
is the visual authority: faithful export geometry for non-camera states, hardened full-screen camera
states, and clarified copy hierarchy.

---

## Frozen contracts

The rebuild owns markup, layout, copy, tokens and screen sequence. It **may not** weaken any of the
following. Each is cited so an implementer cannot mistake it for a delta to "fix".

| # | Frozen contract | Production evidence | Prototype equivalent |
| --- | --- | --- | --- |
| F-01 | Server natural-key attendance dedup | `web/migrations/0004_attendance_guest_checkin.sql:117-125` — `attendances_active_event_member_idx`, `attendances_active_event_guest_phone_idx` | `checkedInEvents[key] = true` in browser memory |
| F-02 | Audit row on every terminal outcome | `web/lib/attendance.ts:478-513, 627-679, 749-781` — `attendance.check_in` with `SUCCESS` / `DUPLICATE` / `DENIED` + reason | none |
| F-03 | Server enrollment + window + status gates | `web/lib/attendance.ts:266-279` (`hasActiveEnrollment`), `616-683` (`checkInGate`) | hardcoded `'discipleship'` |
| F-04 | Distinct member / guest / operator authorization paths, never collapsed to a client flag | `attendance.ts:785-857` (member, `requireActor`), `983-1066` (guest, `actor(..., false)`), `1087-1148` (operator, `requireAssistedEventOperator`) | none |
| F-05 | `查看課程詳情` links to the resolved program | `web/lib/attendance-scanner-ui.tsx:530-532` — `buildProgramsHref({ programId: outcome.latest.program_id })` | hardcoded `openProgram('intro')` |
| F-06 | Programmatic focus to the heading of each step | `web/lib/self-check-in-panel.tsx:63-96` | none — live region only |
| F-07 | Localized Traditional Chinese announcements on every transition | `web/lib/use-attendance-flow.ts:148-184` | falls back to raw `"scan-chooser"` |
| F-08 | Fallback method list is one full-width control per row at every phone width; no 2-up false-affordance grid | new S3 method-list contract, prototype `.scratch/s3-prototype/` | export 2-column grid at `scan.html:93-95` |
| F-09 | `aria-busy` on every submitting control | `self-check-in-panel.tsx:363`, `attendance-scanner-ui.tsx:317` | `disabled` only |
| F-10 | `pattern="[0-9]{6}"` + non-digit stripping on the code input | `self-check-in-panel.tsx:350-352` | `maxLength` only |
| F-11 | Dedicated retry control on recoverable submit failure, focused via `retryRef` | `self-check-in-panel.tsx:187, 257-262` | user re-taps the primary button |
| F-12 | Guest duplicate is a distinct, non-error state | `attendance-panel.tsx:53-59` → `此電話已簽到。如需協助，請聯絡聚會負責人。` | not modelled |
| F-13 | **Multi-event chooser on both member and guest paths.** Any code resolving to more than one open event must present an explicit selection step. | `handleResolve` returns `{ events: [...] }` (`attendance.ts:593, 613`); `ScannerChooser` (member), `ScannerEventPicker` (guest) | member only, two hardcoded rows |
| F-14 | Guest credential handoff to login survives | `web/lib/guest-context.ts:50`, `web/app/page.tsx:113-114`, proven by `web/lib/app.test.tsx:282-299` | none |
| F-15 | Terminal states are in-flow, not addressable routes | `self-check-in-panel.tsx:220-285` | prototype models them as screens |
| F-16 | Dynamic check-in window derivation | `attendance.ts:374-380`, `attendance-scanner-ui.tsx:454-468` | literal `7:00 PM` |
| F-17 | Plain `/scanner` entry opens the camera immediately; credential deep links skip camera and resolve directly | `use-attendance-flow.ts:226-243` is the deep-link seam; new camera-first entry contract | current manual-first panel |
| F-18 | Live camera is full-screen dark with only one bottom stop action; fallback methods are hidden until stop/failure | new S3 interaction contract, prototype `.scratch/s3-prototype/` camera frames | current card-bound camera + always-visible method grid |
| F-19 | Permission denied and unsupported/unavailable are distinct states; denied gets retry, unsupported does not promise retry | `getUserMedia` failure vs capability probe outcome in `use-qr-camera.ts:82-110` | one generic `cameraUnavailable` state |

Governing rule: **ADR-0036 Product Contract Precedence.** Where the export conflicts with
authentication, authorization, route/state behaviour, accessibility, responsive usability or shared
design tokens, the contract wins and the export loses.

---

## User stories

### Camera-first member flow

1. As a Member entering plain `/scanner`, I want the camera to start immediately, so that check-in
   feels like opening a camera tool rather than configuring a form.
2. As a Member, I want the live Scanner Section to be a full-screen dark camera surface, so that
   the QR frame is the only visual focus.
3. As a Member, I want one short instruction above the middle scan frame, so that I understand what
   the frame is for without a card full of competing content.
4. As a Member, I want one bottom `停止掃描` action while the camera is live, so that I can release
   the camera and reveal other methods when I choose.
5. As a Member whose camera permission was denied, I want a clear explanation and a `重試相機`
   action, so that I can enable permission in browser settings and try again.
6. As a Member on an unsupported device/browser, I want the product to say camera scanning is
   unavailable without promising a retry that cannot work, so that I can use another method
   immediately.
7. As a Member after stopping or failing camera startup, I want two equally clear fallback choices —
   `輸入代碼` and `出示會員 QR` — so that the recovery screen stays simple and actionable.
8. As a Member, I want the manual screen to ask for the six-digit Event Manual Check-In Code, so
   that typing remains a dependable fallback.
9. As a Member, I want to show my Member QR for a leader to scan, so that a missing camera or
   missing event code does not block attendance.
10. As a Member whose code matches several open meetings, I want to choose explicitly, so that I am
    never checked into the wrong meeting.
11. As a Member, I want to confirm the meeting before anything is recorded, so that a misread code
    is reversible at zero cost.
12. As a Member, I want success, already-checked-in, not-yet-open, cancelled and not-enrolled to
    each look like a considered outcome rather than an error.

### Guest surface

13. As a visitor, I want one form asking for the meeting code, my name and my phone, so that
    check-in at the door is a single action.
14. As a visitor, I want a real completion screen, so that I know my attendance was recorded and
    can put my phone away.
15. As a visitor arriving by the printed venue QR, I want the meeting already resolved, so that I
    only supply my own details.
16. As a visitor, I do not want a camera permission prompt on a page where I have not yet identified
    myself.
17. As a visitor whose phone is already checked in, I want a neutral, non-alarming message.

### Cross-cutting

18. As any user at 320px, I want every check-in surface to fit without horizontal scrolling.
19. As a screen-reader user, I want each step change announced in Traditional Chinese with focus
    moved to the new heading.

### D1 — Faithful prototype precedes implementation

One prototype at `.scratch/s3-prototype/` reproduces the seven `design_export/participant/*.html`
screens verbatim — `scan`, `scan-chooser`, `scan-context`, `checkin-result`, `scan-outcome`,
`guest-checkin`, `guest-result` — plus the hardened states production requires that the export does
not draw (camera opening/live, stop-to-fallback, permission denied, unsupported, manual entry, invalid
code, offline, submitting, submit-failed, quiet duplicate, cancelled, not-enrolled, guest validation,
guest duplicate, long-content stress, the desktop manual-only boundary and the Account shortcut).
23 frames, grouped into six sections, each citing its export lines or its extension reason on the frame.
Geometry is taken from the export for the light non-camera states: `max-width 680px` main
(`scan.html:52`), 72px chrome (`scan.html:82`), 280px pre-camera viewfinder with one square border
inset 15% (`scan.html:87`). The camera-first live states intentionally override that pre-camera
geometry with a full-screen dark surface, open-corner frame and persistent navigation; the fallback
method list is one full-width control per row.
The demo scenario switcher (`scan.html:99-126`) is absent — `design_export/README.md` flags it
demo-only and this spec lists it under "Design bugs not to port".

Where the export diverges from the shipped EFCC tokens, both values are present and switched by
`[data-tokens]` on `<html>`, so Group D resolves by looking. See [Group D](#group-d--tokens--visual).
No Style Tile round is required — the design already exists in `design_export`; this prototype's job
is fidelity plus hardening, not invention.

The design-system selection artifact is `.scratch/s3-system-prototypes/index.html`: three candidates
(Civic Minimal Continuity, Camera-first Utility, Warm Operational Ledger) render the same 9
representative surfaces — eight S3 frames and one S7 operator mode-switch frame — with two composition
modes but one shared token/control grammar. **Selected system: A — Civic Minimal Continuity.**
S7 preserves the management export's top `本人簽到` / `代為簽到` switch and the global Shared Shell
dock; chooser, roster, audited mutations and settings remain separate S7 scope rather than being
designed prematurely in S3.

### D2 — QR decode fallback

`barcode-detector@3.2.2` (MIT), **ponyfill entry only** — `barcode-detector/ponyfill`. It exports a
class whose `async detect()` returns `{ rawValue, format, boundingBox, cornerPoints }`
(`dist/es/zxing-exported.js:2327-2347`), satisfying the existing type at `use-qr-camera.ts:4-6`
verbatim. The per-frame loop at `use-qr-camera.ts:128-151` is untouched; only the capability gate
changes, from a boolean to a lazily-resolved constructor.

Measured cost, loaded only when `window.BarcodeDetector` is absent:

| Asset | gzipped |
| --- | --- |
| ponyfill JS | 17 KB |
| `zxing_reader.wasm` | 446 KB (1.09 MB raw), fetched once, cached |

**Self-hosting is mandatory.** The package default fetches the binary from a third-party CDN:

```js
// dist/es/zxing-exported.js:526
return n ? `https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.3/dist/${n[1]}/${e}` : t + e;
```

A church application must not fetch a 1 MB binary from jsDelivr at check-in time — reliability,
privacy and CSP all forbid it. `setZXingModuleOverrides` must point at a same-origin asset, and a
test must assert no jsDelivr request is ever issued. The ponyfill entry is used rather than the
polyfill entry so no global is patched.

#### Capability resolution — the load-order trap

The current gate cannot be fixed by a lazy import alone. `useState(initializer)[0]` discards the
setter, so `cameraAvailable` is **frozen at first render**; the effect at `use-qr-camera.ts:53-57`
then fires `onUnavailable()` and the surface stays dark forever. A ponyfill imported after mount is
a silent no-op on exactly the devices it exists to serve.

**Decision: resolve the capability as tri-state inside the hook.** `cameraAvailable` becomes
`boolean | null` — `null` while probing. Native detector present → `true` synchronously, so Chrome
and Android are unchanged and download nothing. Absent → import the ponyfill, then settle `true` or
`false`. `reportUnavailableOnMount` fires only on a definitive `false`, never while probing.

Rejected alternative: preloading before first render at route entry. It forces a route-level await
on `/scanner` and `/guest-check-in` for users who need nothing, and spreads a load-order requirement
into route files instead of containing it in the hook.

Ripple is four files: `use-qr-camera.ts`, `use-attendance-flow.ts:38, 207, 258`,
`self-check-in-panel.tsx:301`, and `attendance-scanner-ui.tsx:75-81` — where `cameraAvailable` is
already optional with a default. Fallback methods remain hidden while live and become available only
after `停止掃描` or a camera-start failure.

The load-order E2E observes the rendered state rather than a start-button data attribute: plain
`/scanner` must enter `scan-opening`, settle to `scan-live` when the ponyfill is ready, and never
render fallback method controls while live. A failed probe must settle to `scan-denied` or
`scan-unsupported` with the correct recovery hierarchy.

**The probe must always terminate.** Tri-state introduces a failure mode the boolean gate could not
have: a `null` that never settles renders neither a viewfinder nor the unavailable notice, which is
the same silent dead end P2 documents. Every non-success path resolves to a definitive `false` and
the existing camera-unavailable state:

| Probe outcome | Resolves to |
| --- | --- |
| Native `BarcodeDetector` present | `true`, synchronously, no import |
| Ponyfill import rejects (offline, chunk 404, blocked) | `false` |
| Wasm fetch fails (self-hosted asset missing, offline, CSP) | `false` |
| Wasm instantiation throws | `false` |
| Neither settles within the probe timeout | `false` |
| Decoder ready | `true` |

`null` is therefore only ever transient. While probing, the surface renders the manual-first state
**without** the camera affordance — never a third empty state — so a visitor can complete check-in
by code regardless of how the probe ends. `reportUnavailableOnMount` fires once, on the definitive
`false`.

A timeout is required, not optional: a stalled fetch never rejects, so error handling alone cannot
guarantee termination.

### D2b — Camera-first entry and permission recovery

Plain `/scanner` entry has one camera-first state machine:

```
plain /scanner
  → scan-opening
  → scan-live                         [camera stream + decoder ready]
  → scan-fallback                     [user taps 停止掃描; tracks released]

scan-opening
  → scan-live                         [permission/decoder ready]
  → scan-denied                       [permission denied]
  → scan-unsupported                  [no usable decoder/device camera]

scan-denied
  → scan-live                         [重試相機 succeeds]
  → scan-fallback                     [輸入代碼 or 出示會員 QR]

scan-unsupported
  → scan-fallback                     [輸入代碼 or 出示會員 QR]
```

The live surface is dark and full-screen, with no top chrome but persistent Shared Shell navigation.
On phone it keeps the existing light floating dock; on desktop the rail remains visible and is
dark-themed only while live Scanner is active. The live surface contains one short overlay hint,
one middle scan frame and one bottom `停止掃描` action positioned immediately above the dock/rail
safe area. The opening state keeps the same dark surface and frame, announces `正在開啟相機…`, and
disables the stop action until the stream is ready.

`重試相機` is shown only when the failure reason is permission denial or another recoverable
`getUserMedia` failure. Its message is complete and actionable:

`相機權限未開啟。請在瀏覽器設定允許相機，再按「重試相機」。`

Unsupported/unavailable has no retry promise:

`相機掃描不可用。你仍可用以下方式簽到。`
Both failure states show equal light fallback controls with short visible labels `輸入代碼` and
`出示會員 QR`; supporting lines retain the full outcome. The manual screen is a light in-flow state;
the Member QR action navigates to the existing Account Section, which already renders the Member QR.
No new QR screen is introduced. Deep links carrying `program_token`, `manual_code` or `event` skip camera
opening and resolve their known intent directly. At desktop width, `/scanner` renders only manual
Event Manual Check-In Code entry while the Shared Shell rail remains; it never renders the camera
Scanner page. `/guest-check-in` remains outside this camera-first contract and never requests camera
permission.

### D3 — Guest flow

One visible step. Submit chains `resolve` → `guestCheckIn` behind a single action. **No server
change is required**, because:

- `handleResolve` authenticates optionally — `actor(request, env, id, false)` at
  `attendance.ts:584, 598` — so a guest may resolve.
- `deriveCheckInMethod` resolves a bare `entry` server-side via `resolveEntryMethod`
  (`attendance.ts:327-343`), so one `聚會代碼` field covers both a Program token and an Event manual
  code with no client-side length heuristic.
- `handleGuestCheckIn` requires `event_id` plus a credential (`attendance.ts:999-1007`), which the
  chained resolve supplies.

Resolution arity, per F-13:

| Open events matched | Behaviour |
| --- | --- |
| 0 | Inline error on the form. Nothing written. |
| 1 | Complete in one visible step. |
| >1 | Interstitial selection step, then complete. |

The in-page camera is removed from `/guest-check-in`. The printed sheet already encodes the guest
deep link —
`checkInUrl: ${origin}/guest-check-in?program_token=${token}` at
`web/lib/programs/programs-events-panel.tsx:410` — and `useAttendanceFlow` consumes it at
`use-attendance-flow.ts:232-236`, so a visitor using their phone's native camera on the wall QR
already lands pre-resolved. The in-page viewfinder was redundant for that path, is dead on iOS, and
prompts for camera permission before any identity exists.

`ScannerChooser` (member) and `ScannerEventPicker` (guest) converge on one component.

### D3b — Three check-in methods and fallback hierarchy

The Scanner Section has three server-backed methods, but the camera is the only method shown on
plain entry. The other two appear after `停止掃描` or a camera failure:

| # | Method | Visible when | Destination / server method |
| --- | --- | --- | --- |
| 1 | 掃描課程 QR | `scan-opening` → `scan-live` | `self_qr_scan` |
| 2 | 輸入代碼 | `scan-fallback`, `scan-denied`, `scan-unsupported` | `self_manual_code` |
| 3 | 出示會員 QR | `scan-fallback`, `scan-denied`, `scan-unsupported` | `/account` (existing Account Section; its Member QR is scanned by the operator path) |

The fallback cards have equal visual weight and short visible titles. Supporting lines explain the
next consequence. The design's 2-up grid that paired a `<button>` with a `<div role="note">` of
near-identical styling (`scan.html:94-95`) is not reproduced; while live, no method cards are shown.

### D4 — Terminal screens are in-flow states

`checkin-result`, `scan-outcome` and `guest-result` become full-bleed presentations under the
existing `/scanner` and `/guest-check-in` routes. No new routes. This continues spec 085's
Task-granularity ruling ("the confirmation step is an in-flow state, not a new page") and keeps
ADR-0035 origin-aware navigation intact. Addressable terminal states would each need a cold-load
redirect guard, reintroducing the blank-render class of bug by construction.

### D5 — Section naming

**掃描** becomes canonical for the Section name, adopting the design
(`efcc-participant-checkin-prototype.dc.html:413`). `COPY.sections.scanner` (`copy.ts:287`
via `sections.ts` → `nav-bar.tsx`) and `COPY.attendance.title` (`copy.ts:48`) change from
簽到 to 掃描 — two strings; the page H1 `聚會簽到` already matches the design and is unchanged,
and `web/app/prototype/` is excluded. Justified now that D2 makes
the camera function on every device.

### D6 — Shared-component fork

`AssistedScannerPanel` imports exactly one shared component, `ScannerStatusOutput`
(`assisted-scanner-panel.tsx:398`), and is S7 scope with no tile and no design authority. The
rebuild introduces its own status component for the two designed surfaces and leaves the existing
one serving assisted untouched. The duplication is deliberate and temporary; the S7 ticket collapses
it. This follows the S2 rule recorded in `e8866332`: do not backport cross-screen seams into
reviewed slices.

### D7 — Copy direction

Default to the export's wording. Override only where the design bakes in a literal that production
derives, or where production's string tells the user how to succeed and the design's does not. Every
override carries a reason. See Group B in the [Delta register](#delta-register).

---

## Delta register

Direction values: **ADOPT** design · **KEEP** production · **HYBRID** (reason required).

### Group A — Structure & information architecture

| ID | Surface | Design | Production | Direction |
| --- | --- | --- | --- | --- |
| A-01 | scan | Manual entry is a modal overlay (`<aside role="dialog" aria-modal="true">`, prototype 653-668) | Inline conditional form (`self-check-in-panel.tsx:329-372`) | **KEEP** — inline is correct (locked `manual first-class`), but the surface now lists two full-width method rows — every row a real control — rather than the export's 2-up grid that paired a button with a div note. |
| A-02 | guest | Single consolidated form, one submit | Two-step resolve → identity (`attendance-panel.tsx:87-180`) | **ADOPT** — per D3, one visible step, chooser only when ambiguous |
| A-03 | guest | Top back-link `返回` | Two footer links (`attendance-panel.tsx:190-212`) | **HYBRID** — adopt the top `返回`; keep `登入後以成員身份簽到`, which carries the F-14 credential handoff |
| A-04 | guest | No camera on the guest form | Embedded `ScannerCamera` (`attendance-panel.tsx:81-86`) | **ADOPT** — remove, per D3 |
| A-05 | guest-result | Full card: 64×64 check circle, `<h1>`, lead, full-width `完成` | Inline live status only (`attendance-panel.tsx:52-60`) | **ADOPT** — closes P5 |
| A-06 | scan-chooser | Flat grid of bordered button rows, 72px min-height, trailing chevron | Semantic `<ul>` (`attendance-scanner-ui.tsx:170-188`) | **HYBRID** — adopt the visual row treatment; keep the list semantics |
| A-07 | scan-context | 72px header, back `重新掃描`, badge `已辨識`, `<h1> 確認聚會`, lead | Header inside the card (`attendance-scanner-ui.tsx:264-290`) | **ADOPT** |
| A-08 | checkin-result | 72px header `簽到結果`, content at `padding-top:15vh`, 64×64 icon | Card layout (`attendance-scanner-ui.tsx:362-401`) | **ADOPT** |
| A-09 | scan-outcome | Centered `padding-top:8vh`, 72px header `簽到狀態`, 64×64 status icon | Section card (`attendance-scanner-ui.tsx:489-543`) | **ADOPT** |

### Group B — Copy & labels

Adopted strings are normative and reproduced verbatim.

| ID | Surface | Direction | Normative string |
| --- | --- | --- | --- |
| B-01 | scan header | **ADOPT** | `掃描` |
| B-02 | scan errors | **ADOPT** | invalid: `找不到此代碼對應的聚會，請確認後重試。` · offline: `現時沒有網絡，未能核實聚會資料。請重新連線後再試一次。` |
| B-03 | code input | **ADOPT with exception** | label `六位數代碼`, placeholder `例如 482913` (design's `000000` reads as a literal value to type; guest form's `例如 482913` is kept for both per Q7) |
| B-04 | code submit | **HYBRID** | idle `繼續`; busy keeps shipped `查找中…` (`copy.ts:69`) — no invention |
| B-05 | scan-outcome, not yet open | **HYBRID** | `此聚會的簽到時段將於 {time} 開始（聚會開始前 {n} 分鐘）。開放後可以重新掃描或輸入代碼簽到。` — adopt the wording, keep the derived time and the conditional clause (F-16). The design's `7:00 PM` and unconditional `30 分鐘` are literals. |
| B-06 | guest back | **HYBRID** | `返回` as the back affordance; retain `登入後以成員身份簽到` (F-14) |
| B-07 | guest lead | **ADOPT** | `輸入聚會代碼及聯絡資料，完成今次出席記錄。` |
| B-08 | guest code field | **ADOPT** | label `聚會代碼`, placeholder `例如 482913` |
| B-09 | guest name field | **KEEP** | keep `姓名` (design's `中文姓名` demands a Chinese name from a visitor who may not have one; `姓名` per Q7) |
| B-10 | guest phone hint | **HYBRID** | `只用於今次聚會跟進。例如：9123 4567 或 +852 9123 4567` — the design states purpose, production states format; a visitor needs both |
| B-11 | guest validation | **ADOPT** | `請輸入聚會代碼、姓名及電話。` |
| B-12 | guest submit | **ADOPT** | `確認簽到`; busy variant required by F-09 |
| B-13 | guest-result | **HYBRID** | `訪客簽到完成` / `完成` adopted verbatim. Lead becomes `歡迎參加{period}聚會。你的資料已安全提交。` — `今晚` is hardcoded in the design and must derive from event start. **Reuse `hkDayPeriod` (`web/lib/hk-time.ts:52-60`), which already returns 早上 / 下午 / 晚上 on tested cutoffs (`<12` / `<18` / else).** Note it currently takes `hour24: number`, not an ISO string, and is module-private — export it or wrap it; do not reimplement period logic with different edges. |

### Group C — States & transitions

| ID | Design | Production | Direction |
| --- | --- | --- | --- |
| C-01 | `不是這個聚會` always resets to scan | Returns to the chooser when >1 event resolved (`self-check-in-panel.tsx:204-218`) | **KEEP** — F-13 |
| C-02 | No retry control | Dedicated focused `重試簽到` | **KEEP** — F-11 |
| C-03 | `查看課程詳情` → hardcoded `intro` | Resolved `program_id` | **KEEP** — F-05 |
| C-04 | No mode tabs | Capability-gated 本人簽到 / 協助簽到 tablist (`scanner-boundary.tsx:241-271`) | **KEEP** — assisted entry is S7 scope and out of the tile round |
| C-05 | No guest duplicate state | Distinct info-tone duplicate | **KEEP** — F-12 |

### Group D — Tokens / visual

Resolves per value by measurement (ADR-0036 precedence: accessibility outranks export geometry).
The prototype exposes both via `[data-tokens]` on `<html>`, so Group D can be decided by looking.

| ID | Export | Shipped | Contrast check | Resolution |
| --- | --- | --- | --- | --- |
| D-01 card radius | 10px | 12px | no a11y stake | **KEEP shipped** — matches the six S2 Sections already on 12px |
| D-02 button radius | 9px | 8px | no a11y stake | **KEEP shipped** |
| D-03 border `--line-strong` | #868182 on white 3.83 | **#aeb8bc on white 2.02 — FAILS 3.0** | 3.0 non-text minimum | **ADOPT export** — shipped value is a live a11y defect (`attendance-panel.module.css:98,152`) |
| D-04 hover | #8c2e2a | #76231f | no contrast stake | **KEEP shipped** |
| D-05 focus ring | #6495aa on surface 2.99 — **FAILS 3.0** | #176a87 on surface 5.57 | 3.0 UI component minimum | **KEEP shipped** |
| D-06 success pill | #e9f0ea / #9cb49d | #eef4ef / #b9cfbe | both pass 4.5 | **KEEP shipped** |
| D-07 pill radius | 99px | 999px | none | **KEEP shipped** |
| D-08 heading scale | clamp 1.72-2.25rem / 600 | 1.5rem / 800 | none | **KEEP shipped** |
| D-09 eyebrow tracking | 0.08em | 0.04em | none | **KEEP shipped** |

### Group E — Accessibility & responsive

| ID | Direction |
| --- | --- |
| E-01 focus management | **KEEP** — F-06 |
| E-02 localized announcements | **KEEP** — F-07 |
| E-03 fallback method rows | **KEEP** — F-08: one full-width row, no 2-up grid at any width |
| E-04 live camera frame | **ADOPT** — full-screen dark camera with an open-corner frame centered in the remaining viewport; fallback/manual screens do not render camera |
| E-05 input mode & pattern | **KEEP** — F-10 |
| E-06 `aria-busy` | **KEEP** — F-09 |

---

## Normative state machine

The target, in production terms. Prototype edges that encode demo-harness bugs are excluded and
listed under [Design bugs not to port](#design-bugs-not-to-port).

```
                       ┌──────────────── /scanner (self) ────────────────┐

plain /scanner -------------------------------> scan-opening
deep link /scanner?event=<id> | ?program_token=<t> | ?manual_code=<c>
  --------------------------------------------> resolve(known intent; skip camera)

scan-opening --[camera/decoder ready]----------> scan-live
scan-opening --[permission denied]-------------> scan-denied
scan-opening --[unsupported/unavailable]-------> scan-unsupported

scan-live --[QR decoded]-----------------------> resolve(entry)
scan-live --[停止掃描]--------------------------> scan-fallback [release tracks]

scan-denied --[重試相機 succeeds]---------------> scan-live
scan-denied --[輸入代碼]------------------------> scan-manual
scan-denied --[出示會員 QR]--------------------> /account [existing Member QR]

scan-unsupported --[輸入代碼]------------------> scan-manual
scan-unsupported --[出示會員 QR]---------------> /account [existing Member QR]

scan-fallback --[輸入代碼]---------------------> scan-manual
scan-fallback --[出示會員 QR]------------------> /account [existing Member QR]

scan-manual --[六位數代碼 + 繼續]--------------> resolve(entry)
resolve → 0 open events  --> scan-manual      [inline B-02 invalid; nothing written]
resolve → network failure --> scan-fallback    [inline B-02 offline; nothing written]
resolve → 1 open event   --> scan-context      [confirmation]
resolve → n>1 open events --> scan-chooser
resolve → ineligible     --> scan-outcome(kind)

scan-chooser --[重新掃描]--> scan-opening
scan-chooser --[select row]--> scan-context

scan-context --[不是這個聚會, n>1]--> scan-chooser [nothing written]
scan-context --[不是這個聚會, n=1]--> scan-opening [nothing written]
scan-context --[確認簽到 → 201 success]--> checkin-result(success)
scan-context --[確認簽到 → 200 duplicate]--> checkin-result(duplicate)
scan-context --[確認簽到 → recoverable error]--> scan-context [inline error + focused 重試簽到]

scan-outcome(kind ∈ {window-not-open, cancelled, not-enrolled, forbidden})
scan-outcome --[返回掃描]--> scan-opening
scan-outcome --[查看課程詳情, not-enrolled only]--> /programs?programId=<resolved>

checkin-result --[返回首頁]--> /home
checkin-result --[再次簽到]--> scan-opening

                    ┌──────────── /guest-check-in (public) ────────────┐

login --[訪客簽到]--> guest-checkin
printed QR --> /guest-check-in?program_token=<t> --> guest-checkin (auto-resolve)

guest-checkin --[確認簽到]--> resolve(entry) then guestCheckIn
    → 0 events        --> guest-checkin [inline B-11 / B-02 invalid; nothing written]
    → 1 event         --> guest-result(success | duplicate)
    → n>1 events      --> guest-chooser --[select]--> guest-result(success | duplicate)
    → validation fail --> guest-checkin [inline B-11]
    → offline         --> guest-checkin [inline B-02 offline; nothing written]

guest-result --[完成]--> login
guest-checkin --[返回]--> login
guest-checkin --[登入後以成員身份簽到]--> login (credential preserved, F-14)
```

Every node above is an in-flow state of its route (D4). None is separately addressable.

### Server outcome vocabulary (unchanged, F-02/F-04)

Success union — `web/lib/programs/program-api.ts:1238-1244`:
`success` (201) · `duplicate` (200, `attendance_id` deliberately omitted) · `voided` · `already_voided` · `corrected`

Problem codes reachable from these two surfaces — `web/lib/attendance.ts:119-133`:
`AUTH_REQUIRED` 401 · `FORBIDDEN` 403 · `VALIDATION` 422 · `NOT_FOUND` 404 ·
`CHECK_IN_CLOSED` 409 · `EVENT_CANCELLED` 410 · `EVENT_UNAVAILABLE` 409 ·
`INVALID_CHECK_IN_ENTRY` 403 · `ENROLLMENT_REQUIRED` 403 · `DUPLICATE_ATTENDANCE` 409 ·
`RATE_LIMITED` 429 · `UNAVAILABLE` 503

Audit actions — `attendance.ts:478-513`: `attendance.check_in` with outcome `SUCCESS` |
`DUPLICATE` (`ACTIVE_ATTENDANCE_EXISTS`) | `DENIED` (`EVENT_CANCELLED`, `EVENT_UNAVAILABLE`,
`ACCOUNT_NOT_ACTIVE`, `CHECK_IN_CLOSED`, `ACTIVE_ENROLLMENT_REQUIRED`).

---

## Design bugs not to port

1. **B1 — `onScanContext` blank on the normal scenario.** `resolveScan()`'s default branch sets
   `eventCtx` but leaves `currentProgramKey` null, while `scan-context` reads
   `st.programs[st.currentProgramKey]`. Demo-harness race. Production passes the resolved
   `AttendanceEvent` object directly into `ScannerConfirmation`.
2. **`viewIntroFromOutcome` hardcoded to `intro`.** See F-05.
3. **Dead `guest-scan` route key.** Referenced by `AUTH_SCREENS` with no template. Ignore.
4. **Missing `announce()` entries** for `scan-chooser`, `scan-context`, `scan-outcome`. See F-07.
5. **Unconditional `可簽到` badge on Event Detail.** Governed by the S2 `self_check_in_available`
   server projection (#401), not by the prototype's static pill.
6. **Client-memory duplicate tracking.** See F-01.
7. **Method list false affordance (scan.html:94-95).** The export pairs a `<button>輸入聚會代碼</button>` with a `<div role="note">只在你按下後使用相機</div>` of near-identical border, padding and radius (only `#868182` vs `#d6dcde` differs). The note looks like a peer control on the scan entry, and on the camera-unavailable path it directly contradicts the alert above it. The rebuild lists two full-width method rows — every row a real control — and makes the permission reassurance a quiet hint line (prototype fix verified in `.scratch/s3-prototype/`).

---

## Testing decisions

### Seams

External behaviour only. **Zero new test files and zero new seams** — every seam below already
exists. Prefer the highest seam that can observe the behaviour.

| Seam | Files | Carries | Change |
| --- | --- | --- | --- |
| **Primary — component** | `self-check-in-panel.test.tsx`, `attendance-panel.test.tsx` | Every ADOPT/HYBRID delta in Groups A/B/C/E · guest arity 0/1/n · the non-blank characterization · focus and announcement contracts | extend |
| **Load-order — E2E** | `tests/e2e/attendance-d1.test.ts`, `programs-vertical-proof.test.ts` | Detector-absent camera availability · seven-width responsive · guest single-step end to end · no third-party origin request | extend |
| Regression only | `attendance-worker.test.ts` | **No new tests.** D3 establishes that S3 requires no server change; if this file needs edits, the spec's premise is wrong and the change must be re-reviewed, not absorbed. | unchanged |
| Regression only | `assisted-scanner-panel.test.tsx` | Proves the D6 fork left the operator surface untouched | unchanged |
| Regression only | `attendance.test.ts`, `attendance-entry.test.ts`, `scanner-intent.test.ts` | Pure units; move only if copy constants move | unchanged |

Two seams are **deliberately not created**:

- No direct `use-attendance-flow` test. The chained resolve → submit and the 0/1/n arity branching
  are observable through both panels; a dedicated seam would assert what the panel seam already
  proves.
- No new `use-qr-camera` test beyond the existing file. Its stubs are structurally blind to load
  order — see below.

### The load-order asymmetry

`use-qr-camera.test.tsx` installs a stub `BarcodeDetector` before render. It therefore **cannot
fail** on the trap described in D2: a ponyfill imported after mount passes every unit assertion
while leaving every real iPhone dark. Unit coverage of the decoder is necessary but not sufficient,
and must not be mistaken for proof.

The only seam that catches it is E2E, using the suite's established `addInitScript` idiom
(`shell-nav.test.ts`, `home.test.ts`, `responsive.test.ts`, `account-settings.test.ts`):

1. `page.addInitScript(() => { delete (window as { BarcodeDetector?: unknown }).BarcodeDetector; })`
   before navigation, so the page loads with no native detector.
2. Assert plain `/scanner` enters `scan-opening`, imports the ponyfill before the probe deadline,
   transitions to `scan-live`, renders no fallback methods while live, and keeps the persistent
   navigation visible. A permission-denied fixture must instead land on `scan-denied` with
   `重試相機`; an unsupported fixture lands on `scan-unsupported` without retry.
3. Assert `停止掃描` releases the stream and transitions to the light fallback with equal `輸入代碼`
   and `出示會員 QR` controls. Assert no request to any origin other than the application's own is
   issued for the wasm.

- Every adopted delta needs a test that would fail on the prior behaviour. Group D is exempt —
  token values are asserted by the prototype's export/shipped token toggle and the measured table,
  not by unit tests.
- The blank-state characterization test asserts non-blankness across the zero-event, unknown-event,
  not-enrolled and malformed-intent tuples. It passes on day one by design; its purpose is to make
  the rebuild unable to regress F-15.
- Playwright at the seven widths locked by ADR-0036: 320×844, 375×844, 390×844, 414×844, 799×900,
  800×900, 1440×900, against local `wrangler dev` + local D1 with `E2E_` fixtures per ADR-0029.
- Plain `/scanner` E2E enters the opening state and starts the camera automatically; no method cards
  are present while live. The live state asserts a dark full-screen surface, one short hint, one
  middle frame, the persistent navigation and only `停止掃描`.
- Stop releases camera tracks and reveals the light fallback surface with equal `輸入代碼` and
  `出示會員 QR` controls. Permission-denied asserts failure/cause/recovery copy plus `重試相機`;
  unsupported/unavailable asserts no retry promise.
- No suite in this repository can prove iOS. Playwright drives Chromium; WebKit-in-Playwright is not
  Safari, and a spoofed user agent does not remove an API. The detector-deleted E2E proves the
  fallback path; the iPhone smoke in [Verification](#verification) is a required, honestly-labelled
  manual step, not optional evidence.

---

## Out of scope

- Management roster, attendance correction, void, guest correction — S7.
- The assisted / operator scanner surface. It keeps the current `ScannerStatusOutput` untouched (D6).
- S7 operator runtime implementation remains separate; the single S7 mode-switch frame in
  `.scratch/s3-system-prototypes/` is design-system compatibility evidence only, not S3 build scope.
- Any new backend table or endpoint. The traced contract is sufficient; D3 proves the guest rebuild
  needs no server change.
- An offline submission queue. `production-route-intent.json` places it explicitly out of scope;
  the contract is inline error plus manual retry.
- Event Detail pre-window presentation (#398) — remains its own ticket.
- A new visual language beyond the faithful export and clarified camera-first mode. The live camera
  is the only dark full-screen mode; fallback/manual/Member-QR surfaces stay light.

---

## Acceptance criteria

- Every one of the 42 deltas has a recorded direction, and every **ADOPT** and **HYBRID** delta is
  visibly satisfied and covered by a test that would fail on the prior behaviour.
- No frozen contract F-01 … F-19 is weakened. Each has an assertion or an explicit citation showing
  it is untouched.
- Plain `/scanner` enters `scan-opening` and automatically starts the camera probe; credential
  deep links skip camera opening and resolve directly.
- `scan-opening` and `scan-live` are full-screen dark camera states with no top chrome, a short
  overlay hint, one middle scan frame, and the persistent navigation visible. The live state exposes
  only `停止掃描`; the opening state disables it until the camera is ready.
- `停止掃描` releases camera tracks and reveals a light fallback surface with equal `輸入代碼` and
  `出示會員 QR` controls. The Member QR control navigates to the existing Account Section; no new
  Member QR screen or in-flow waiting state is introduced. No fallback method appears while live.
- Permission-denied shows `相機權限未開啟。請在瀏覽器設定允許相機，再按「重試相機」。` and a
  separate primary `重試相機`; unsupported/unavailable shows no retry promise.
- Camera QR scanning works on iOS Safari and Firefox via the lazily-loaded ponyfill, with the wasm
  served same-origin and no third-party request issued.
- With the native detector removed before page load, the opening state settles to live or to the
  correct denied/unsupported fallback; the probe never remains indefinite.
- The persistent mobile dock remains visible over live camera, with `停止掃描` positioned above its
  height and safe-area inset. The desktop rail remains visible, but desktop `/scanner` renders only
  manual Event Manual Check-In Code entry — never the camera Scanner page.
- Chromium and Android Chrome download neither the ponyfill nor the wasm.
- Guest check-in completes in one visible step for a single open event, presents a selection step
  when several are open, writes nothing when zero match, and ends on a real completion screen.
- `/guest-check-in` issues no camera permission prompt.
- The normal scan context never renders blank for any reachable state tuple; the characterization
  test proves it.
- Repeated submission creates no duplicate attendance; audit rows and outcomes are unchanged.
- Terminal states remain in-flow and unaddressable; no new route is introduced.
- Responsive and accessibility checks pass at all seven ADR-0036 widths, including keyboard-only
  completion when no decoder is available.
- `pnpm --dir web typecheck` and `pnpm --dir web test:components` pass.

## Verification

1. Prototype at `.scratch/s3-prototype/` reviewed — 23 frames (camera opening/live, fallback, denied,
   unsupported, manual, invalid/offline, Account shortcut, faithful export states, terminal states,
   guest states and stress) at 320/390/430, with persistent dock in camera frames, zero clipped
   overflow and zero sub-44px targets — before production file changes.
2. Relevant component, Worker and Playwright suites green at the seven widths against local
   `wrangler dev` + local D1 with fresh `E2E_` fixtures.
3. Exercise plain `/scanner` auto-open, live `停止掃描` → fallback, permission denied → retry,
   unsupported → no retry, manual code, Member QR → Account navigation, valid, expired, not-enrolled,
   forbidden, duplicate, network-failure, zero-event, multi-event, decoder-absent and keyboard-only
   paths.
4. Verify desktop `/scanner` renders only manual Event Manual Check-In Code entry and never the camera
   Scanner page; verify the desktop rail remains visible.
5. Verify repeated submission and audit behaviour against the real server contract. A screenshot or
   a local state toggle is not proof.
6. **Required manual iPhone smoke**, recorded in the camera ticket: a real iPhone against local
   `wrangler dev` over LAN, entering plain `/scanner`, observing the permission prompt, reaching the
   live camera, tapping `停止掃描`, and completing via manual code after denial. Note device, iOS
   version and browser.
7. Scoped impeccable audit per ticket, limited to the files that ticket touches. Fix every mechanical
   finding; list anything requiring judgement for review rather than deciding it silently.
8. Final layer is verification-only: no production runtime, API, schema or Cloudflare changes.

---

## Planned implementation slices (not yet opened)

These are planning boundaries only. No child issues are opened by this session. When authorized,
each slice should stack linearly on the previous branch and reviewed slices must never be force-updated.
| Slice | Title | Blocked by | Output |
| --- | --- | --- | --- |
| S3-01 | Camera-first prototype + shared-component fork | — | `.scratch/s3-prototype/` → `web/` camera/fallback visuals; `ScannerStatusOutput` fork per D6 |
| S3-02 | QR decode fallback + self-hosted wasm + camera ADR | — (parallel with S3-01) | `barcode-detector/ponyfill`, auto-open probe, denied/unsupported split, same-origin wasm, ADR superseding 0015 |
| S3-03 | Wire the camera-first member flow and three methods | S3-01, S3-02 | live dark camera + persistent nav, stop-to-fallback, manual code, Member QR, chooser/confirm/result/outcome, desktop manual-only boundary |
| S3-04 | Rebuild guest: single form, completion screen, camera removal + guest ADR | S3-01, S3-03 | one-step guest flow, `guest-result`, duplicate/validation states, ADR-0028 pointer |
| S3-05 | CONTEXT.md and ADR-0015 supersession | S3-02, S3-04 | glossary corrections and new terms |
| S3-06 | Verify S3 integration gate | S3-01 … S3-05 | verification-only PR, no production diff |

Two ADRs, each independently reversible: camera/decode (supersedes ADR-0015), guest check-in
surface contract. No separate visual-system ADR — the faithful prototype is authoritative on visuals;
Group D resolves per value by measurement and is recorded in the spec, not a new ADR.

## Handoff to the next slice

S7 consumes: the attendance result and problem-code vocabulary reproduced above, the audit action and
outcome set, the idempotency keys (`event_id + member_user_id`, `event_id + guest_phone_normalized`),
the converged chooser component, and the `ScannerStatusOutput` fork introduced by D6 — which S7 is
responsible for collapsing once the operator surface has its own design authority.

## Stop condition

Stop when both check-in surfaces match the ADR-recorded visual system, camera scanning works on iOS,
guest check-in is one step ending in a real completion screen, every frozen contract is provably
intact, and the integration gate is green. Do not expand into operator roster or correction work, do
not invent a backend contract beyond the traced seam, and do not restyle the assisted scanner.
