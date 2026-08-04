# Research Note: F5 QR Scanner - Best / Most-Common Method in Apps Script HTML Service

**Date:** 2026-08-01  
**Author:** Research agent (best-method question for F5 QR Scanner, feature [#83](https://github.com/Noahlw/efcc/issues/83))  
**Parent:** Feature [#83](https://github.com/Noahlw/efcc/issues/83) · ADR-0015 (QR Scanner Camera Capture)  
**Builds on (does not duplicate):** [ADR-0015](../adr/0015-external-camera-origin-for-qr-scanner.md) and prior research [`2026-07-30-f5-tickets-87-88-89.md`](2026-07-30-f5-tickets-87-88-89.md) (`#87`/`#88`), [`2026-07-31-external-scanner-origin-approach.md`](2026-07-31-external-scanner-origin-approach.md). This note does **not** re-prove the `getUserMedia`-blocked finding; it re-verifies the official wording, then fills the gap the prior notes left open: **what the Apps Script community actually does** for QR/barcode/camera scanning, and whether external-origin + `postMessage` ("Option A") is the best/most-common method.  
**Sources:** Official Apps Script docs (Context7 `/websites/developers_google_apps-script` + direct `developers.google.com` fetch 2026-08-01), MDN Web Docs, MDN browser-compat-data (BCD), Can I Use raw data, Stack Exchange API (Stack Overflow `google-apps-script` tag), GitHub Search API.  
**Status:** Research COMPLETE. Recommendation: **Option A (external HTTPS origin + `getUserMedia` + decoder + `postMessage`)** is the right call for this phone-first app - it is the only officially documented method, the method practitioners actually use when they solve the problem, and the only option that delivers fast continuous scanning on iPhone Safari + Android Chrome. The Apps Script community is **fragmented** (no single dominant pattern), but the realistic alternatives are all worse for these requirements.  
**Convention:** `docs/research/` dated notes. **Read-only:** no code changes, no Sheet mutation, no commits.

---

## TL;DR

1. **Official method (re-verified, not just trusted):** Google's Apps Script Troubleshooting page (last updated 2026-06-10 UTC) both documents the `getUserMedia`/camera block in HtmlService **and** prescribes the exact external-domain + `window.open` + `postMessage` + `event.origin`-check remedy, shipping a reference `Index.html`. There is **no other official method** for camera access from HtmlService. This re-confirms the 2026-07-30/07-31 notes via a fresh direct fetch.
2. **Community practice (the gap, now filled):** The community is **fragmented - there is no single dominant pattern.** On Stack Overflow the most-upvoted "solution" is the **in-document `html5-qrcode`** pattern (Q73117564) - but it is shown for a Spreadsheet modal dialog, not a deployed `/exec` web app, and it is exactly the pattern that fails on `/exec` (a 2024 questioner trying it in a web app got **zero answers**, Q79896912). The highest-scoring relevant answer (Q67907540, score 9) corroborates the structural Permissions-Policy block. The practitioners who **actually solved** the Apps Script camera problem on GitHub use the **external-origin pattern** - e.g. `rameezscripts/fix-camera-apps-script-barcode-scanner` (Netlify-hosted scanner -> Apps Script) describes the opaque-origin sandbox block verbatim and hosts the scanner off-Apps-Script. Some practitioners abandon Apps Script entirely for camera needs (Q57085364 -> external PHP server).
3. **Realistic alternatives:** For a phone-first app needing **fast continuous** scanning on iPhone Safari + Android Chrome, only **Option A** delivers continuous live-stream decoding. **Option B** (file-input + jsQR) - the current ADR-0015 choice - is corroborated as weak by fresh evidence: caniuse confirms iOS Safari does **not** honor the `capture` attribute to force the camera (note #1), explaining the multi-step UX that already failed in production. **BarcodeDetector-only** (D) is rejected: still experimental, Safari/iOS behind a flag (disabled by default), Firefox unsupported (MDN BCD, Aug 2026). **Server-side decode** (C) is impractical in Apps Script (no image pixel-decoding; would need an external API via `UrlFetchApp` - latency/privacy/cost; no community example).
4. **Recommendation:** Adopt **Option A** as the primary method (not merely the ADR-0015 "fallback"). It is the only officially documented method, the method used by practitioners who solved the same problem, structurally supported by the sandbox (`allow-popups` + `allow-popups-to-escape-sandbox`), and the only option meeting the fast-continuous-scan + iPhone-Safari + Android-Chrome requirements. Option B's production failure is a platform limitation (iOS `capture` caveat), not just an implementation slip.

---

## Q1 - Official method (re-verified via direct fetch, not just the prior note)

**What the official Google Apps Script documentation says about camera / `getUserMedia` / sensitive Web APIs from HTML Service, and the documented workaround.**

The prior notes quoted the troubleshooting page via Context7. Per the repo's docs-backed method rule, I re-fetched the official page directly on 2026-08-01. The page is current (**last updated 2026-06-10 UTC**) and says exactly what the prior notes recorded.

**1a. The restriction is official and `getUserMedia`-specific.** Under "Common errors" -> "Permissions policy violation":

> "This error occurs when an application using HTMLService attempts to execute Web APIs that require sensitive permissions, such as `navigator.mediaDevices.getUserMedia()` for camera or microphone access. The Apps Script sandboxed environment restricts these features to protect user security."
> - [Apps Script Troubleshooting - Permissions policy violation](https://developers.google.com/apps-script/guides/support/troubleshooting) (direct fetch 2026-08-01; page last updated 2026-06-10 UTC)

**1b. The official remedy is the external-domain + new-window + `postMessage` pattern.** Immediately after the restriction, the same page prescribes the workaround and ships a reference implementation:

> "Host the functionality that requires these permissions on a separate domain (outside of Apps Script) and open it in a new window or tab. You can then post the captured data or responses back to your Apps Script application as shown in this example."
> - [Apps Script Troubleshooting - Permissions policy violation](https://developers.google.com/apps-script/guides/support/troubleshooting)

**1c. Google's reference `Index.html` is precisely the Option A bridge.** The example binds a `click` to `window.open(externalUrl, 'cameraWindow', ...)`, listens with `window.addEventListener('message', ...)`, gates on `if (event.origin !== 'https://your-external-domain.com') { return; }`, then calls `google.script.run.processCameraData(event.data)`. This is the exact contract in ADR-0015 / spec #93 and the `prototype/scanner/` opener harness. (Full code reproduced in the 2026-07-31 note Q2b; not re-pasted here.)

**1d. The sandbox structurally supports the workaround.** The documented IFRAME sandbox keywords include `allow-popups` and `allow-popups-to-escape-sandbox` (so the opened window escapes the sandbox and can request camera as a normal top-level context), with **no `camera` grant** (so `getUserMedia` stays blocked in-document):

> "The `IFRAME` sandbox mode is based on the iframe sandboxing feature in HTML5, using the following keywords: `allow-same-origin`, `allow-forms`, `allow-scripts`, `allow-popups`, `allow-downloads`, `allow-modals`, `allow-popups-to-escape-sandbox`, `allow-top-navigation-by-user-activation`"
> - [HTML Service: Restrictions](https://developers.google.com/apps-script/guides/html/restrictions)

**1e. No other official method exists.** I searched the official Apps Script documentation (Context7 `/websites/developers_google_apps-script` + the guides/reference tree) for camera, `getUserMedia`, barcode, and QR. The troubleshooting page above is the **only** official guidance; there is no documented in-Apps-Script camera API, no native barcode service, and no alternate sandbox mode that grants camera (`setSandboxMode` is sunset/no-op per the restrictions page). The Apps Script services reference (`SpreadsheetApp`, `UrlFetchApp`, `Utilities`, etc.) contains no image-pixel or QR-decode capability.

**Conclusion (Q1):** The official record is unambiguous. There is exactly one documented method for camera access from an Apps Script HTML Service web app: **host the camera work on a separate HTTPS origin, open it in a new window, and bridge with `postMessage` (verifying `event.origin`).** Option A is not a creative workaround - it is Google's prescribed answer.

---

## Q2 - Community practice (the gap the prior notes left open)

**What Apps Script practitioners ACTUALLY do for QR/barcode/camera scanning in HTML Service web apps. Is external-origin + `postMessage` the common pattern, or do people use others?**

Method: Stack Exchange API search of the `google-apps-script` tag (camera/qr/barcode/scanner/postMessage/jsQR/html5-qrcode/getUserMedia) + reading question/top-answer bodies, and GitHub Search API for repos combining Apps Script with QR/barcode/camera. **Honest headline: the community is fragmented. There is no single dominant pattern.** The most *visible* SO pattern is the one that fails on `/exec`; the pattern practitioners use when they actually *solve* it is the external-origin approach.

**2a. The most-upvoted Stack Overflow "solution" is in-document `html5-qrcode` - but for a modal dialog, not a deployed `/exec` web app.**

- [Q73117564 - "Is it possible to scan a QR code with google app script?"](https://stackoverflow.com/questions/73117564/is-it-possible-to-scan-a-qr-code-with-google-app-script) (2022, score 2; accepted answer score 5). The accepted answer loads `html5-qrcode` from `unpkg` inside `HtmlService` and calls `google.script.run.getQRCode(decodedText)`. **Crucially it uses `SpreadsheetApp.getUi().showModalDialog(...)` - a container-bound modal dialog, not a deployed `/exec` web app.** Modal dialogs have a different embedding context than the `/exec` IFRAME; this answer does not address (and likely predates awareness of) the `/exec` Permissions-Policy block documented in #87. A reader who copies this into a deployed web app hits the wall.

**2b. A 2024 questioner trying exactly the in-document web-app pattern got NO answer.**

- [Q79896912 - "possible to scan a QR code with html5 qrcode google app script?"](https://stackoverflow.com/questions/79896912/possible-to-scan-a-qr-code-with-html5-qrcode-google-app-script) (2024, score 1, **0 answers**). The questioner calls `navigator.mediaDevices.getUserMedia({video:true})` inside an Apps Script web app with `html5-qrcode` and it fails. **Zero answers** - the community has not produced a working in-document web-app solution, consistent with #87's finding that none exists.

**2c. The highest-scoring relevant answer corroborates the structural Permissions-Policy block.**

- [Q67907540 - "How do I enable Feature/Permissions Policy in an iframe in Google Add-ons?"](https://stackoverflow.com/questions/67907540/how-do-i-enable-feature-permissions-policy-in-an-iframe-in-google-add-ons) (2021, score 2; **accepted answer score 9** - the highest-scoring answer in this set). The answer states the governing principle: *"you can pass any permission into nested iframe only if parent context has that permission granted,"* and walks the `sandboxFrame` -> nested-iframe delegation chain. This is independent community corroboration that developers cannot enable camera from inside the Apps Script sandbox.

**2d. The file-input `capture` approach is already known to misbehave on iOS.**

- [Q50232669 - "Origin error when trying to access camera from Google Apps Script website"](https://stackoverflow.com/questions/50232669/origin-error-when-trying-to-access-camera-from-google-apps-script-website) (2018, score 2; accepted answer score 3). The questioner tried `<input type="file" accept="image/*" id="file-input">` and `<input type="file" accept="image/*;capture=camera">` and reports both **"open file manager to choose file instead of asking for camera permission."** The accepted answer says to use `getUserMedia` instead - which is exactly what is blocked on `/exec`. This 2018 observation is the same iOS file-input limitation caniuse documents today (see Q3/B).

**2e. Some practitioners abandon Apps Script entirely for camera needs.**

- [Q57085364 - "scan QR code data and directly enter data into a Google spreadsheet"](https://stackoverflow.com/questions/57085364) (2019, score 2). The top answer points the asker to an **external PHP server** + the Google Sheets API rather than doing capture inside Apps Script - evidence that practitioners leave the platform when camera is required.

**2f. A separate niche: hardware (keyboard-wedge) barcode scanners.**

- [Q63633662 - "USB Barcode scanner repeat scans without server call"](https://stackoverflow.com/questions/63633662/usb-barcode-scanner-repeat-scans-without-server-call) and [Q57836981 - "Automatically advancing cells after scanning data"](https://stackoverflow.com/questions/57836981/automatically-advancing-cells-after-scanning-data). These treat a USB/Bluetooth scanner as **keyboard input** (no camera at all). Viable for a desktop/kiosk check-in but **not** a phone-first app; included for completeness as pattern (F).

**2g. The practitioners who actually SOLVED the Apps Script camera problem on GitHub use the external-origin pattern.**

GitHub repo search (`google apps script qr scanner` / `apps script html5-qrcode` / `apps script barcode camera`) surfaces a small but on-point cluster of repos whose entire purpose is to fix the Apps Script camera block - and **all of them host the scanner off-Apps-Script on a static HTTPS origin**:

- [`rameezscripts/fix-camera-apps-script-barcode-scanner`](https://github.com/rameezscripts/fix-camera-apps-script-barcode-scanner) (2 stars; updated 2026-03-29; HTML). README (quoted directly):
  > "Google Apps Script blocks camera and microphone access due to its sandboxed iframe (`googleusercontent.com` opaque origin). ... This project is a complete free working solution - a **Netlify-hosted barcode scanner** that sends scanned data directly to Google Sheets via Apps Script `doPost()`." It lists the exact failure modes (`NotAllowedError: Permission denied`, `getUserMedia() not allowed in sandboxed iframe`) and concludes "You **cannot fix this** from within Apps Script."
  - **Note the variant:** this repo posts scan data to a second Apps Script `doPost()` endpoint rather than `postMessage`-ing back to the opener window. Both are valid bridges; `postMessage` (Google's reference example) keeps the opener App Document alive and is what ADR-0015 / `prototype/scanner/` use.
- [`Bettot2829/fix-camera-apps-script-barcode-scanner`](https://github.com/Bettot2829/fix-camera-apps-script-barcode-scanner) (0 stars; updated 2026-07-27). Same Netlify-hosted scanner -> Apps Script `doPost()` pattern.
- [`brennandeleo/QR-Scanner-`](https://github.com/brennandeleo/QR-Scanner-) (0 stars; updated 2026-05-27). Description: *"Avoids the wrapper excluding camera use in google apps script."* Same idea - escape the Apps Script wrapper to reach the camera.

**2h. Notable absence.** No Stack Overflow answer and no surfaced GitHub repo prescribes the in-document `<input type=file capture>` + client-side `jsQR` (Option B) pattern as a working Apps Script web-app solution. The only in-Apps-Script "camera" answers are (i) the modal-dialog `html5-qrcode` (Q73117564, not `/exec`) and (ii) the misleading "use `getUserMedia`" answer (Q50232669, which is blocked). The file-input path appears only as a *failed attempt* (Q50232669).

**Conclusion (Q2):** The community is **fragmented** - be honest about this. There is no single dominant pattern. But the evidence points clearly in one direction: (i) the most visible SO pattern (in-document `html5-qrcode`) does not survive deployment to `/exec`; (ii) the practitioners who actually solved the problem all moved the camera **off** Apps Script to a separate HTTPS origin; and (iii) that off-Apps-Script approach is exactly what Google's official docs prescribe. The external-origin + bridge pattern is therefore both the **officially documented** method and the **community-validated** method among those who got it working - it is not merely one option among equally popular ones.

---

## Q3 - Realistic alternatives (fair evaluation for a phone-first app)

Requirements: **phone-first**, must work on **iPhone Safari** and **Android Chrome**, needs **fast continuous** QR scanning (a check-in line).

| # | Approach | Continuous scan? | iPhone Safari | Android Chrome | Runs inside `/exec` sandbox? | Verdict for this app |
|---|----------|:---:|:---:|:---:|:---:|---|
| **A** | External HTTPS origin + `getUserMedia` + decoder (`html5-qrcode`/`jsQR`) + `postMessage` | **Yes** (live stream) | Yes (top-level HTTPS window) | Yes | Bridge only (window/listener); camera off-document | **Recommended** |
| **B** | In-App-Document `<input type=file accept=image/* capture=environment>` + `jsQR` | **No** (photo-per-scan) | Partial - `capture` **not honored** to force camera (caniuse #1); multi-step chooser | Yes (`capture` opens camera) | Yes (file input, `allow-forms`) | **Failed in production** (ADR-0015); weak on iOS |
| **C** | File upload + **server-side** decode | No (photo-per-scan) | n/a (decode is server-side) | n/a | Capture still needed client-side | **Impractical** in Apps Script (see C below) |
| **D** | `BarcodeDetector` API only | Yes (where supported) | **No** - behind a flag, disabled by default | Yes (Chrome 83+) | Would still need camera off-document | **Reject** as sole strategy |
| **E** | Embed a third-party scanner service / iframe | Service-dependent | Same getUserMedia sandbox issue if iframed into `/exec` | Same | No (iframe re-creates the block) | **Reject** for `/exec`; only viable as a top-level external window (= A) |
| **F** | Hardware keyboard-wedge scanner (USB/Bluetooth) | Yes (keyboard) | n/a | n/a | Yes (text input) | **Not phone-first**; desktop/kiosk only |

### (A) External HTTPS origin + `getUserMedia` + decoder + `postMessage`
The documented workaround (Q1). Continuous live-stream decoding; `html5-qrcode@2.3.8` (primary) or `getUserMedia` + canvas + `jsQR` (escape hatch). Top-level HTTPS window can request camera (MDN: only a top-level document can request `getUserMedia` unless the parent delegates via Permissions-Policy - which Google's outer iframe does not). Costs: a second origin to provision/harden, a `postMessage` bridge with strict `event.origin` allowlist, popup/teardown lifecycle. **All mitigated by the `prototype/scanner/` prototype + the 2026-07-31 note's hosting/origin guidance.**

### (B) In-App-Document `<input type=file capture=environment>` + `jsQR` (current ADR-0015 choice)
The ONLY camera mechanism that can run inside the sandbox (file input, not `getUserMedia`). **Fresh evidence corroborates its weakness:**
- **caniuse `html-media-capture` (Aug 2026):** Android Chrome = supported (`y`); **iOS Safari = `y` with note #1: "Does not support the capture attribute used to force capture straight from the device's camera or microphone."** I.e., on iPhone the `capture="environment"` attribute does **not** force the rear camera - the user gets a chooser (Take Photo / Photo Library). This is the structural reason the ADR-0015 production attempt produced a slow, multi-step UX, and matches the 2018 SO observation in Q50232669.
- Photo-per-scan + single-frame `jsQR` decode is slower and less reliable than continuous live-stream decoding (focus/glare/framing), as ADR-0015 already records.
- ADR-0015 itself names Option A as the fallback because of exactly these risks.

### (C) File upload + server-side decode
**Impractical in Apps Script.** Apps Script server-side (V8) has **no image pixel-decoding capability** - no Canvas, no `Image`/`ImageData`, no native QR decode. `jsQR` is pure JS and could in principle run server-side, **but it requires an RGBA `ImageData` pixel array**, and Apps Script cannot decode an uploaded PNG/JPEG blob into pixels (the services reference - `SpreadsheetApp`, `DriveApp`, `Utilities`, `UrlFetchApp`, etc. - exposes no image decoder). The only realistic server-side path is calling an **external decode API** via `UrlFetchApp` (e.g., a QR-decode SaaS or the Cloud Vision API), which adds: a network round-trip per scan (latency), sending member photos to a third party (privacy), cost, and a hard external dependency - while **still requiring client-side capture first** (so it does not remove the camera problem, only relocates decode). **No community example** of server-side QR decode in Apps Script was found in the SO/GitHub search. Prior note #88 already dismissed this for latency/privacy. **Reject for Day 1.**

### (D) `BarcodeDetector` API only
**Rejected - verify current status (MDN BCD + caniuse, Aug 2026):** MDN browser-compat-data marks `BarcodeDetector` **`experimental: true`**. Support: **Safari = added 17, behind a flag** (`flags: true` - disabled by default); **safari_ios = mirror** (same); **Firefox = `false`** (unsupported); **Chrome = partial** ("Supported on ChromeOS and macOS only"); **Edge = partial** ("macOS only"); **chrome_android = 83** (supported); webview_android = mirror. For a phone-first app whose primary target includes iPhone Safari, a `BarcodeDetector`-only design is non-functional on iOS (disabled by default) and absent on Firefox. It is acceptable **only** as an internal accelerator inside a library that has its own fallback decoder (which is how `html5-qrcode` uses it). This re-confirms prior notes #88 and the 2026-07-31 note.

### (E) Embedding a third-party scanner service / iframe
Embedding a scanner **iframe** inside the `/exec` document re-creates the Q1 Permissions-Policy block (the nested iframe still has no `camera` delegation from Google's outer frame - see SO Q67907540). A third-party service is only viable if opened as a **top-level window** - which reduces to Option A with a third-party host (worse: loss of origin control, member data passing through a third party, against the #90 trust boundary). **Reject** for `/exec` embedding; the controlled-self-hosted external window of Option A is strictly better.

### (F) Hardware keyboard-wedge scanner
Treats a USB/Bluetooth scanner as keyboard input into a text field (SO Q63633662, Q57836981). Works inside the sandbox (it is just typing), gives continuous fast scanning, and needs no camera. **But it is a desktop/kiosk pattern, not a phone-first pattern** - church operators will use their phones. Noted for completeness; not a fit for F5's phone-first requirement.

---

## Q4 - Recommendation

**Adopt Option A (external HTTPS origin + `getUserMedia` + decoder + `postMessage`) as the primary method for F5 - not merely the ADR-0015 "fallback."**

**Is external-origin + `postMessage` the most common method?** Honestly: the Apps Script community is **fragmented** and has no single dominant pattern (Q2). The most *visible* community pattern (in-document `html5-qrcode`) is the one that fails on a deployed `/exec` web app. But "most common among attempted patterns" is the wrong question - **most common among patterns that actually work** is the right one, and there the answer is clear: every practitioner who solved the Apps Script camera problem moved the camera off-Apps-Script to a separate HTTPS origin, which is also Google's only documented method.

**Why Option A is the right call for THIS app (phone-first, fast continuous scan, iPhone Safari + Android Chrome):**

1. **Only officially documented method** (Q1) - Google's troubleshooting page prescribes it with a reference implementation. No other camera method is documented for HtmlService.
2. **Community-validated by those who solved it** (Q2g) - the Netlify-hosted scanner repos exist precisely because the in-Apps-Script path is a dead end.
3. **Only option that delivers fast continuous scanning** - the F5 requirement is a check-in line; live-stream decoding (Option A) is qualitatively faster than photo-per-scan (Option B). Options C/E are slower still; D is non-functional on iOS.
4. **Structurally supported** - sandbox grants `allow-popups` + `allow-popups-to-escape-sandbox`; `postMessage` is Baseline (since July 2015); the opened top-level HTTPS window can request camera without any Permissions-Policy delegation (MDN).
5. **Option B's failure is a platform limitation, not an implementation slip** - caniuse confirms iOS Safari does not honor `capture` to force the camera (Q3/B), which is the root cause of ADR-0015's failed production UX. Re-trying Option B will not fix the iOS chooser behavior.

**Recommended configuration (consistent with ADR-0015 + 2026-07-31 note + `prototype/scanner/`):**
- Decoder: pinned, self-hosted **`html5-qrcode@2.3.8`** primary (uses native `BarcodeDetector` internally where available, bundled decoder otherwise); **`jsQR@1.4.0`** escape hatch for full lifecycle ownership. Reject `BarcodeDetector`-only (Q3/D).
- Bridge: App Document opens the external page via `window.open` from a **user gesture**; external page uses `getUserMedia({ video: { facingMode: "environment" } })` + decode; posts `{ type: "EFCC_QR_SCAN", scannedCode }` via `postMessage` with **exact `targetOrigin`** (never `*`); App Document verifies `event.origin` against a single-entry allowlist **before** reading `event.data`; tears down the window + listener on Section unmount.
- Host: any static HTTPS origin EFCC controls (GitHub Pages viable; Netlify/Cloudflare Pages better for header hardening + origin isolation - see 2026-07-31 note Q5). Record the exact origin string in the ADR before the bridge is built.
- Prototype gate (per AGENTS.md): the `prototype/scanner/` real-device matrix (iPhone Safari + Android Chrome) must pass before production wiring. The prototype already exists; this note does not change that gate.

**If the community lacks consensus, say so:** It does lack consensus (Q2). The recommendation therefore rests on (i) the official docs (Q1), (ii) the working-practitioner evidence (Q2g), and (iii) the trade-off analysis against this app's specific requirements (Q3) - not on a claim of community unanimity.

---

## Evidence index

| Claim area | Primary source |
| --- | --- |
| HtmlService camera restriction (Permissions policy violation) - re-verified 2026-08-01 | https://developers.google.com/apps-script/guides/support/troubleshooting (page last updated 2026-06-10 UTC) |
| Official external-domain + `window.open` + `postMessage` workaround + reference `Index.html` | https://developers.google.com/apps-script/guides/support/troubleshooting |
| IFRAME sandbox keywords (`allow-popups`, `allow-popups-to-escape-sandbox`, no camera); `setSandboxMode` sunset | https://developers.google.com/apps-script/guides/html/restrictions |
| `getUserMedia` requires secure context; top-level vs iframe Permissions Policy; `NotAllowedError` | https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia |
| `postMessage` Baseline (July 2015); `event.origin` format; origin verification; never `*` | https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage |
| Barcode Detection API experimental + browser support (Safari/iOS behind flag, Firefox false, Chrome partial) | MDN browser-compat-data `api/BarcodeDetector.json` (fetched 2026-08-01); https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API |
| HTML Media Capture - iOS Safari does not honor `capture` to force camera (caniuse note #1); Android Chrome supported | Can I Use `html-media-capture` raw data (fetched 2026-08-01): https://caniuse.com/html-media-capture |
| Community: in-document `html5-qrcode` modal-dialog pattern (does not address `/exec`) | https://stackoverflow.com/questions/73117564/is-it-possible-to-scan-a-qr-code-with-google-app-script |
| Community: in-document `html5-qrcode` + `getUserMedia` in web app - no answers (hits the wall) | https://stackoverflow.com/questions/79896912/possible-to-scan-a-qr-code-with-html5-qrcode-google-app-script |
| Community: Permissions-Policy delegation requires parent grant (score-9 answer) | https://stackoverflow.com/questions/67907540/how-do-i-enable-feature-permissions-policy-in-an-iframe-in-google-add-ons |
| Community: file-input `capture` opens file manager not camera (2018 iOS observation) | https://stackoverflow.com/questions/50232669/origin-error-when-trying-to-access-camera-from-google-apps-script-website |
| Community: abandoning Apps Script for an external server for camera | https://stackoverflow.com/questions/57085364 |
| Community: hardware keyboard-wedge scanner pattern (desktop/kiosk) | https://stackoverflow.com/questions/63633662/usb-barcode-scanner-repeat-scans-without-server-call |
| Community: external-origin (Netlify) scanner -> Apps Script `doPost()` - practitioners who solved it | https://github.com/rameezscripts/fix-camera-apps-script-barcode-scanner ; https://github.com/Bettot2829/fix-camera-apps-script-barcode-scanner ; https://github.com/brennandeleo/QR-Scanner- |
| `html5-qrcode` cross-platform decoder (pin 2.3.8) | https://github.com/mebjas/html5-qrcode (via prior note #88) |
| `jsQR` escape-hatch decoder | https://www.npmjs.com/package/jsqr (via prior note #88) |
| Deployed `/exec` camera-block observation (structural) | Prior note `2026-07-30-f5-tickets-87-88-89.md` (#87) + ADR-0015 |
| Hosting / origin-allowlist / top-level-permission detail | Prior note `2026-07-31-external-scanner-origin-approach.md` |

## What this note did not do

- Did not implement Scanner/camera/decoder or App Document bridge code.
- Did not mutate Google Sheets or publish real member identifiers.
- Did not re-decide the #90 payload trust contract or re-prove the `getUserMedia`-blocked finding (cross-references the 2026-07-30/07-31 notes instead).
- Did not run the real-device prototype matrix (that is the AGENTS.md gate, unchanged by this note).
- Did not commit (left to repo owner / parent agent policy).
