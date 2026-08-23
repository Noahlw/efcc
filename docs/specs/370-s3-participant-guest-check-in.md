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
Firefox is equally affected. In a Hong Kong congregation this is the majority device. The dock tab
is named 掃描.

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

Rebuild the presentation of `/scanner` (self mode) and `/guest-check-in` against the extracted
design, to a visual language chosen by a rendered Style Tile round held **before** implementation.
Add a lazily-loaded QR decode fallback so camera scanning works on iOS and Firefox. Freeze every
server, authorization, audit, state and accessibility contract that production already establishes.

Ordering is deliberately inverted from S2. S2 built the functional stack first and reskinned it last
(#422 → ADR-0037 → PR #423), which meant reworking six freshly shipped Sections. S3 picks the target
first so the rebuild has one unambiguous destination.

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
| F-08 | Single-column method grid below 560px | `web/lib/attendance-panel.module.css:316-320` | 2-column at every width |
| F-09 | `aria-busy` on every submitting control | `self-check-in-panel.tsx:363`, `attendance-scanner-ui.tsx:317` | `disabled` only |
| F-10 | `pattern="[0-9]{6}"` + non-digit stripping on the code input | `self-check-in-panel.tsx:350-352` | `maxLength` only |
| F-11 | Dedicated retry control on recoverable submit failure, focused via `retryRef` | `self-check-in-panel.tsx:187, 257-262` | user re-taps the primary button |
| F-12 | Guest duplicate is a distinct, non-error state | `attendance-panel.tsx:53-59` → `此電話已簽到。如需協助，請聯絡聚會負責人。` | not modelled |
| F-13 | **Multi-event chooser on both member and guest paths.** Any code resolving to more than one open event must present an explicit selection step. | `handleResolve` returns `{ events: [...] }` (`attendance.ts:593, 613`); `ScannerChooser` (member), `ScannerEventPicker` (guest) | member only, two hardcoded rows |
| F-14 | Guest credential handoff to login survives | `web/lib/guest-context.ts:50`, `web/app/page.tsx:113-114`, proven by `web/lib/app.test.tsx:282-299` | none |
| F-15 | Terminal states are in-flow, not addressable routes | `self-check-in-panel.tsx:220-285` | prototype models them as screens |
| F-16 | Dynamic check-in window derivation | `attendance.ts:374-380`, `attendance-scanner-ui.tsx:454-468` | literal `7:00 PM` |

Governing rule: **ADR-0036 Product Contract Precedence.** Where the export conflicts with
authentication, authorization, route/state behaviour, accessibility, responsive usability or shared
design tokens, the contract wins and the export loses.

---

## User stories

### Scan surface — member

1. As a Member on an iPhone, I want the camera scanner to work, so that the 掃描 tab does what its
   name says on the device I actually own.
2. As a Member, I want the scan surface to present camera and manual code entry as peers, so that
   typing a code is a first-class path and not an apology.
3. As a Member whose browser cannot decode, I want an immediate, clearly worded manual-code path,
   so that a missing capability never blocks check-in.
4. As a Member whose code matches several open meetings, I want to choose explicitly, so that I am
   never checked into the wrong meeting.
5. As a Member, I want to confirm the meeting before anything is recorded, so that a misread code is
   reversible at zero cost.
6. As a Member, I want success, already-checked-in, not-yet-open, cancelled and not-enrolled to each
   look like a considered outcome rather than an error, so that a normal situation never reads as a
   failure.

### Guest surface

7. As a visitor, I want one form asking for the meeting code, my Chinese name and my phone, so that
   check-in at the door is a single action.
8. As a visitor, I want a real completion screen, so that I know my attendance was recorded and I
   can put my phone away.
9. As a visitor arriving by the printed venue QR, I want the meeting already resolved, so that I
   only supply my own details.
10. As a visitor, I do not want a camera permission prompt on a page where I have not yet identified
    myself.
11. As a visitor whose phone is already checked in, I want a neutral, non-alarming message.

### Cross-cutting

12. As any user at 320px, I want every check-in surface to fit without horizontal scrolling.
13. As a screen-reader user, I want each step change announced in Traditional Chinese with focus
    moved to the new heading.

---

## Implementation decisions

### D1 — Style Tile round precedes implementation

Three complete tiles rendered as static HTML under `.scratch/s3-style-tiles/`, covering all seven
states:

`scan` · `scan-chooser` · `scan-context` (confirm) · `checkin-result` · `scan-outcome` ·
`guest-checkin` · `guest-result`

The viewfinder is drawn as a representative still frame (dark plate, corner reticles, sample QR) —
a static tile cannot hold a camera stream, and the stream's appearance is fixed by the video element
regardless. Compared side by side at 320 and 390. Colours stay on the existing EFCC token palette;
tiles contribute layout language only, exactly as ADR-0037 constrained S2. The pick is recorded as a
new ADR before any production file changes.

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
already optional with a default. Manual code entry is a first-class peer (A-01, D5), so it remains
available for the whole probe and no loading state is required.

`attendance-scanner-ui.tsx:113` already emits `data-camera-available={cameraAvailable}` on the start
button. That is the observable the load-order E2E asserts; no new test affordance is needed.

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

### D4 — Terminal screens are in-flow states

`checkin-result`, `scan-outcome` and `guest-result` become full-bleed presentations under the
existing `/scanner` and `/guest-check-in` routes. No new routes. This continues spec 085's
Task-granularity ruling ("the confirmation step is an in-flow state, not a new page") and keeps
ADR-0035 origin-aware navigation intact. Addressable terminal states would each need a cold-load
redirect guard, reintroducing the blank-render class of bug by construction.

### D5 — Section naming

**掃描** becomes canonical across the dock tab, the page header and the glossary, adopting the design
(`efcc-participant-checkin-prototype.dc.html:413`). `COPY.sections.scanner` and
`COPY.attendance.title` change from 簽到 to 掃描 (`web/lib/copy.ts:287`). Justified now that D2 makes
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
| A-01 | scan | Manual entry is a modal overlay (`<aside role="dialog" aria-modal="true">`, prototype 653-668) | Inline conditional form (`self-check-in-panel.tsx:329-372`) | **KEEP** — an inline peer to the camera expresses "manual first-class" (locked in `production-route-intent.json`); a modal frames it as a fallback. Tile round confirms the composition. |
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
| B-03 | code input | **ADOPT** | label `六位數代碼`, placeholder `000000` |
| B-04 | code submit | **HYBRID** | idle `繼續`; a busy variant is required by F-09 and has no design counterpart — use `繼續中…` |
| B-05 | scan-outcome, not yet open | **HYBRID** | `此聚會的簽到時段將於 {time} 開始（聚會開始前 {n} 分鐘）。開放後可以重新掃描或輸入代碼簽到。` — adopt the wording, keep the derived time and the conditional clause (F-16). The design's `7:00 PM` and unconditional `30 分鐘` are literals. |
| B-06 | guest back | **HYBRID** | `返回` as the back affordance; retain `登入後以成員身份簽到` (F-14) |
| B-07 | guest lead | **ADOPT** | `輸入聚會代碼及聯絡資料，完成今次出席記錄。` |
| B-08 | guest code field | **ADOPT** | label `聚會代碼`, placeholder `例如 482913` |
| B-09 | guest name field | **ADOPT** | `中文姓名` |
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

All nine (`D-01` radius 10 vs 12, `D-02` button radius 9 vs 8, `D-03` border `#868182` vs
`#aeb8bc`, `D-04` hover `#8c2e2a` vs `#76231f`, `D-05` focus ring `#6495aa` vs `#176a87` and offset
3 vs 2, `D-06` success pill triad, `D-07` pill radius, `D-08` heading scale/weight, `D-09` eyebrow
tracking) are **deferred to the Style Tile ADR**. They are not ported literally. ADR-0037's rule
holds: the export contributes layout language, colours stay on the existing EFCC token palette.
`D-05` additionally may not reduce focus-ring contrast — ADR-0036 precedence.

### Group E — Accessibility & responsive

| ID | Direction |
| --- | --- |
| E-01 focus management | **KEEP** — F-06 |
| E-02 localized announcements | **KEEP** — F-07 |
| E-03 single column < 560px | **KEEP** — F-08 |
| E-04 viewfinder sizing | **HYBRID** — keep fluid `min(100%, 280px)`; adopt the design's corner reticle treatment |
| E-05 input mode & pattern | **KEEP** — F-10 |
| E-06 `aria-busy` | **KEEP** — F-09 |

---

## Normative state machine

The target, in production terms. Prototype edges that encode demo-harness bugs are excluded and
listed under [Design bugs not to port](#design-bugs-not-to-port).

```
                       ┌──────────────── /scanner (self) ────────────────┐

event-detail --[前往掃描]--> scan
dock --[掃描]--> scan
deep link /scanner?event=<id> | ?program_token=<t> | ?manual_code=<c> --> scan (auto-resolve)

scan --[開始掃描 → camera decode]--------> resolve(entry)
scan --[六位數代碼 + 繼續]---------------> resolve(entry)

resolve → 0 open events  --> scan            [inline error B-02 invalid; nothing written]
resolve → network failure --> scan           [inline error B-02 offline]
resolve → 1 open event   --> scan-context    [confirmation]
resolve → n>1 open events --> scan-chooser
resolve → ineligible     --> scan-outcome(kind)

scan-chooser --[重新掃描]--> scan
scan-chooser --[select row]--> scan-context

scan-context --[不是這個聚會, n>1]--> scan-chooser      [nothing written]
scan-context --[不是這個聚會, n=1]--> scan              [nothing written]
scan-context --[確認簽到 → 201 success]--> checkin-result(success)
scan-context --[確認簽到 → 200 duplicate]--> checkin-result(duplicate)
scan-context --[確認簽到 → recoverable error]--> scan-context [inline error + focused 重試簽到]

scan-outcome(kind ∈ {window-not-open, cancelled, not-enrolled, forbidden})
scan-outcome --[返回掃描]--> scan
scan-outcome --[查看課程詳情, not-enrolled only]--> /programs?programId=<resolved>

checkin-result --[返回首頁]--> /home
checkin-result --[再次簽到]--> scan

                    ┌──────────── /guest-check-in (public) ────────────┐

login --[訪客簽到]--> guest-checkin
printed QR --> /guest-check-in?program_token=<t>  --> guest-checkin (auto-resolve)

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
2. Assert the start control settles to `data-camera-available="true"`
   (`attendance-scanner-ui.tsx:113`) — this fails if the capability is resolved at first render, if
   the import is ordered late, or if the tri-state never settles.
3. Assert no request to any origin other than the application's own is issued for the wasm.

### Other testing rules

- Every adopted delta needs a test that would fail on the prior behaviour. Group D is exempt —
  token values are asserted by the tile ADR, not by unit tests.
- The blank-state characterization test asserts non-blankness across the zero-event, unknown-event,
  not-enrolled and malformed-intent tuples. It passes on day one by design; its purpose is to make
  the rebuild unable to regress F-15.
- Playwright at the seven widths locked by ADR-0036: 320×844, 375×844, 390×844, 414×844, 799×900,
  800×900, 1440×900, against local `wrangler dev` + local D1 with `E2E_` fixtures per ADR-0029.
- No suite in this repository can prove iOS. Playwright drives Chromium; WebKit-in-Playwright is not
  Safari, and a spoofed user agent does not remove an API. The detector-deleted E2E proves the
  *fallback path*; the iPhone smoke in [Verification](#verification) is a required, honestly-labelled
  manual step, not optional evidence.

---

## Out of scope

- Management roster, attendance correction, void, guest correction — S7.
- The assisted / operator scanner surface. It keeps the current `ScannerStatusOutput` untouched (D6).
- Any new backend table or endpoint. The traced contract is sufficient; D3 proves the guest rebuild
  needs no server change.
- An offline submission queue. `production-route-intent.json` places it explicitly out of scope;
  the contract is inline error plus manual retry.
- Event Detail pre-window presentation (#398) — remains its own ticket.
- A second visual language. Tiles contribute layout only; colours stay on the EFCC palette.

---

## Acceptance criteria

- Every one of the 42 deltas has a recorded direction, and every **ADOPT** and **HYBRID** delta is
  visibly satisfied and covered by a test that would fail on the prior behaviour.
- No frozen contract F-01 … F-16 is weakened. Each has an assertion or an explicit citation showing
  it is untouched.
- Camera QR scanning works on iOS Safari and Firefox via the lazily-loaded ponyfill, with the wasm
  served same-origin and no third-party request issued.
- With the native detector removed before page load, the start control settles to
  `data-camera-available="true"` and a decode reaches the resolve path. This assertion fails if the
  capability is resolved at first render or the ponyfill is imported too late.
- The capability probe always terminates. At the panel seam, with the native detector absent and the
  ponyfill import forced to reject, the surface settles to the camera-unavailable state with manual
  entry usable — never a render with neither viewfinder nor notice. Same assertion for a failed wasm
  fetch and for a probe that exceeds its timeout.
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
- 掃描 is the Section name in the dock, the header and the glossary.
- `pnpm --dir web typecheck` and `pnpm --dir web test:components` pass.

## Verification

1. Style Tile round completed, pick recorded in an ADR, before any production file changes.
2. Relevant component, Worker and Playwright suites green at the seven widths against local
   `wrangler dev` + local D1 with fresh `E2E_` fixtures.
3. Exercise valid, expired, not-enrolled, forbidden, duplicate, network-failure, zero-event,
   multi-event, decoder-absent and keyboard-only paths on both surfaces.
4. Verify repeated submission and audit behaviour against the real server contract. A screenshot or
   a local state toggle is not proof.
5. **Required manual iPhone smoke**, recorded in the S3-02 ticket: a real iPhone against local
   `wrangler dev` over LAN, scanning a printed Program QR, reaching a recorded attendance. Note the
   device, iOS version and browser.
6. Scoped impeccable audit per ticket, limited to the files that ticket touches. Fix every mechanical
   finding; list anything requiring judgement for review rather than deciding it silently.
7. Final layer is verification-only: no production runtime, API, schema or Cloudflare changes.

---

## Implementation tickets

Stacked linearly on `main` @ `0780062b`, each PR based on the previous branch. Reviewed slices are
never force-updated.

| Ticket | Title | Blocked by | Output |
| --- | --- | --- | --- |
| S3-01 | Style Tile round for the check-in surfaces + visual ADR | — | 3 rendered tiles over 7 states in `.scratch/s3-style-tiles/`, user pick, new ADR |
| S3-02 | QR decode fallback + self-hosted wasm + camera ADR | — (parallel with S3-01) | `barcode-detector/ponyfill`, `setZXingModuleOverrides`, ADR superseding 0015, manual iPhone smoke |
| S3-03 | Rebuild the five member states to the picked tile | S3-01, S3-02 | scan, chooser, confirm, result, outcome |
| S3-04 | Rebuild guest: single form, completion screen, camera removal + guest ADR | S3-01, S3-03 | one-step flow, `guest-result`, ADR amending 0028 scope |
| S3-05 | CONTEXT.md and ADR-0015 supersession | S3-02, S3-04 | glossary corrections and new terms |
| S3-06 | Verify S3 integration gate | S3-01 … S3-05 | verification-only PR, no production diff |

Three ADRs, each independently reversible: camera/decode (supersedes ADR-0015), guest check-in
surface contract, scan visual system.

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
