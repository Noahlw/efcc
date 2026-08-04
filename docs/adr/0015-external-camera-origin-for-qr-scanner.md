# ADR-0015 - QR Scanner Camera Capture (External Origin)

- **Status**: Proposed - **reverted to Option A (external HTTPS origin + `getUserMedia` + `html5-qrcode` + `postMessage` bridge)** as the primary method (2026-08-01). Option B (in-App-Document `<input type=file capture>` + jsQR) was tried in production and failed: iOS Safari does not honor `capture` to force the camera (caniuse), producing a slow multi-step chooser UX, and single-photo jsQR decode was too slow/unreliable. Option A's external camera page was validated on a real phone (continuous auto-scan works, `html5-qrcode` is fast). Stays Proposed until a full-flow phone test passes: App Document (`/exec`) -> `window.open` -> scanner page -> `postMessage` scan -> `api_qrCheckIn` -> result back, proving the popup escapes the Apps Script sandbox (`allow-popups-to-escape-sandbox`) end-to-end (AGENTS.md evidence gate).
- **Deciders**: Noah Wong (F5 QR Scanner, #83/#100); reverted per the 2026-08-01 best-method research + Option B production failure.
- **Date**: 2026-07-31 (revised 2026-08-01 Option B; reverted 2026-08-01 Option A)
- **Related**: `docs/adr/0010-stable-app-document-and-expandable-sections.md`, `docs/specs/006-attendance-tracking.md` §3.1, `docs/specs/009-phone-first-shell-navigation.md`, issues [#87](https://github.com/Noahlw/efcc/issues/87), [#88](https://github.com/Noahlw/efcc/issues/88), [#93](https://github.com/Noahlw/efcc/issues/93), [#99](https://github.com/Noahlw/efcc/issues/99), [#100](https://github.com/Noahlw/efcc/issues/100), [#101](https://github.com/Noahlw/efcc/issues/101); research notes [`2026-07-30-f5-tickets-87-88-89.md`](../research/2026-07-30-f5-tickets-87-88-89.md), [`2026-08-01-f5-qr-scanner-best-method.md`](../research/2026-08-01-f5-qr-scanner-best-method.md).

## Revision history (2026-08-01)

1. **Option A (original, 2026-07-31):** external HTTPS origin + `getUserMedia` + pinned `html5-qrcode`, opened via `window.open` + `postMessage`. Prototype shipped under `prototype/scanner/` (#100).
2. **Option B (pivot, 2026-08-01, #99):** in-App-Document `<input type=file accept=image/* capture=environment>` + self-hosted jsQR. Rationale: the IFRAME Permissions-Policy `camera` directive governs only `getUserMedia()`, not HTML Media Capture, so a file-input might work inside the sandbox (no external host, no bridge). **Production result:** failed. iOS Safari does not honor `capture` to force the camera (caniuse `html-media-capture` note #1) -> the operator gets a multi-step chooser (Take Photo / Photo Library) instead of a direct rear-camera launch; single-photo jsQR decode was too slow and unreliable. The Events-sheet column mismatch compounded the failure (separate fix in `events-repository.gs`).
3. **Revert to Option A (2026-08-01):** the external camera page was validated on a real phone (camera opens, continuous auto-scan, `html5-qrcode` fast, `postMessage` back). The 2026-08-01 best-method research confirms Option A is the only officially documented method and the method practitioners use. The App Document now wires the bridge (open + listener + `api_qrCheckIn` + result-back) so the operator sees inline ✓/✗ on the camera page without looking away.

## Context

EFCC's QR Attendance Scanner (F5, feature #83) must capture a member QR code on a phone and decode it. The camera cannot live in the stable Apps Script HTML Service App Document:

- **#87 (research + live `/exec` probe):** `navigator.mediaDevices.getUserMedia()` is blocked by Permissions Policy inside HtmlService. Google's outer `#sandboxFrame` `allow` list contains no `camera`/`microphone` grant; `featurePolicy.allowsFeature("camera") === false`; console reports `Permissions policy violation: camera is not allowed in this document.` No code inside `doGet()` output can change Google's embed.
- **#88 (research):** decode must therefore happen on the external camera host; `html5-qrcode@2.3.8` (primary, wraps camera+decode, optional `BarcodeDetector`) or `getUserMedia`+`jsQR` (escape hatch). `BarcodeDetector`-only rejected (no usable Safari/iOS).
- **2026-08-01 best-method research:** Google's official Troubleshooting page documents the block AND prescribes the exact external-domain + `window.open` + `postMessage` + `event.origin`-check remedy (with a reference `Index.html`). It is the only officially documented method; every practitioner who solved the Apps Script camera problem moved the camera off-Apps-Script (e.g. Netlify-hosted scanner -> Apps Script). Option B's iOS failure is a platform limitation (caniuse), not an implementation slip.

## Decision

For F5, camera capture and QR decode live on an **external HTTPS origin**, bridged to the App Document via `postMessage`:

1. **External scanner page** (`https://noahwong-hue.github.io/efcc-scanner/`, source in `prototype/scanner/`). Opened via `window.open` from a user-gesture tap. Runs `getUserMedia({ video: { facingMode: "environment" } })` + **`html5-qrcode@2.3.8`** (default, fast, validated on phone) or `jsQR@1.4.0` (escape hatch via `?decoder=jsqr`). A **custom reticle** overlays the camera; `html5-qrcode`'s own UI is hidden via CSS. On each decode it posts `{ type: "EFCC_QR_SCAN", scannedCode }` to the opener with the opener's exact origin as `targetOrigin` (never `*`).
2. **App Document Scanner Section** (`shell-session.js.html`) owns the Event picker (capability-filtered active Events via `api_getScannerEvents`), opens the scanner page, sends an `EFCC_QR_HANDSHAKE` (with the Event name for the scanner's top bar), and registers ONE persistent `message` listener (reused across open/close cycles). On `EFCC_QR_SCAN` it runs `google.script.run.api_qrCheckIn(...)` (#101) and posts `{ type: "EFCC_QR_RESULT", tone, message }` back so the scanner shows inline ✓/✗. The App Document verifies `event.origin === "https://noahwong-hue.github.io"` before reading any scan.
3. **Inline feedback for a check-in line:** the Scanner Window stays open and is the single visual owner of camera/bridge loading, per-scan processing, result, and recovery feedback. The camera remains visible while the Attendance RPC is in flight. Success and duplicate results return automatically to ready-to-scan; typed business failures require an explicit return-to-scanning action. The App Document does not mirror a per-scan result log.
4. **Server authority unchanged.** `api_qrCheckIn` independently re-verifies session, capability, Event state, Member, and Enrollment; the client (scanner page) only supplies an opaque `scannedCode`. One in-flight check-in + same-code cooldown live in the scanner page (waiting-state machine) and the App Document (`scannerRuntime_`).
5. **Scanner is phone-only in the nav** (the rear-camera flow is meaningless on desktop): `renderNavDesktop_` skips `SECTION_KEYS.SCANNER`.
6. **Loading and recovery states stay in the Scanner Window:** use indeterminate stage animation rather than a false percentage; retry camera, bridge, and transport failures in place; keep the App Document limited to Event selection and compact launch/session errors.

## Official evidence (per AGENTS.md docs-backed method rule)

**1. Apps Script Troubleshooting - "Permissions policy violation"** ([URL](https://developers.google.com/apps-script/guides/support/troubleshooting), fetched 2026-08-01):

> "This error occurs when an application using HTMLService attempts to execute Web APIs that require sensitive permissions, such as `navigator.mediaDevices.getUserMedia()` for camera or microphone access. ... Host the functionality that requires these permissions on a separate domain (outside of Apps Script) and open it in a new window or tab. You can then post the captured data or responses back to your Apps Script application as shown in this example."

**2. HTML Service: Restrictions** ([URL](https://developers.google.com/apps-script/guides/html/restrictions)) - sandbox keywords include `allow-popups` and `allow-popups-to-escape-sandbox` (so the external window escapes the sandbox and can request camera as a normal top-level context), with no `camera` grant.

**3. iOS `capture` caveat (Option B failure root cause):** Can I Use `html-media-capture` (fetched 2026-08-01) - iOS Safari note #1: "Does not support the capture attribute used to force capture straight from the device's camera or microphone." This is the structural reason Option B produced a slow multi-step chooser.

Supplementary: the 2026-07-30 deployed `/exec` probe (#87), MDN `getUserMedia`/`postMessage` docs, and the 2026-08-01 best-method research note (community practice).

## Consequences

**Positive:**
- **Continuous auto-scan** (live stream + decode) - the right UX for a check-in line, vs Option B's photo-per-scan. Validated fast on a real phone with `html5-qrcode`.
- **Officially documented + community-validated** method - not a creative workaround.
- The trust boundary stays simple: the scanner page decodes an opaque string; the App Document runs the RPC; identity stays server-side under #51/#101.

**Negative / risks:**
- **A second origin to provision and keep available** (`noahwong-hue.github.io/efcc-scanner`). The App Document allowlists exactly `https://noahwong-hue.github.io`; a different scanner host requires updating `SCANNER_ORIGIN_`/`SCANNER_PAGE_URL_` in `shell-session.js.html`.
- **Popup blocker / sandbox-escape unproven end-to-end.** The standalone prototype validated camera+decode+`postMessage`, but the popup escaping the Apps Script sandbox (`allow-popups-to-escape-sandbox`) is only verifiable in the full deployed flow. The decision stays **Proposed** until that phone test passes (AGENTS.md).
- **`html5-qrcode` is unmaintained since 2023-04-15.** Mitigation: exact pin + self-host (`vendor/`) + the `jsQR` escape hatch.
- **Bidirectional `postMessage`** (scan -> App Document -> result -> scanner) is slightly more complex than one-way, but the contract is small and unit-tested (`scanner-core.js`).

**Supersession scope (explicit):**
- ADR-0010's in-document "scanner library" assumption is **obsolete for camera**: the camera/decode library now lives on the external origin, not in the App Document. The App Document owns only the bridge (window + listener).
- Spec 006 §3.1 ("HTML5 camera video stream via `html5-qrcode`") and spec 009's in-document `html5-qrcode` load are superseded for F5 by the external-origin flow.
- Option B artifacts (`jsqr.js.html`, the file-input scanner code) are **removed**. The Events-sheet column fix (`events-repository.gs`) is **retained** - `api_getScannerEvents` still feeds the Event picker.
- Trust and payload decisions are not reopened: opaque `scannedCode`, server-side resolution, and Day-1 `QR_Code_String` stability come from #90/#93 and stay as recorded.

## Cross-references

| Reference | Relationship |
| --- | --- |
| ADR-0010 | In-document scanner-library assumption obsolete for camera; library moved to the external origin |
| Spec 006 §3.1 | In-document `html5-qrcode` live-stream superseded for F5 by the external-origin flow; RPC/duplicate semantics retained |
| Spec 009 | Scanner-fragment `html5-qrcode` load superseded for F5 by the external scanner page; fragment lifecycle retained |
| #87 | Research: `getUserMedia` restriction (the reason camera leaves the App Document) |
| #88 | Research: decoder placement on the external host |
| #93 | Focused QR Scanner spec; Seam 4 device probe now validates the external-origin flow |
| #99 | Decision ticket: Option B chosen (now superseded by this revert) |
| #100 | External-origin prototype (now the production scanner page, hosted on GitHub Pages) |
| #101 | `api_qrCheckIn` shared Attendance RPC - the App Document runs it; the scanner page never calls Apps Script directly |
| 2026-08-01 best-method research | Confirms Option A is the only officially documented + community-validated method |
