# ADR-0015 — External Camera Origin for QR Scanner

- **Status**: Proposed — official restriction deployment-verified (2026-07-30 `/exec` probe, #87); external-origin replacement pending the shared Prototype (#98/#100) and the deployed F5 gate (#104)
- **Deciders**: Noah Wong, OMP planner (F5 QR Scanner implementation, #97)
- **Date**: 2026-07-31
- **Related**: `docs/adr/0010-stable-app-document-and-expandable-sections.md`, `docs/specs/006-attendance-tracking.md` §3.1, `docs/specs/009-phone-first-shell-navigation.md`, issues [#87](https://github.com/Noahlw/efcc/issues/87), [#88](https://github.com/Noahlw/efcc/issues/88), [#93](https://github.com/Noahlw/efcc/issues/93), [#96](https://github.com/Noahlw/efcc/issues/96); research note [`docs/research/2026-07-30-f5-tickets-87-88-89.md`](../research/2026-07-30-f5-tickets-87-88-89.md)

## Context

EFCC's QR Attendance Scanner (F5, feature #83) must capture camera frames and decode member QR codes on phones. Historical architecture assumed this happened **inside the stable Apps Script HTML Service App Document**:

- ADR-0010: "Large optional dependencies, including the QR scanner library, use a shared on-demand asset loader that resolves at most once per App Document."
- Spec 006 §3.1: "App opens HTML5 camera video stream via `html5-qrcode` scanner library."
- Spec 009: the Scanner fragment "Load `html5-qrcode` once over HTTPS before initialization."

Research #87 falsified that assumption. Official Apps Script documentation documents a **Permissions policy violation** when HtmlService content calls `navigator.mediaDevices.getUserMedia()`, and a 2026-07-30 cold-start probe of the deployed `/exec` IFRAME confirmed it structurally: Google's outer `#sandboxFrame` `allow` list contains no `camera`/`microphone` grant, `featurePolicy.allowsFeature("camera") === false` inside the user document, and the console reports `Permissions policy violation: camera is not allowed in this document.` No code inside `doGet()` output can change the Google-controlled embed's `allow` list.

Because the camera cannot live in the App Document, the decoder cannot either (#88): loading `html5-qrcode` (or any camera-bound library) into the App Document would call the blocked API and re-create ADR-0007's project-size pressure to no effect. The App Document instead keeps a narrow role: opening/closing an external camera window, verifying its origin, and accepting an opaque `scannedCode`.

## Decision

For F5 (QR Attendance Scanner), camera capture and QR decode live on an **EFCC-controlled external HTTPS origin**, not inside the HtmlService App Document:

1. **No `getUserMedia` inside the App Document.** The App Document never requests camera/microphone access. The Google sandbox does not grant it, and product code cannot change that.
2. **External origin + user-gesture `window.open` + `postMessage` bridge.** The operator taps a Scanner action; the App Document opens the external camera page in a new window/tab from that user gesture (satisfying popup-blocker rules); the external page runs `getUserMedia`, decodes QR frames, and posts an opaque `scannedCode` back via `postMessage` (per Google's documented external-domain workaround and its `window.opener.postMessage` example).
3. **App Document ownership.** The App Document owns: the origin **allowlist** (every `message` event's `event.origin` is checked before acceptance), acceptance of the **opaque `scannedCode`** only (never a Member DTO, never client-supplied `userId`), and the **check-in RPC** against the shared Attendance authority (#51). It also closes the external window and drops the `message` listener on Section unmount/logout (F5 teardown contract).
4. **Decoder placement.** The external origin prefers pinned, self-hosted **`html5-qrcode@2.3.8`** (historical pin from spec 009; may use native `BarcodeDetector` internally when present). The credible escape hatch is a thin `getUserMedia` + **`jsQR`** implementation on the same external page. In-document decoder loads are rejected; `BarcodeDetector`-only designs are rejected (no usable Safari/iOS path).
5. **ADR-0010 narrowing.** ADR-0010's "once per App Document" on-demand asset loader remains valid for App Document assets (including a tiny bridge module), but its scanner-library assumption is **superseded for F5**: the scanner library is not an App Document asset at all. Section mount/unmount lifecycle ownership stays as ADR-0010/spec 009 defined; only the camera/decode placement moves off-document.

## Official evidence

Per the repo's docs-backed method rule, the two Google citations below are the primary evidence for the restriction and the workaround. Quoted passages retrieved 2026-07-31 from the official pages (Context7 `/websites/developers_google_apps-script` library + direct `developers.google.com` fetch).

**1. Apps Script Troubleshooting — "Permissions policy violation"** ([URL](https://developers.google.com/apps-script/guides/support/troubleshooting)):

> "This error occurs when an application using HTMLService attempts to execute Web APIs that require sensitive permissions, such as `navigator.mediaDevices.getUserMedia()` for camera or microphone access. The Apps Script sandboxed environment restricts these features to protect user security. Host the functionality that requires these permissions on a separate domain (outside of Apps Script) and open it in a new window or tab. You can then post the captured data or responses back to your Apps Script application as shown in this example."

The page's example implements exactly the pattern adopted here: `window.open(externalUrl, 'cameraWindow', ...)` from a click handler, the external page using `getUserMedia` and `window.opener.postMessage(...)`, and the Apps Script document filtering with `if (event.origin !== 'https://your-external-domain.com') { return; }` before `google.script.run` processing.

**2. HTML Service: Restrictions** ([URL](https://developers.google.com/apps-script/guides/html/restrictions)):

> "The `IFRAME` sandbox mode is based on the iframe sandboxing feature in HTML5, using the following keywords: `allow-same-origin`, `allow-forms`, `allow-scripts`, `allow-popups`, `allow-downloads`, `allow-modals`, `allow-popups-to-escape-sandbox`, `allow-top-navigation-by-user-activation`"

The documented sandbox keyword list contains **no camera or microphone grant** — there is no documented `allow="camera"` equivalent for HtmlService — while `allow-popups` and `allow-popups-to-escape-sandbox` support Google's external-window workaround. The same page requires active content (scripts, external stylesheets, XHR) to be HTTPS, which the self-hosted pinned decoder satisfies:

> "'Active' content like scripts, external stylesheets, and XmlHttpRequests must be loaded over HTTPS, not HTTP."

Supplementary (not primary evidence): the 2026-07-30 deployed `/exec` probe recorded in #87 (missing `camera` in the outer sandbox `allow` list, `allowsFeature("camera") === false`, console Permissions-policy error) and MDN documentation of `getUserMedia` secure-context/Permissions-Policy requirements, `facingMode`, and `MediaStreamTrack.stop()` (cited in the research note).

## Consequences

**Positive:**

- F5 gets a documented, supported path to camera capture that cannot be revoked by an Apps Script sandbox change: the only moving parts on Google's side are `allow-popups`/`allow-popups-to-escape-sandbox`, which are documented sandbox keywords.
- The App Document stays free of camera code and multi-hundred-KB decoder bundles (ADR-0007 size lesson).
- The trust boundary sharpens: the bridge carries an opaque code, identity resolution stays server-side under #51, and the origin allowlist makes forged `postMessage` messages fail closed.
- Scanner teardown becomes testable without a camera: closing the window and dropping the listener are DOM/RPC observables (#102–#106).

**Negative / risks:**

- F5 now depends on a second origin: an EFCC-controlled HTTPS host must be provisioned, allowlisted, and kept available (operator decision #99; hosting is **out of scope** for this ADR).
- Popup blockers and camera-permission flows add recoverable failure states the Scanner must handle with sticky copy + user-gesture retry (spec #93 user stories 7–8).
- `html5-qrcode` is unmaintained since 2023-04-15; mitigation is pinning + self-hosting + the `jsQR` escape hatch.
- Deployed proof of the external path is still pending: the shared Prototype (#98/#100) on real phones and the F5 Playwright gate (#104). Until then this decision stays **Proposed** per the repo's evidence gate (AGENTS.md, spec 009 decision-evidence standard).

**Supersession scope (explicit):**

- Superseded for **F5 only**: ADR-0010's in-document "once-per-App-Document scanner library" assumption (scanner library placement), spec 006 §3.1's "App opens HTML5 camera video stream via `html5-qrcode`", and spec 009's Scanner-fragment `html5-qrcode` load requirement. Where those documents define Section lifecycle, asset-loading discipline, or the RPC envelope, they remain in force.
- **F6 manual check-in is unaffected**: no camera, no external origin; shared Attendance authority (#51) still owns eligibility, lock, quiet duplicate, and `NOT_ENROLLED` for both paths.
- Trust and payload decisions are not reopened: opaque `scannedCode`, server-side resolution, and Day 1 `QR_Code_String` stability come from #90/#93 and stay as recorded.

## Cross-references

| Reference | Relationship |
| --- | --- |
| ADR-0010 | Scanner-library placement assumption superseded for F5; lifecycle/asset-loader discipline retained |
| Spec 006 §3.1 | In-document `html5-qrcode` camera flow superseded for F5; RPC/duplicate semantics retained (and refined by #93) |
| Spec 009 | Scanner-fragment `html5-qrcode` load requirement superseded for F5; fragment lifecycle/teardown contracts retained |
| #87 | Research: camera restriction + external-window workaround (deployed `/exec` probe) |
| #88 | Research: decoder placement on external origin, `html5-qrcode@2.3.8` pin + `jsQR` escape hatch |
| #93 | Focused QR Scanner spec; Implementation Decision "Record a durable ADR when Implementation starts" (this ADR) |
| #96 | F5 entry point; dependency graph (#97 → #98/#100/#101 → … → #104) |
