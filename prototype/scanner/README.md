# EFCC QR Scanner - Shared Prototype (issue #100, Seam 4)

External-origin camera page + opener harness that proves the phone UX paths Playwright's local Chromium cannot (spec [#93](https://github.com/Noahlw/efcc/issues/93) Seam 4; ADR-0015). The static camera page is also the source for the production Scanner Window; it never writes Attendance or Sheets directly. The production App Document bridge is [#103](https://github.com/Noahlw/efcc/issues/103).

## What this is

| File | Role |
| --- | --- |
| `index.html` | The external camera page. Opened via `window.open` from the App Document (or `opener.html`). Starts the rear camera, decodes a QR, posts an opaque trimmed `scannedCode` to the opener. |
| `scanner.js` | Browser wiring: bridge handshake, staged loading animation, camera start/stop, decode, same-code cooldown, in-flight processing, in-place recovery, backgrounding resilience, unload teardown. Imports the pure core. |
| `scanner-core.js` | Pure, browser-agnostic, unit-tested logic: `normalizeScannedCode`, `buildScanPayload`, `isSecureOrigin`, `postScannedCodeToOpener`, `stopStreamTracks`. |
| `styles.css` | Phone-first dark viewfinder. |
| `opener.html` | Stand-in for the App Document. Opens the scanner, sends the origin handshake, receives scans, verifies origin. Used for real-device testing without the Apps Script side. |
| `vendor/html5-qrcode.min.js` | Pinned `html5-qrcode@2.3.8` (self-hosted; primary decoder). |
| `vendor/jsQR.js` | Pinned `jsQR@1.4.0` (self-hosted; escape-hatch decoder). |

## Expanded Prototype — New Check-In Flows

These files explore the new member-scans-program-QR model and keep the old external scanner as one of the assisted paths. Start at `prototype-index.html`.

| File | Role |
| --- | --- |
| `prototype-index.html` | Landing page linking the three prototype flows. |
| `civic.css` | Shared Civic Minimal design tokens and components from `DESIGN.md`. |
| `mock-backend.js` | Simulated backend with programs, events, members, enrollments, and attendance rules. |
| `check-in-ui.js` | Shared UI helpers and the inline `Html5Qrcode` wrapper. |
| `check-in.html` | Logged-in member self check-in: scans the Program QR or types the Event Manual Code. |
| `guest-check-in.html` | Public guest check-in: scan/enter code, then name + phone. No account required. |
| `event-manage.html` | Leader event page: assisted QR scan, manual member search, attendance roster, and void. |

## Architecture (one paragraph)

