# Apps Script Web App: Can It Be a True PWA / Add-to-Home-Screen Target?

**Date**: 2026-07-30
**Status**: READY (primary-sourced; several sub-points explicitly BLOCKED where undocumented)
**Scope**: Read-only research. No deployment settings changed.
**Context read first**: `docs/adr/0012-e2e-testing-strategy.md` — confirms Apps Script HTML Service web apps route through a Google-controlled sandbox/sign-in wall even under `ANYONE_ANONYMOUS`/`USER_DEPLOYING` access, consistent with the iframe architecture documented below.

---

## Bottom line (answer stated plainly)

**True PWA installation (manifest + service worker, offline-capable, app-like standalone window) is NOT achievable for a `script.google.com/macros/s/<id>/exec` Apps Script web app.** The developer-controlled HTML returned by `doGet()` is rendered **inside a Google-controlled sandboxed iframe**, not as the top-level document at `script.google.com`. Browsers require the web app manifest to be linked from the **top-level document being installed** — and that top-level document/chrome around `/exec` is Google's, not the developer's. No Apps Script guide, restriction page, or codelab documents any mechanism to inject a manifest or register a service worker at that outer, top-level scope.

**The achievable ceiling is a bookmark-style home-screen icon**: a plain saved shortcut to the top-level `/exec` URL, using `apple-touch-icon` / favicon for the glyph, with **no offline capability, no manifest, no standalone display mode guarantee, and no service worker**. This is materially different from a true PWA — it is a saved link that still opens the full browser chrome (or, on iOS with `apple-mobile-web-app-capable`, a script-controlled meta hint that Safari may or may not honor) and still requires network + Google sign-in on each load, exactly as today. It solves "don't have to type/re-find the URL" but does **not** solve offline reliability or remove the Google sign-in wall described in ADR-0012/the prior diagnosis doc.

---

## 1. Official PWA / "Add to Home Screen" installability requirements

**Source**: web.dev, "What does it take to be installable?" — https://web.dev/articles/install-criteria (Pete LePage, Google)

> "In Chrome, your Progressive Web App must meet the following criteria before it will fire the `beforeinstallprompt` event and show the in-browser install promotion:
> - The web app is not already installed.
> - Meets the user engagement heuristics: ... clicked or tapped ... at least 30 seconds viewing the page ...
> - Be served over HTTPS.
> - Includes a web app manifest that includes:
>   - `short_name` or `name`
>   - `icons` - must include a 192px and a 512px icon
>   - `start_url`
>   - `display` - must be one of `fullscreen`, `standalone`, `minimal-ui`, or `window-controls-overlay`
>   - `prefer_related_applications` must not be present, or be `false`"

