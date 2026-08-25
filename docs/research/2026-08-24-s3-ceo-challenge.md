# CEO Design Challenge: EFCC S3 — Participant & Guest Check-In

**Date:** 2026-08-25  
**Reviewer:** CEO Review Agent (`ceo-review`)  
**Context / Spec:** `docs/specs/370-s3-participant-guest-check-in.md` (Issue [#370](https://github.com/Noahlw/efcc/issues/370), stack tip `8cf0ad0`)  
**Prior Art Context:** `docs/research/2026-08-24-s3-checkin-ux-open-source.md`  
**Review Mode:** **SELECTIVE EXPANSION** (Hold rock-solid engineering baseline; ruthlessly challenge UX blindspots; cherry-pick high-leverage congregation capabilities)

---

## Executive Summary & Posture

S3 has achieved an admirable feat: turning an unbuilt spec with a broken iOS camera path into a disciplined, audited, camera-first architecture backed by frozen contracts (F-01–F-19), natural-key deduplication, and zero server schema churn. The technical baseline is sound.

However, a camera-first check-in system for a Hong Kong congregation is not judged by unit test passes; it is judged at 10:55 AM on Sunday when 300 people walk through the sanctuary doors in 10 minutes. The current design carries subtle UX and operational assumptions that will create Sunday-morning bottlenecks if left unaddressed.

---

## 1. Top 3 Strategic & Operational Risks

### Risk 1: The "Low-Light Sanctuary Blind Alley" (F-18 vs Physical Reality)
* **Hidden Assumption:** Users scanning in the sanctuary will always have adequate lighting, and an uncluttered live viewfinder with zero auxiliary controls (F-18: single bottom `停止掃描` button) is optimal under all conditions.
* **Spec / Prior-Art Citation:** Spec §Solution (lines 124–125), Frozen Contract F-18 (line 168); open-source research notes from `pretixSCAN` and `html5-qrcode` (`docs/research/2026-08-24-s3-checkin-ux-open-source.md:67-68, 83`).
* **Consequence if Ignored:** Sanctuary lights are frequently dimmed during pre-service prelude and worship. Congregants pointing iPhone cameras at printed bulletins or dark monitors will see no scan response and receive no guidance. Trapped with only `停止掃描`, they will abandon camera mode and flood the manual desk, defeating camera-first throughput.
* **Proposed Alternative:** Maintain F-18's clean hierarchy, but add an opportunistic, hardware-gated torch icon in the top-right overlay (rendered only when `MediaStreamTrack.getCapabilities().torch` is true). Supplement with a 3-second elapsed stream hint: *「若光線不足，請開啟閃光燈或調高螢幕亮度」*.

### Risk 2: The "Disabled 繼續 Button" Anti-Pattern on Multi-Event Choosers (F-13 / A11y Conflict)
* **Hidden Assumption:** Disabling the `繼續` (Continue) button on `scan-chooser` until a radio item is selected protects users from submitting invalid choices.
* **Spec / Prior-Art Citation:** Spec §Frozen Contracts F-13 (line 163); GOV.UK Radios & Error Message Patterns (`docs/research/2026-08-24-s3-checkin-ux-open-source.md:129-136`).
* **Consequence if Ignored:** Disabled submit buttons violate accessibility principles (silent dead ends for screen readers, zero explanatory feedback on click). Elderly church members who do not immediately notice unselected radio buttons will repeatedly tap an unresponsive button, assume the app has frozen, and leave the queue.
* **Proposed Alternative:** Follow GOV.UK design standards strictly: keep `繼續` enabled at all times. If tapped without a selection, retain focus, trigger an immediate fieldset error summary (*「請選擇要簽到的聚會」*), and visually connect the error to the radio group.

### Risk 3: Wall-QR Deep-Link Identity Ambiguity (Guest vs Logged-Out Member Collision)
* **Hidden Assumption:** Any unauthenticated user scanning the printed wall QR (`/guest-check-in?program_token=...`) with their native phone camera is a genuine first-time guest wanting to fill in Name + Phone.
* **Spec / Prior-Art Citation:** Spec §D3 (lines 399–405), Frozen Contract F-14 (line 164), `attendance.ts:983-1066`.
* **Consequence if Ignored:** Regular members who scan the physical poster using iOS Camera or in-app browsers (WeChat/LINE/WhatsApp) lack session cookies and will land on `/guest-check-in`. Many will dutifully fill in the guest form rather than navigating away, polluting the roster with duplicate guest entries and disconnecting their attendance from their member discipleship records.
* **Proposed Alternative:** On the guest check-in landing card, render a high-visibility, 1-tap fast path banner at the top: *「現有會友？按此登入簽到」*. This preserves `program_token` through the login redirect and immediately credits member attendance upon authentication.

---

## 2. Scope Decisions (Targeted Evaluation)

1. **Item 8: Torch & Zoom Controls**  
   * **Decision:** **Pull in Gated Torch; Keep Zoom OUT.**  
   * *Trade-off:* Hardware-gated torch requires ~15 LOC via `MediaStreamTrack` capabilities and saves dim sanctuary scans without cluttering UI, whereas digital zoom requires complex multi-touch/slider gestures that yield negligible benefit at typical QR scanning distances.

2. **Duplicate First-Seen Timestamp (`pretixSCAN` Yellow Pattern)**  
   * **Decision:** **Keep OUT of S3.**  
   * *Trade-off:* While displaying the original check-in time provides clear duplicate feedback, F-01/F-02 intentionally omit `attendance_id` and timestamps from the member `duplicate` API response; adding it requires server contract mutations that belong in S7 operator tooling.

3. **File / Photo Upload Fallback (`SCAN_TYPE_FILE`)**  
   * **Decision:** **Keep OUT.**  
   * *Trade-off:* Uploading saved QR photos adds bundle weight and undermines physical presence verification, while manual 6-digit code entry already provides 100% reliable fallback.

4. **Login-Surface Entry Addendum (44px Guest/Register Touch Targets)**  
   * **Decision:** **Pull IN (Accept as Baseline).**  
   * *Trade-off:* Already implemented and verified at 44px touch targets; costs zero additional engineering effort and prevents first-time visitors hitting the login wall from getting trapped.

---

## 3. Think Bigger Bet: "Household / Family 1-Tap Check-In" (家庭一鍵同行簽到)

* **The Bet:** When a member scans an event QR code, the confirmation screen (`scan-context`) detects linked household members (spouse, children in Sunday school) and presents 1-tap companion checkboxes (*「同時為同行家人簽到 (3人)」*).
* **Why Now:** Hong Kong church attendance is family-centric. Sunday morning bottlenecks occur because parents must repeatedly scan, log out, or pass phones around for each child at the door. Planning Center’s #1 cited mobile pass pattern is the household batch action. S3 already builds the multi-event chooser and confirmation-before-write foundation; designing the state machine to accommodate companion selection now prevents major rewrites later.
* **Why Not Later:** Deferring this forces S3 to lock down a single-user atomic UI contract that S4/S7 will have to dismantle to support family discipleship and children’s ministry attendance.

---

## 4. The Cut: Desktop Live-Camera Viewfinder & Rail Theming

* **The Cut:** Formally cut the desktop live-camera viewfinder state and dynamic dark-rail theme switching specified in §D2b (lines 354–356), making desktop `/scanner` strictly a static, light-themed manual code entry surface.
* **The Saving:** Eliminates responsive media query switching for camera stream lifecycles, dark rail style mutations, and desktop camera E2E mock scaffolding without violating any mobile participant acceptance criteria.
