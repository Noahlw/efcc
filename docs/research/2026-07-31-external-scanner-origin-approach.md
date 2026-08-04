# Research Note: External Scanner Origin Approach (QR Camera in Apps Script)

**Date:** 2026-07-31
**Author:** Research agent (issue [#99](https://github.com/Noahlw/efcc/issues/99) hosting decision + [#93](https://github.com/Noahlw/efcc/issues/93) spec validation)
**Parent:** Feature [#83](https://github.com/Noahlw/efcc/issues/83) · Hosting ticket [#99](https://github.com/Noahlw/efcc/issues/99) · Spec [#93](https://github.com/Noahlw/efcc/issues/93)
**Builds on (does not duplicate):** [ADR-0015](../adr/0015-external-camera-origin-for-qr-scanner.md) and prior research [`2026-07-30-f5-tickets-87-88-89.md`](2026-07-30-f5-tickets-87-88-89.md)
**Sources:** Official Apps Script docs (Context7 `/websites/developers_google_apps-script` + direct `developers.google.com` fetch 2026-07-31), MDN Web Docs, Can I Use, GitHub Pages docs, first-party library pages.
**Status:** Research COMPLETE. Confirms ADR-0015; supplies the new hosting + origin-allowlist + top-level-permission detail that #99 and the #103 bridge need.
**Convention:** `docs/research/` dated notes.

---

## TL;DR

ADR-0015's external-origin decision is **validated by official Google documentation**: Apps Script's own troubleshooting page both documents the camera restriction in HtmlService and prescribes the exact `window.open` + `window.opener.postMessage` + `event.origin`-check workaround adopted by the ADR. `window.open` and `postMessage` work from inside the `/exec` IFRAME because the documented IFRAME sandbox grants `allow-popups` and `allow-popups-to-escape-sandbox`, and `postMessage` is a Baseline-wide-available Web API. The recommended decoder remains pinned **`html5-qrcode@2.3.8`** (cross-platform; rejects the Safari/iOS-blind `BarcodeDetector`-only path, confirmed by MDN + Can I Use), with `jsQR` as the credible escape hatch. **GitHub Pages is a viable host** for the external scanner origin: it serves over HTTPS (the secure context `getUserMedia` requires), and because the scanner opens as a **top-level window** (not an iframe) it needs no `allow="camera"` or Permissions-Policy delegation. The one operational caveat for #99: a `*.github.io` project-site origin is shared across every repo under that user, so the `postMessage` origin-allowlist value is `https://<user>.github.io` (path excluded) and cannot isolate one repo from another under the same user - a custom domain or dedicated org isolates it.

---

## Q1 - Can `getUserMedia` run inside the Apps Script `/exec` IFRAME?

**No. ADR-0015's claim that in-document camera is impossible is confirmed.** Three independent primary sources agree, and a deployed `/exec` probe already observed the block structurally.

**1a. Google officially documents the restriction.** The Apps Script Troubleshooting page describes a "Permissions policy violation" error specifically for `getUserMedia` inside HtmlService:

> "This error occurs when an application using HTMLService attempts to execute Web APIs that require sensitive permissions, such as `navigator.mediaDevices.getUserMedia()` for camera or microphone access. The Apps Script sandboxed environment restricts these features to protect user security."
> — [Apps Script Troubleshooting - Permissions policy violation](https://developers.google.com/apps-script/guides/support/troubleshooting)

**1b. The documented IFRAME sandbox keyword list contains no camera grant.** There is no `allow="camera"` equivalent exposed to HtmlService developers:

> "The `IFRAME` sandbox mode is based on the iframe sandboxing feature in HTML5, using the following keywords: `allow-same-origin`, `allow-forms`, `allow-scripts`, `allow-popups`, `allow-downloads`, `allow-modals`, `allow-popups-to-escape-sandbox`, `allow-top-navigation-by-user-activation`"
> — [HTML Service: Restrictions](https://developers.google.com/apps-script/guides/html/restrictions)

The same page confirms all non-IFRAME sandbox modes are sunset and `setSandboxMode` now has no effect, so there is no alternate mode that could grant camera.

**1c. Browser-level Permissions Policy explains *why* the block is structural.** MDN documents that an iframe cannot call `getUserMedia` unless the top-level context delegates camera to it via Permissions Policy - a delegation Google's outer `#sandboxFrame` does not make:

> "Only a window's top-level document context for a valid origin can even request permission to use `getUserMedia`, unless the top-level context expressly grants permission for a given `<iframe>` to do so using Permissions Policy. Otherwise, the user will never even be asked for permission to use the input devices."
> — [MDN: MediaDevices.getUserMedia - Privacy and security](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

And the failure mode when the policy is missing:

> "On browsers that support managing media permissions with Permissions Policy, this error is returned if Permissions Policy is not configured to allow access to the input source(s)." (describing `NotAllowedError`)
> — [MDN: MediaDevices.getUserMedia - Exceptions](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

**1d. Deployed observation (supplementary).** The 2026-07-30 cold-start probe recorded in #87 / ADR-0015 confirmed this structurally against the CI `/exec` URL: the outer `#sandboxFrame` `allow` list omits `camera`/`microphone`, `document.featurePolicy.allowsFeature("camera") === false` inside the user document, and the console logged `Permissions policy violation: camera is not allowed in this document.` No code inside `doGet()` output controls the Google-owned outer iframe's `allow` list.

**Conclusion:** In-document camera is impossible on current HtmlService `/exec`. ADR-0015's premise holds; it is not re-litigated here.

---

## Q2 - Is the external-origin + `window.open` + `postMessage` workaround the recommended approach?

**Yes - it is the officially documented and prescribed workaround, complete with a reference implementation.**

**2a. Google prescribes the external-domain + new-window + postMessage pattern.** Immediately after documenting the restriction, the troubleshooting page states the remedy:

> "Host the functionality that requires these permissions on a separate domain (outside of Apps Script) and open it in a new window or tab. You can then post the captured data or responses back to your Apps Script application as shown in this example."
> — [Apps Script Troubleshooting - Permissions policy violation](https://developers.google.com/apps-script/guides/support/troubleshooting)

**2b. Google's reference example is exactly the ADR-0015 pattern.** The page ships a complete `Index.html` showing the three moving parts the App Document bridge must own:

> ```js
> document.getElementById('open-camera').addEventListener('click', function() {
>   // External page uses getUserMedia & window.opener.postMessage(...).
>   var externalUrl = 'https://your-external-domain.com/camera';
>   window.open(externalUrl, 'cameraWindow', 'width=600,height=400');
> });
>
> window.addEventListener('message', function(event) {
>   // Check event.origin to ensure message is from the expected source.
>   if (event.origin !== 'https://your-external-domain.com') {
>     return;
>   }
>   console.log('Data received from external window:', event.data);
>   // Send data to server-side Apps Script.
>   google.script.run.processCameraData(event.data);
> });
> ```
> — [Apps Script Troubleshooting - example Index.html](https://developers.google.com/apps-script/guides/support/troubleshooting)

This validates (i) `window.open` from a user-gesture click handler inside the IFRAME, (ii) the external page using `getUserMedia` + `window.opener.postMessage(...)`, and (iii) the App Document filtering `event.origin` then calling `google.script.run`. This is precisely the bridge contract in ADR-0015 decision point 2 and spec #93.

**2c. `window.open` is permitted by the sandbox.** The documented IFRAME sandbox keywords include the two tokens that make the external window work:

> "...`allow-popups`...`allow-popups-to-escape-sandbox`..."
> — [HTML Service: Restrictions](https://developers.google.com/apps-script/guides/html/restrictions)

`allow-popups` permits opening the window; `allow-popups-to-escape-sandbox` lets the popped window run as a normal top-level browsing context (so it is *not* itself sandboxed and can request camera - see Q6).

**2d. `postMessage` is universally available.** The bridge's other half is a Baseline API:

> "Baseline Widely available. This feature is well established and works across many devices and browser versions. It's been available across browsers since July 2015."
> — [MDN: Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)

**Caveat (popup blockers):** `window.open` must be called from a user gesture (the example binds it to a `click`). This is already a spec #93 requirement (user stories 5, 7, 8) and is not a blocker - it is a recoverable failure state with sticky copy + retry.

**Conclusion:** The external-origin approach is not a clever workaround reusing unrelated features - it is Google's documented, prescriptive answer to this exact problem. ADR-0015 is validated on the official record.

---

## Q3 - How should the App Document verify `MessageEvent.origin`? What is the exact origin string format?

**3a. `event.origin` is the scheme + host + port tuple (path excluded).** MDN defines the format precisely:

> "This string is the concatenation of the protocol and '://', the host name if one exists, and ':' followed by a port number if a port is present and differs from the default port for the given protocol. Examples of typical origins are `https://example.org` (implying port `443`), `http://example.net` (implying port `80`), and `http://example.com:8080`. Note that this origin is not guaranteed to be the current or future origin of that window, which might have been navigated to a different location since `postMessage` was called."
> — [MDN: Window.postMessage - The dispatched event](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)

Practical consequences for EFCC:
- The comparison is **exact string equality** against scheme+host (+port only if non-default). For an HTTPS host the port (443) is implicit and omitted, so the allowlist value is e.g. `https://noahlw.github.io` - **no trailing slash, no path**.
- The path of the scanner page (`/<repo>/scanner.html`) is **not** part of the origin and cannot be used to tighten the allowlist. Google's own example compares against `'https://your-external-domain.com'` with no path.

**3b. Origin verification is mandatory; never use `*` as a target.** MDN is explicit on both directions:

> "If you do expect to receive messages from other sites, **always verify the sender's identity** using the `origin` and possibly `source` properties."

> "**Always specify an exact target origin, not `*`, when you use `postMessage` to dispatch data to other windows.** A malicious site can change the location of the window without your knowledge, and therefore it can intercept the data sent using `postMessage`."
> — [MDN: Window.postMessage - Security concerns](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)

**3c. Google's example shows the exact comparison idiom** (quoted in Q2b): `if (event.origin !== 'https://your-external-domain.com') { return; }` - fail closed, return before any processing. Spec #93 user story 10 ("reject `postMessage` events from disallowed origins") maps to this.

**Recommended bridge pattern for #103:**
1. Maintain an **allowlist** of one origin string (the provisioned #99 origin). For GitHub Pages that is `https://<user>.github.io`; for a custom domain `https://scanner.efcc.example`.
2. On every `message` event, `if (!ALLOWED_ORIGINS.has(event.origin)) return;` *before* reading `event.data`.
3. When the external page replies, it should use `event.source.postMessage(payload, event.origin)` (exact target, never `*`) - the standard MDN idiom.
4. Validate the payload shape (`{ type: "EFCC_QR_SCAN", scannedCode: string }`) *after* origin passes; never trust client-supplied `userId` (#90/#93).

**GitHub Pages origin-isolation caveat (relevant to #99):** a project Pages site at `https://<user>.github.io/<repo>/scanner.html` sends `event.origin === "https://<user>.github.io"`. **Every** project site under the same `<user>.github.io` shares that origin, so the allowlist cannot distinguish one repo from another under the same user. If EFCC hosts any other (or untrusted) content under the same `<user>.github.io`, all of it can forge an origin-valid `postMessage`. Mitigations: use a **dedicated GitHub user/org** whose `*.github.io` origin is used only for the scanner, or use a **custom domain** (e.g. `scanner.efcc.example`) which gives a unique, dedicated origin.

---

## Q4 - Decoder library: `html5-qrcode` vs native `BarcodeDetector` vs `jsQR`?

**Recommendation: pinned `html5-qrcode@2.3.8` as primary; `jsQR` (`getUserMedia` + canvas) as the credible escape hatch; reject `BarcodeDetector`-only.** This restates ADR-0015 decision point 4 and prior note #88, now backed by direct primary browser-support evidence.

**4a. `BarcodeDetector` is not viable as a sole strategy - no usable Safari/iOS.** MDN flags the API as limited/experimental:

> "Limited availability. This feature is not Baseline because it does not work in some of the most widely-used browsers." ... "Experimental: This is an experimental technology. Check the Browser compatibility table carefully before using this in production."
> — [MDN: Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API)

Can I Use confirms the phone-target gap precisely:

> "Safari on iOS: 3.2 - 16.7: Not supported; 17.0 - 26.5: Disabled by default" ... "Firefox: 2 - 156: Not supported" ... "Chrome: 83 - 154: Partial support"
> — [Can I Use: BarcodeDetector API](https://caniuse.com/mdn-api_barcodedetector)

For a phone-first church app (iPhone Safari is a primary target), a `BarcodeDetector`-only design is non-functional on iOS. It is acceptable *only* as an internal accelerator inside a library that has its own fallback decoder.

**4b. `html5-qrcode` is the cross-platform primary.** The library self-describes as cross-platform and wraps both camera capture and decode (it can use the native `BarcodeDetector` when present and fall back to its bundled decoder otherwise, per the v2.3.4+ release behavior recorded in prior note #88):

> "A cross platform HTML5 QR code reader."
> — [html5-qrcode README](https://github.com/mebjas/html5-qrcode)

Pin rationale and risk (from prior note #88, unchanged): last npm release `2.3.8` on **2023-04-15** (stale but high download volume; Apache-2.0). Mitigation = exact pin + self-host the file on the external origin (supply-chain control) + keep the `jsQR` escape hatch. The library handles `facingMode`/rear-camera selection and `stop()`/`clear()` teardown; product cooldown/quiet-success stay in #91.

**4c. `jsQR` is the credible escape hatch.** A thin `getUserMedia` + canvas/`ImageData` + [`jsQR`](https://www.npmjs.com/package/jsqr) pipeline is camera-agnostic and gives EFCC full ownership of mount/unmount and decode cadence (no library viewport CSS - the historical #34 risk). Best if EFCC wants minimal dependency surface or `html5-qrcode`'s stall becomes blocking. (License/support detail carried from #88; not re-fetched here.)

| Approach | iPhone Safari | Android Chrome | Firefox | Loading | Verdict |
| --- | --- | --- | --- | --- | --- |
| `BarcodeDetector` only | **No** (disabled/not supported) | Partial | **No** | None (built-in) | **Reject** as sole strategy |
| `html5-qrcode@2.3.8` (pinned) | Yes (bundled decoder) | Yes | Yes | HTTPS `<script>` on external origin, self-hosted | **Primary** |
| `getUserMedia` + `jsQR` | Yes (wherever camera works) | Yes | Yes | Small pure JS on external origin | **Escape hatch** |

---

## Q5 - Can the external origin be hosted on GitHub Pages?

**Yes. GitHub Pages is viable for the external scanner origin.** The scanner page is purely client-side (`getUserMedia` + decode + `postMessage`), and GitHub Pages satisfies the one hard requirement: a secure (HTTPS) context.

**5a. GitHub Pages is a static HTTPS host.** It serves straight from a repo:

> "GitHub Pages is a static site hosting service that takes HTML, CSS, and JavaScript files straight from a repository on GitHub, optionally runs the files through a build process, and publishes a website."
> — [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)

It supports HTTPS (and you can host on the default `github.io` domain or a custom domain):

> "Optionally, to enforce HTTPS encryption for your site, select **Enforce HTTPS**." ... "You can host your site on GitHub's `github.io` domain or your own custom domain."
> — [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) / [About GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)

The default `*.github.io` domain is served over HTTPS automatically (no custom-domain DNS needed); custom domains get HTTPS via the "Enforce HTTPS" option with GitHub-provided TLS.

**5b. HTTPS is the exact requirement `getUserMedia` imposes.** MDN:

> "`getUserMedia()` is a powerful feature that can only be used in secure contexts; in insecure contexts, `navigator.mediaDevices` is `undefined`, preventing access to `getUserMedia()`. A secure context is, in short, a page loaded using HTTPS or the `file:///` URL scheme, or a page loaded from `localhost`."
> — [MDN: MediaDevices.getUserMedia - Privacy and security](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

GitHub Pages therefore meets the camera prerequisite. The scanner page needs no server-side logic, so static hosting is sufficient.

**5c. Top-level window => no iframe/Permissions-Policy restriction applies** (see Q6 for detail). GitHub Pages does not ship a restrictive `Permissions-Policy` header that would block camera on a top-level document, and none is required.

**Why GitHub Pages would (or would not) be a concern:**
- **Custom HTTP headers are not supported on GitHub Pages.** You cannot set a `Content-Security-Policy` or `Permissions-Policy` *response header*. For a top-level camera window this is **not blocking** (camera works regardless), but it limits hardening. A `<meta http-equiv="Content-Security-Policy">` tag is still usable for some CSP directives, though `meta`-based CSP cannot control `frame-ancestors`/reporting the way a header can.
- **Origin sharing (see Q3 caveat):** all project sites under `<user>.github.io` share one origin. This weakens the `postMessage` allowlist if other/untrusted repos live under the same user. Use a dedicated user/org or a custom domain to isolate.
- **Soft usage limits:** ~100 GB/month bandwidth and 10 builds/hour on the free tier - negligible for a church attendance scanner.
- **No server-side anything** - fine here; the page is stateless client code.

**Brief comparison for the #99 provider decision:**

| Host | HTTPS static | Custom response headers (CSP / Permissions-Policy) | Custom/dedicated origin | Fit for scanner |
| --- | --- | --- | --- | --- |
| GitHub Pages | Yes | **No** (meta-CSP only) | `*.github.io` (shared) or custom domain | **Viable**; weakest header control |
| Netlify | Yes | Yes | Custom domain / `*.netlify.app` | Viable; better hardening |
| Cloudflare Pages | Yes | Yes (via `_headers`) | Custom domain / `*.pages.dev` | Viable; best free-tier headers |
| Vercel | Yes | Yes | Custom domain / `*.vercel.app` | Viable |

All four satisfy the camera requirement (HTTPS top-level window). The differentiator is **custom-header control** (CSP/Permissions-Policy hardening) and **origin isolation**, where GitHub Pages is the weakest. For EFCC, GitHub Pages works functionally; if the team wants response-header hardening or a clean dedicated origin without a custom domain, Netlify/Cloudflare Pages are incrementally better at no cost.

---

## Q6 - Does the external scanner page need `allow="camera"`, Permissions-Policy, or special meta tags?

**No - because the design opens it as a top-level window via `window.open`, not as an embedded iframe.** A top-level document is the very context that can request camera by default.

**6a. Top-level context can request camera directly; iframe needs explicit delegation.** MDN:

> "Only a window's top-level document context for a valid origin can even request permission to use `getUserMedia`, unless the top-level context expressly grants permission for a given `<iframe>` to do so using Permissions Policy."
> — [MDN: MediaDevices.getUserMedia - Privacy and security](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

Because `allow-popups-to-escape-sandbox` lets the opened window run as a normal top-level browsing context (Q2c), it is *not* a sandboxed iframe and does not inherit the Apps Script sandbox's missing camera grant. The `allow="camera"` iframe attribute is therefore irrelevant to this design:

> "If you're using `getUserMedia()` within an `<iframe>`, you can request permission just for that frame... `<iframe src="..." allow="camera; microphone">`"
> — [MDN: MediaDevices.getUserMedia - Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

That `allow="camera"` is only needed **if** EFCC embedded the scanner in an iframe - which ADR-0015 explicitly does not do (embedding inside the Apps Script IFRAME is the falsified path of Q1).

**6b. What the external page actually requires:**
1. **Secure context (HTTPS)** - satisfied by any of the hosts in Q5. This is the one hard requirement.
2. **A user-gesture-initiated `window.open`** - to satisfy popup blockers (Google's example opens from a `click`; spec #93 user stories 5/7/8). This is a property of the *opener* (App Document), not a tag on the external page.
3. **The standard `getUserMedia` permission prompt** - the browser asks the user for camera consent on first use; denial is a recoverable `NotAllowedError` (spec #93 user story 7).
4. **No special `<meta>` tags or Permissions-Policy header** are required for `getUserMedia` in a top-level window. A CSP `meta` tag is optional hardening (and only partially effective vs. a header - see Q5).

**Conclusion:** The external scanner page is minimally demanding: HTTPS + a user-gesture opener. No `allow="camera"`, no Permissions-Policy delegation, no special meta tags. The only place `allow="camera"` would appear is if someone re-introduced an iframe embedding - which would re-create the Q1 failure and must be avoided.

---

## Recommendation

**(a) Is the external-origin approach validated?** **Yes.** It is Google's own documented and prescribed remedy for the HtmlService camera restriction (Q1 + Q2), with a reference implementation matching ADR-0015 and spec #93 exactly. `window.open` + `postMessage` are both available from inside the `/exec` IFRAME (sandbox `allow-popups`/`allow-popups-to-escape-sandbox`; `postMessage` is Baseline). The approach should be treated as the settled architecture, pending only the deployed real-phone Prototype (#98/#100) per ADR-0015's evidence gate.

**(b) Recommended decoder library.** **Pinned, self-hosted `html5-qrcode@2.3.8`** as primary (cross-platform; uses native `BarcodeDetector` internally when present, bundled decoder otherwise). **`jsQR`** (`getUserMedia` + canvas) as the credible escape hatch. **Reject `BarcodeDetector`-only** - MDN marks it limited/experimental and Can I Use confirms no usable iPhone Safari (disabled/not supported) and no Firefox. This matches ADR-0015 decision point 4.

**(c) Is GitHub Pages a viable host for the external origin?** **Yes, functionally.** It serves over HTTPS (the secure context `getUserMedia` requires), the scanner is purely client-side, and a top-level window needs no iframe/Permissions-Policy delegation. Two caveats that #99 should record in its decision: (1) GitHub Pages supports **no custom HTTP response headers** (no header-based CSP/Permissions-Policy hardening - meta-CSP only); (2) a `*.github.io` project-site **origin is shared across all repos under that user**, so the `postMessage` allowlist value is `https://<user>.github.io` and cannot isolate one repo from another. If origin isolation or header hardening matters, a **custom domain** (works on GitHub Pages too) or **Netlify/Cloudflare Pages** removes both caveats at no cost. None of these are blocking for #99's "reachable HTTPS placeholder" acceptance criterion.

**(d) Blocking concerns for issue #99.** None on the technical merits. #99's acceptance criteria (operator confirms provider; reachable HTTPS placeholder URL; exact origin recorded for the ADR-0015 allowlist; repeatable deploy flow) are all satisfiable by GitHub Pages or any equivalent static HTTPS host. The **one decision the operator must make and record** is the exact origin string the #103 bridge allowlist will accept:
- GitHub Pages project site: `https://<user>.github.io` (dedicated user/org recommended for isolation).
- Custom domain on any host: e.g. `https://scanner.efcc.example` (best isolation + header control).

Record that string in #99's comment and in ADR-0015 before #103 builds the bridge, because the origin allowlist (Q3) is exact-string, path-excluded, and cannot be loosened later without re-verifying every `message` handler.

---

## Evidence index

| Claim area | Primary source |
| --- | --- |
| HtmlService camera restriction (Permissions policy violation) | https://developers.google.com/apps-script/guides/support/troubleshooting |
| Official external-domain + `window.open` + `postMessage` workaround + example | https://developers.google.com/apps-script/guides/support/troubleshooting |
| IFRAME sandbox keywords (`allow-popups`, `allow-popups-to-escape-sandbox`, no camera) | https://developers.google.com/apps-script/guides/html/restrictions |
| HTTPS required for active content in IFRAME | https://developers.google.com/apps-script/guides/html/restrictions |
| `getUserMedia` requires secure context; top-level vs iframe Permissions Policy; `NotAllowedError` | https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia |
| `postMessage` Baseline; `event.origin` format; origin verification; never `*` | https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage |
| Barcode Detection API limited/experimental | https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API |
| BarcodeDetector browser support (Safari/iOS disabled, Firefox unsupported) | https://caniuse.com/mdn-api_barcodedetector |
| `html5-qrcode` cross-platform | https://github.com/mebjas/html5-qrcode |
| `jsQR` (escape hatch) | https://www.npmjs.com/package/jsqr (via prior note #88) |
| GitHub Pages static HTTPS host | https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages |
| GitHub Pages HTTPS / custom domain | https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site |
| Deployed `/exec` camera block observation | Prior note `2026-07-30-f5-tickets-87-88-89.md` (#87) + ADR-0015 |

## What this note did not do

- Did not implement Scanner/camera/decoder or App Document bridge code (those are #100/#103).
- Did not mutate Google Sheets or publish real member identifiers.
- Did not re-decide ADR-0015 or the #90 payload trust contract; this note confirms and extends them with hosting + origin-allowlist + top-level-permission detail.
- Did not provision any host (that is the #99 operator decision).