`opener.html` (or the real App Document) opens `index.html` from a **user gesture** (`window.open`). It then sends an `EFCC_QR_HANDSHAKE` message to the popup targeting the scanner's exact origin. The scanner records the opener's origin from `event.origin` (with an exact-origin query fallback for reload recovery) and uses it as the `postMessage` `targetOrigin` (**never `*`**, per MDN / research note 2026-07-31 §Q3). The Window visibly moves through connection, camera-starting, ready, and check-in-processing states. On each decode it normalizes the code (trim, reject empty/over-max), suppresses the same code for ~2.5s while letting a different code fire at once (spec #91), and posts `{ type: "EFCC_QR_SCAN", scannedCode }`. The App Document returns an `EFCC_QR_RESULT` action (`auto`, `resume`, or `retry`). On close/unload it stops all tracks. Backgrounding (`visibilitychange` hidden) **never** stops the stream and **never** re-acquires it on return.

## Decoders

- **`html5-qrcode@2.3.8`** (default, ADR-0015 primary). `facingMode: "environment"`. The library manages its own camera + viewfinder UI; teardown calls `stop()` + `clear()`.
- **`jsQR@1.4.0`** (escape hatch, full lifecycle control). `getUserMedia` with `{ facingMode: { ideal: "environment" } }` + canvas `getImageData` + `jsQR`. Select with `?decoder=jsqr`. Use this path to observe teardown/backgrounding behavior most directly (we own the `MediaStream`).

## Hosting (operator step)

The scanner must be served over **HTTPS** (the secure context `getUserMedia` requires). Any static HTTPS host works (GitHub Pages, Netlify, Cloudflare Pages, Vercel - see research note 2026-07-31 §Q5).

Minimal local HTTPS for device testing (phones on the same Wi-Fi):

```sh
# one-off: serve this directory over localhost HTTPS
npx http-server prototype/scanner --ssl --port 8443
# then on the phone open https://<your-lan-ip>:8443/opener.html
# (accept the self-signed cert for the test)
```

For a durable origin, push `prototype/scanner/` to a GitHub Pages repo (`https://<user>.github.io/<repo>/opener.html`) or equivalent, and record the exact origin string for the #103 allowlist.

## Run the unit tests (CI-safe)

The pure core is unit-tested with vitest (no camera, no DOM):

```sh
pnpm test:prototype
```

Real camera/decode/backgrounding is **not** a CI seam (spec #93 Seam 4) - it is the real-device matrix below.

## Real-device test plan (maps to #100 acceptance criteria)

Run on **representative iPhone Safari** and **Android Chrome**. Record device + OS + browser versions and pass/fail per row in the ticket comment / a research note. Any divergence from #93 is flagged.

### Setup

1. Serve `prototype/scanner/` over HTTPS (see Hosting).
2. On the phone, open `opener.html`.
3. Keep the default scanner URL (`./index.html`) for same-origin, or enter the absolute HTTPS URL for cross-origin.
4. Repeat the matrix below for `?decoder=html5` (default) **and** `?decoder=jsqr`.

### AC1 - Camera starts, scans, posts `scannedCode` to opener

| Step | Expected |
| --- | --- |
| Tap "開啟掃描器". | Scanner window opens; camera permission prompt appears. |
| Grant camera. | Rear camera starts; the loading animation changes to the ready reticle and status "對準 QR Code". |
| Point at a member QR (e.g. `GC-MEM-0001`). | Status shows "已掃描並傳送：GC…0001"; opener shows "已收到掃描 #1：GC-MEM-0001". |

### AC2 - Permission denied -> recoverable copy + retry; grant-after-denial without App reload

| Step | Expected |
| --- | --- |
| Deny camera permission at the prompt. | Status "相機權限被拒絕…" + "重試" button appears. |
| Tap "重試" (still denied). | Same recoverable copy persists. |
| Open browser settings, grant camera, return, tap "重試". | Camera starts; scanning works. The opener (App Document) page is **not** reloaded. |

### AC3 - Backgrounding does not kill or duplicate the stream

| Step | Expected |
| --- | --- |
| While scanning, switch to another app / home screen (background). | (No error visible.) |
| Return to the scanner window. | The **same** camera stream resumes; no second permission prompt; no duplicate video; scanning continues. |

### AC4 - Closing stops the camera; no accumulation across open/close cycles

| Step | Expected |
| --- | --- |
| From `opener.html`, tap "開啟掃描器", grant, scan once, then tap "關閉掃描器". | Scanner window closes; phone camera indicator turns off (stream stopped). |
| Tap "開啟掃描器" again; scan. | Works; scan count increments on the opener (single listener, no duplicate handlers). |
| Repeat 5x. | Camera indicator toggles cleanly each cycle; no "camera in use by another app" error; no listener accumulation. |

### AC4b - Origin allowlist rejects disallowed origins

The opener harness verifies `event.origin` against the configured scanner origin and ignores everything else (the `ignored message from origin:` log line). To exercise rejection: open the browser console on `opener.html` and run `window.postMessage({ type: "EFCC_QR_SCAN", scannedCode: "FORGED" }, "*")` from a different origin (or temporarily point the input at one origin and post from another). Expected: the result does **not** update; the log shows the ignored origin. (The production App Document bridge #103 owns the same fail-closed origin check.)

### AC5 - Results recorded

Record in the ticket comment (or a `docs/research/` note): device model, OS version, browser + version, decoder used, pass/fail per AC1-AC4, and any divergence from #93.

### AC6 - No production impact

Confirm: no changes under `src/gas/`; no Attendance writes; no Sheets mutation. (Enforced by directory: all prototype code lives under `prototype/scanner/`.)

## Divergence notes (known mobile gotchas to watch)

- **iOS `pagehide` on background.** Older iOS Safari fires `pagehide` when the page is backgrounded (bfcache). `scanner.js` checks `event.persisted` and **only** tears down when `!persisted` (real unload). Verify on the target iOS version that backgrounding does not tear down (AC3). If a given iOS version tears down despite the `persisted` guard, flag it as divergence.
- **No `beforeunload` handler (intentional).** Safari historically opts pages with a `beforeunload` handler out of bfcache, which would turn a background into a real unload and kill the stream - breaking AC3. `pagehide` is the sole unload hook; the browser also releases the camera on navigation regardless. For the default `html5-qrcode` decoder, the async `stop()` cannot settle during `pagehide`, so the explicit "關閉相機" button (async `teardown()`) is the reliable stop; on a hard window close the browser releases the camera when the page is destroyed (verify the indicator turns off on AC4).
- **getUserMedia gesture.** The page is opened from a user gesture; if a given browser still blocks auto-start, the "重試" / a manual start covers it.
- **`html5-qrcode` is unmaintained since 2023-04-15.** Mitigation = exact pin + self-host + the `jsQR` escape hatch (ADR-0015 §4).

## Production boundary

The App Document owns Event selection, the RPC, origin validation, result posting, and Section teardown. The Scanner Window owns camera/loading/result/recovery UI. Neither side allows the external page to resolve Member identity or write Sheets.