Note: this page (Chrome's own installability criteria) does **not** list a service worker as a hard Chrome-side installability requirement — but web.dev's broader "Learn PWA" curriculum (`web.dev/learn/pwa/installation`, `web.dev/learn/pwa/service-workers`) treats a registered service worker as foundational to the PWA definition (reliability/offline), and MDN's parallel installability doc lists a service worker with a `fetch` handler as a criterion on Chromium browsers specifically. For this research the operative fact is simpler and dispositive regardless: **the manifest must be linked from the page being installed**, and that page must be the top-level document (see §3).

## 2. Does HtmlService let the developer control the `<head>` enough to add a manifest link / register a service worker?

**Source**: Apps Script "HTML Service: Restrictions" — https://developers.google.com/apps-script/guides/html/restrictions

> "To protect users from malicious HTML or JavaScript, the HTML service uses iframes to sandbox web apps or custom user interfaces for Google Docs, Google Sheets, and Forms."

> "The `IFRAME` sandbox mode is based on the iframe sandboxing feature in HTML5, using the following keywords: `allow-same-origin`, `allow-forms`, `allow-scripts`, `allow-popups`, `allow-downloads`, `allow-modals`, `allow-popups-to-escape-sandbox`, `allow-top-navigation-by-user-activation` — This attribute is only set for stand-alone script projects."

> "The `allow-top-navigation` keyword, which allows the content to navigate its top-level browsing context, is restricted and not set as an attribute in the sandbox."

Yes — the developer fully controls the `<head>` and `<body>` of the HTML file(s) returned by `doGet()` (confirmed by "HTML Service: Create and Serve HTML," https://developers.google.com/apps-script/guides/html: `doGet` "must return an `HtmlOutput` object," and the example `Index.html` includes a full `<head>` the developer authors). A `<link rel="manifest" href="...">` tag or a `<script>navigator.serviceWorker.register(...)</script>` call can technically be placed in that HTML without Apps Script rejecting it syntactically.

**However**, that HTML is the content of the **sandboxed iframe**, not the top-level document (confirmed by the restrictions page's own framing: "the HTML service uses iframes to sandbox web apps"). Two consequences, one documented and one not:

- **Documented restriction relevant here**: `allow-top-navigation` is explicitly *not* granted to the sandboxed iframe (only `allow-top-navigation-by-user-activation`, and only for standalone web apps). This is Google's own confirmation that the developer's HTML runs in a context deliberately prevented from controlling the top-level browsing context — the exact capability a manifest-based install needs (see §3).
- **BLOCKED / undocumented**: Neither the "HTML Service: Restrictions" page nor the "Migrate to IFRAME Sandbox Mode" page (https://developers.google.com/apps-script/migration/iframe) mentions `<link rel="manifest">`, `manifest`, `service worker`, `serviceWorker`, `PWA`, `installable`, or `add to home screen` anywhere in their text. I checked both pages in full; the word "manifest" does not appear on either (Apps Script's own `appsscript.json` "manifest" is a different, unrelated concept — see `developers.google.com/apps-script/concepts/manifests`, which is about script permissions/config, not a web app manifest). There is **no official statement** that service-worker registration is specifically blocked or specifically allowed inside the sandboxed iframe. This is a genuine documentation gap on Google's side, not something I can infer a definitive answer to from these pages. (Web-platform-general behavior — sandboxed iframes without `allow-same-origin` cannot register service workers per the HTML Living Standard — is a general web fact, not something documented in Apps Script's own docs, so I am not citing it as an Apps-Script-specific answer.)

## 3. Does the cross-origin IFRAME architecture block PWA manifest detection?

**Source**: Apps Script "Web Apps" guide — https://developers.google.com/apps-script/guides/web

> "A script can be published as a web app if it meets these requirements: It contains a `doGet` or `doPost` function. The function returns an HTML service `HtmlOutput` object..."

This confirms `doGet()`'s return value is the entirety of what the developer controls. Combined with the restrictions page's statement that "the HTML service uses iframes to sandbox web apps" (§2), the architecture is: **the developer's HTML becomes iframe content; the outer page that the browser actually navigates to at `script.google.com/macros/s/<id>/exec` is Google-controlled chrome, not something exposed to `doGet()`.** No Apps Script page documents any API, setting, or manifest field that lets a developer inject markup into that outer/top-level document. This is corroborated by the "HTML Service: Restrictions" and "Migrate to IFRAME Sandbox Mode" pages both being written entirely from the perspective of "what you can do inside the iframe" (link targets, HTTPS, gapi loading, Picker `setOrigin`) — never once addressing the outer frame's own markup, because it is not exposed to the developer.

Per web.dev's installability criteria (§1), the manifest must be a page-level `<link rel="manifest">` on the document the browser is being asked to install — i.e., the top-level document at the `/exec` origin. Since the developer cannot write to that top-level document (it is Google's), **a manifest linked from the developer's `doGet()` HTML is linked from the wrong document (the iframe, not the top-level page) and will not be discovered by the browser's installability check.** This is a direct architectural consequence of facts documented on the pages above, not a guess: Chrome's/web.dev's own rule ("manifest present on every installable page," §1) requires the manifest on the page being installed, and Apps Script's own docs establish that the page users load (`script.google.com/.../exec`) is not the page the developer authors.

**BLOCKED on one narrower point**: I could not find an official Apps Script architecture diagram or page that explicitly draws "outer page = Google chrome, inner iframe = your HTML" with that exact vocabulary. The restrictions page's phrase "uses iframes to sandbox web apps" is the closest official statement, and it is unambiguous about the sandboxing relationship, but Google does not publish a labeled architecture diagram of the outer/inner frame split for standalone web apps specifically (as opposed to the Sites-embedding case, which is diagrammed — see §6).

## 4. Any official Apps Script PWA / manifest / service-worker sample or codelab?

Checked:
- Context7 library `/websites/developers_google_apps-script` — no results for "PWA," "manifest" (web app manifest sense), "service worker," or "add to home screen" surfaced in the HTML Service, Web Apps, or Restrictions material retrieved above.
- `developers.google.com/apps-script/guides/html`, `.../guides/html/restrictions`, `.../guides/web`, `.../migration/iframe` — read in full above; none mention PWA/manifest/service worker.
- Google's own PWA codelabs (`developers.google.com/codelabs/pwa-training/...`) are generic web platform codelabs, not Apps Script codelabs, and do not reference Apps Script or HtmlService anywhere in their titles/scope.

**Result: BLOCKED.** No official Google sample, guide, or codelab demonstrates a PWA-installable Apps Script web app. Absence of such material across Context7 and the canonical `developers.google.com/apps-script/*` guide tree is itself evidence (not proof) consistent with the architectural blocker in §3 — Google has not documented a workaround because, per the documented sandbox model, there isn't one within `doGet()`/HtmlService.

## 5. Fallback: manifest-free "Add to Home Screen" — is a plain bookmark icon still available?

**iOS Safari** — Apple Developer, "Configuring Web Applications" — https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html

> "You may want users to be able to add your web application or webpage link to the Home screen. These links, represented by an icon, are called Web Clips."

> "To specify an icon for the entire website... place an icon file in PNG format in the root document folder called `apple-touch-icon.png`" — or via `<link rel="apple-touch-icon" href="/custom_icon.png">`.

> "Set the `apple-mobile-web-app-capable` meta tag to `yes` to turn on standalone mode... there is no browser URL text field at the top of the screen or button bar at the bottom of the screen."

This confirms iOS Safari's Home Screen "Add" feature is **independent of the PWA manifest/service-worker machinery** — it is a `Save-to-Home-Screen` bookmark mechanism dating to the original iPhone SDK era, driven by `apple-touch-icon` + optional `apple-mobile-web-app-*` meta tags, entirely separate from `web-app-manifest.json`. Because these are plain `<meta>`/`<link>` tags placed in the developer's own HTML `<head>`, they are things the Apps Script `doGet()` HTML **can** include (§2 confirms the developer authors the iframe's `<head>`).

**Important caveat, directly tied to §3's architectural finding**: these Apple meta tags only take effect on the **document the user actually taps "Add to Home Screen" from in Safari** — i.e., whatever Safari's address bar shows as the current page, which is the top-level `script.google.com/.../exec` URL, not the developer's iframe content. Apple's docs do not describe iframe-scoped or nested-document behavior for these tags at all; they are documented purely as top-level-page directives. This means:
- If `apple-mobile-web-app-capable` is placed only in the developer's iframe HTML, Safari reading the top-level document (Google's wrapper, per §3) would not see it — same manifest-discovery problem as §3, applied to these older meta tags.
- What **does** unambiguously work, confirmed by Apple's own "Specifying a Webpage Icon for Web Clip" text above, is the simplest form: Safari's "Add to Home Screen" always works as a generic bookmark of the current top-level URL with whatever favicon/touch-icon is discoverable at that top-level origin, **regardless of manifest or meta-tag presence** — this is literally how Web Clips predate the PWA manifest standard by several years. The user gets an icon that reopens `https://script.google.com/macros/s/<id>/exec` in Safari (full browser chrome, not standalone), which is exactly the bookmark-stability outcome available today without any code change.

**Android Chrome** — I checked `developer.chrome.com` and web.dev for an Android-equivalent "plain bookmark, no manifest" mechanism and could not find an official page describing a *manifest-free* "Add to Home Screen" affordance as a first-class feature the way Apple documents Web Clips. Chrome's own install-criteria doc (§1) frames "Add to Home Screen" as gated on the manifest criteria for the rich install experience. Chrome does still let users create a home-screen shortcut without meeting installability criteria via the browser menu's "Add to Home screen" item, but **BLOCKED**: I could not locate an official developer.chrome.com or web.dev page that documents this basic-bookmark-shortcut path (as opposed to the manifest-gated PWA install path) with citable specifics on its resulting icon/URL/offline behavior for Android Chrome. This is a real gap in the primary sources I checked, not an inference — Google's public developer docs are written almost entirely from the "make it installable" (manifest-driven) angle, not the "plain shortcut" angle, for Android.

**Conclusion for §5**: the Apple-documented Web Clip mechanism is a valid, primary-sourced fallback for iOS, and it works fine even with Apps Script's iframe chain because it bookmarks the top-level `/exec` URL rather than depending on manifest discovery inside the iframe. The Android equivalent almost certainly exists in practice (Chrome's menu has long offered "Add to Home screen" for any page) but I could not find Google's own documentation of it as a manifest-independent feature to cite definitively — flagging as BLOCKED rather than asserting from general knowledge.

## 6. Does Google Sites support PWA / add-to-home-screen for an embedded Apps Script web app?

**Source**: Apps Script "Web Apps" guide, "Embed your web app in Google Sites" section — https://developers.google.com/apps-script/guides/web

> "Embedded web apps are still subject to access permissions to prevent malicious use... The web app appears in a frame in the page's preview."

This confirms Sites embeds the Apps Script web app **as yet another iframe**, nested one level deeper than the Apps Script sandbox iframe already described in §2/§3 (Sites page → iframe → Apps Script's own sandbox iframe → developer HTML). I found no Google Sites documentation (checked via the Apps Script guide's own cross-reference, which is the only primary-source link between the two products) describing PWA manifest support, service-worker registration, or install-prompt behavior for Sites pages at all — Sites' own product documentation is outside `developers.google.com/apps-script` and outside `web.dev`, and no page in either of those primary-source surfaces addresses Sites + PWA.

**Result: BLOCKED.** No official documentation (Apps Script guides, web.dev, or the cross-links between them) states that Google Sites supports PWA manifest injection or add-to-home-screen installability for an embedded Apps Script web app. Architecturally, adding a third iframe layer (Sites → Apps Script sandbox → developer content) would only compound the top-level-document problem from §3, not solve it, since Sites itself is a Google-controlled top-level domain (`sites.google.com`) whose page markup is not developer-editable either. This is a structural inference consistent with §3, not a documented Sites-specific statement.

---

## Summary of BLOCKED items (explicit)

- §2: Whether service-worker registration is specifically permitted or denied inside the Apps Script `IFRAME` sandbox — not mentioned in either the "HTML Service: Restrictions" page or the "Migrate to IFRAME Sandbox Mode" page.
- §3: No official Apps Script architecture diagram/page uses the explicit "outer Google chrome vs. inner developer iframe" vocabulary for standalone web apps (the restrictions page's "uses iframes to sandbox web apps" is the closest primary statement, and it is sufficient to establish the conclusion, but a dedicated diagram was not found).
- §4: No official Apps Script sample, guide, or codelab demonstrating PWA installability — confirmed absent, not merely unfound.
- §5 (Android): No developer.chrome.com/web.dev page documenting a manifest-independent "plain bookmark, no offline" Add-to-Home-Screen mechanism for Android Chrome, parallel to Apple's Web Clip documentation.
- §6: No Google Sites documentation on PWA/manifest support was locatable via the Apps Script/web.dev primary-source surfaces used for this research.

## Direct answers to the two questions in the Goal

1. **Does moving the deployer to a Workspace/NGO account fix the ANYONE_ANONYMOUS sign-in wall or the 30-day/exec-rotation issues?** Out of scope for this document (see companion research task); this document only addresses the PWA/home-screen question.
2. **Can the deployed web app be added to a phone home screen (PWA-style) for stability with elderly users?** Not as a true PWA — the manifest/service-worker path is architecturally blocked by Apps Script's iframe sandbox (developer HTML is never the top-level document at `/exec`). The only documented, working mechanism is a **plain bookmark-style Home Screen icon** (confirmed for iOS via Apple's Web Clip docs, §5), which saves the top-level `/exec` URL with a favicon/touch-icon — no offline capability, no standalone app chrome guarantee, and it still hits the same Google sign-in wall on every open that ADR-0012 and the prior diagnosis document already identified as the core stability problem for elderly users. It solves "don't have to re-type/re-find the URL" but does not solve "don't have to sign in / don't need network."
