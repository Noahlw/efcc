# Host Shell Architecture Assessment

**Date:** 2026-08-01
**Author:** Senior engineer research (architecture review)
**Subject:** Whether the "Host Shell" pattern (GitHub Pages top-level + Apps Script iframe + postMessage) is a sustainable architecture for EFCC
**Status:** Research COMPLETE
**Sources:** Official Google Apps Script docs, MDN Web Docs, Martin Fowler / Cam Jackson (ThoughtWorks), ThoughtWorks Technology Radar, GitHub Pages docs, W3C/WHATWG specs, existing EFCC ADRs.
**Convention:** `docs/research/` dated notes. Read-only: no code changes, no Sheet mutation, no commits.

---

## TL;DR

The Host Shell is **technically viable but not recommended** for EFCC at its current scale. It inverts Google's own documented remedy (which prescribes `window.open` to a separate window, not making the external page the top-level host), compounds the system's already-unconventional architecture (Sheets DB + Apps Script) with a second deployment origin and a cross-origin iframe protocol, and adds long-term maintenance costs that are disproportionate for a single feature (camera) serving one church with dozens of users. The current ADR-0015 approach (`window.open` to an external scanner page) **is** the officially documented method. The recommended path is to keep it, polish its UX, and not build the Host Shell.

If same-tab scanning is genuinely non-negotiable, the Host Shell can work with strict safeguards (listed in the Recommendation), but the honest assessment is that the complexity is not justified by the problem.

---

## Context: what the Host Shell actually changes

The existing ADR-0015 architecture and the proposed Host Shell are **architecturally distinct**, not variations of the same idea:

| | ADR-0015 (current) | Host Shell (proposed) |
|---|---|---|
| Top-level document | Apps Script `/exec` app | GitHub Pages static site |
| Apps Script app | Top-level | Embedded in cross-origin `<iframe>` |
| Scanner | Separate window/tab via `window.open` | Full-screen overlay owned by the Host |
| Camera | Top-level window (escapes sandbox) | Top-level window (Host is top-level) |
| Cross-origin comms | `postMessage` (opener <-> popup) | `postMessage` (Host <-> iframe) |
| Canonical URL | Apps Script `/exec` URL | GitHub Pages URL |
| Deployment pipelines | 1 (Apps Script via clasp) | 2 (Apps Script + GitHub Pages) |
| Google's official guidance | **Matches exactly** | **Does not match** (Google prescribes `window.open`, not iframe composition) |

The critical difference: Google's official troubleshooting remedy (the *only* documented method) says "host the functionality on a separate domain and **open it in a new window or tab**" — i.e., the Apps Script app stays top-level and the camera page is a popup. The Host Shell inverts this: the camera page's host becomes top-level and the Apps Script app becomes the iframe. This inversion is the user's own design, not a documented pattern.

---

## Q1 — Is iframe-based micro-frontend composition a recognized, sustainable pattern?

### Direct answer

Iframe composition is a **recognized** micro-frontend integration approach, but it is **not the preferred one** among established sources. It is acknowledged as viable with significant known costs, and the recommended approaches are server-side composition or run-time JavaScript integration. For a single-team, single-church app, micro-frontends of any kind are a solution to a problem you do not have (team scaling).

### Evidence

**Martin Fowler / Cam Jackson ("Micro Frontends", martinfowler.com)** — the canonical industry article — lists iframe composition as one of five integration approaches, but explicitly positions it as the least preferred:

> "We often see a lot of reluctance to choose iframes. While some of that reluctance does seem to be driven by a gut feel that iframes are a bit "yuck", there are some good reasons that people avoid them. The easy isolation mentioned above does tend to make them **less flexible** than other options. It can be **difficult to build integrations** between different parts of the application, so they make **routing, history, and deep-linking more complicated**, and they present some **extra challenges to making your page fully responsive**."
> — [Cam Jackson, "Micro Frontends", martinfowler.com](https://martinfowler.com/articles/micro-frontends.html) (Integration approaches > Run-time integration via iframes)

The article then states that **run-time integration via JavaScript** is "probably the most flexible one, and the one that we see teams adopting most frequently." Iframe is presented as the simplest but least flexible option — not as a recommended long-term architecture.

**ThoughtWorks Technology Radar** — micro-frontends as a *technique* moved from "Trial" (May 2018) to "Adopt" (May 2020), and is now "NOT ON THE CURRENT EDITION" (meaning it has graduated to mainstream adoption). Their assessment:

> "We've had almost universally positive experiences with the approach and have found a number of patterns to use micro frontends even as more and more code shifts from the server to the web browser."
> — [ThoughtWorks Technology Radar: Micro frontends](https://www.thoughtworks.com/radar/techniques/micro-frontends)

However, this endorsement is for **micro-frontends as a concept** (independent deployment, team autonomy), not specifically for **iframe composition**. ThoughtWorks' own practitioners (the Fowler article authors) recommend JS-based integration over iframes.

**Key point:** micro-frontends exist to solve **organizational scaling** — multiple teams working independently on a large product. EFCC has one developer, one church, and ~7 views. The problem micro-frontends solve (team coordination, independent deployment at scale) does not exist here.

### Senior-engineer take

I would not recommend iframe-based micro-frontend composition to a team unless they had a specific, hard constraint that made it necessary (e.g., composing apps from different organizations with incompatible frameworks, or strict security isolation requirements). For a single-team app, it introduces complexity without organizational benefit. The Martin Fowler article's assessment — "less flexible," "routing/history/deep-linking more complicated," "extra challenges for responsiveness" — describes real, ongoing maintenance taxes, not one-time setup costs.

---

## Q2 — What are the specific stability risks of cross-origin iframe + postMessage communication?

### Direct answer

`postMessage` itself is a stable, Baseline Web API (available since July 2015). The risks are not in the API but in the **integration patterns around it**: message ordering across asynchronous boundaries, iframe lifecycle management, no built-in error propagation, no connection state, and significantly harder debugging across two origins. These are manageable but add real ongoing complexity.

### Evidence

**postMessage is Baseline and stable:**

> "Baseline Widely available. This feature is well established and works across many devices and browser versions. It's been available across browsers since July 2015."
> — [MDN: Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)

**Security requires constant vigilance:**

> "If you do expect to receive messages from other sites, **always verify the sender's identity** using the `origin` and possibly `source` properties. Any window (including, for example, `http://evil.example.com`) can send a message to any other window within the iframe hierarchy."
>
> "**Always specify an exact target origin, not `*`**, when you use `postMessage` to dispatch data to other windows. A malicious site can change the location of the window without your knowledge, and therefore it can intercept the data sent using postMessage."
> — [MDN: Window.postMessage - Security concerns](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)

**Cross-origin iframes are opaque to each other:**

> "Script access to a frame's content is subject to the same-origin policy. Scripts cannot access most properties in other `window` objects if the script was loaded from a different origin, including scripts inside a frame accessing the frame's parent. Cross-origin communication can be achieved using `Window.postMessage()`."
> — [MDN: `<iframe>` - Scripting](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe)

**Iframes consume significant resources:**

> "Because each browsing context is a complete document environment, every `<iframe>` in a page requires increased memory and other computing resources. While theoretically you can use as many `<iframe>`s as you like, check for performance problems."
> — [MDN: `<iframe>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe)

### Specific stability risks (not covered by a single doc page, but well-known engineering realities):

| Risk | Description | Mitigation difficulty |
|---|---|---|
| **Message ordering** | `postMessage` events are queued and delivered asynchronously. Messages from the same source arrive in FIFO order, but there is no request/response correlation built in. If the Host sends a handshake and the iframe sends a scan before the handshake is processed, messages can cross. | Medium — requires a message-ID correlation protocol |
| **Race conditions on load** | The iframe must be fully loaded before the Host can send it messages. There is no `onload`-equivalent guarantee that the iframe's JS is ready to receive. The Host must implement a handshake (send -> wait for ACK -> proceed). | Medium — handshake protocol needed |
| **Iframe lifecycle** | If the Apps Script app reloads (e.g., `google.script.run` causes a re-render, or the iframe is navigated), the Host's message listener is orphaned. The Host must detect iframe death (no heartbeat) and recover. | High — no built-in iframe-death event |
| **No error propagation** | If the iframe throws an exception, the Host cannot catch it. `postMessage` has no error channel. Errors must be manually serialized and sent as message payloads. | Medium — error-message protocol |
| **Debugging across origins** | Browser dev tools show two separate execution contexts. Stack traces do not cross the origin boundary. Console logs from the iframe and the Host are interleaved but not correlated. | High — inherent to cross-origin |
| **Origin changes** | If the Apps Script `/exec` URL changes (new deployment), the iframe's `src` changes, but the origin stays `script.google.com`. However, if the deployment moves to a different domain (e.g., shared drive transfer), the web app **ceases to function**: "Web apps deployed in one domain cease to function if their ownership changes to a shared drive or account in a different domain." — [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web) | High — requires redeployment |
| **Protocol version drift** | The Host and the Apps Script iframe must agree on the postMessage protocol (message types, payload shapes). If one side is updated and the other isn't, messages are silently dropped or misinterpreted. There is no schema validation across origins. | Medium — requires version negotiation |

### Senior-engineer take

`postMessage` is a reliable primitive, but it is a **transport**, not a **protocol**. Building a reliable protocol on top of it (handshake, request/response correlation, error propagation, heartbeat/liveness, version negotiation) is real engineering work that must be maintained forever. For a bidirectional bridge (scan -> result -> scan -> result), this is non-trivial. I would budget 2-3x the effort for the bridge protocol vs. the camera code itself, and expect ongoing debugging friction because cross-origin issues are notoriously hard to reproduce.

---

## Q3 — Is relying on GitHub Pages as a production-critical host a sound choice?

### Direct answer

GitHub Pages is **adequate for static assets and docs** but is **not designed as a production application entry point**. It has no SLA, soft usage limits, no server-side logic, no custom response headers (on the default domain), and its availability depends on GitHub's infrastructure and policies. For a church app with low traffic, the limits won't be hit — but the *architecture* of depending on GitHub Pages as the canonical entry point for a production application is unconventional and carries avoidable risk.

### Evidence

**GitHub Pages is a static site hosting service:**

> "GitHub Pages is a static site hosting service that takes HTML, CSS, and JavaScript files straight from a repository on GitHub, optionally runs the files through a build process, and publishes a website."
> — [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)

**Usage limits (soft, documented on the About page):**
GitHub Pages sites have soft limits including a bandwidth limit (~100 GB/month) and a build rate limit (~10 builds/hour). These are generous for a church scanner but are *soft* limits — GitHub can throttle or disable a site that exceeds them without prior notice. The limits are documented at [About GitHub Pages > Usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#usage-limits).

**No SLA or uptime guarantee:** GitHub Pages has no published Service Level Agreement. The GitHub Terms of Service and Acceptable Use Policies govern use, and GitHub reserves the right to suspend or terminate accounts. GitHub has had Pages outages (e.g., during broader GitHub incidents). There is no recourse for downtime.

**No custom response headers on the default domain:** GitHub Pages does not support setting custom HTTP response headers (CSP, Permissions-Policy, etc.) on `*.github.io` domains. A `<meta http-equiv="Content-Security-Policy">` tag provides partial CSP but cannot control `frame-ancestors` or reporting the way a header can. This limits security hardening of the Host Shell. (Custom domains also do not support custom headers on GitHub Pages.)

**Account/repo dependency:** The URL `noahwong-hue.github.io/efcc-scanner` depends on:
- The GitHub account `noahwong-hue` remaining active (not suspended, not deleted).
- The repo `efcc-scanner` remaining named exactly that (a rename breaks the URL).
- GitHub not changing Pages policy (GitHub has historically changed Pages features — e.g., enforcing HTTPS, deprecating older build methods).

**Origin sharing caveat (from prior research, ADR-0015):** All project sites under `<user>.github.io` share one origin (`https://<user>.github.io`). The `postMessage` origin-allowlist value is `https://<user>.github.io` (path excluded), so it cannot distinguish one repo from another under the same user. — [Prior research: 2026-07-31-external-scanner-origin-approach.md, Q3c](../research/2026-07-31-external-scanner-origin-approach.md)

### Senior-engineer take

GitHub Pages is fine for hosting the scanner *page* (as in ADR-0015, where it's a popup that opens and closes). Making it the **canonical application entry point** — the URL every user visits to access the entire app — elevates it from "a static asset host" to "a production-critical dependency with no SLA." I would not recommend this for any production application, regardless of scale. If you need a stable entry point with an SLA, use a host that provides one (Cloudflare Pages, Netlify, or a custom domain on any CDN). If you keep GitHub Pages, it should be for the scanner page only, not the app shell.

---

## Q4 — Is the Apps Script + Host Shell coupling fragile?

### Direct answer

**Yes, the coupling is fragile.** The Host Shell and the Apps Script app must agree on three things that can drift independently: (1) the embedded `/exec` URL, (2) the postMessage protocol (message types, payload shapes), and (3) the origin allowlist. These are coordinated by convention, not by a build-time contract. There is no compiler, no type system, and no test that catches protocol drift between two independently-deployed origins.

### Evidence

**Apps Script deployment URL behavior:**

> "This URL ends in `/dev` and can only be accessed by users who have edit access to the script. This instance of the app always runs the most recently saved code and is only intended for testing during development."
> — [Apps Script Web Apps - Test a web app deployment](https://developers.google.com/apps-script/guides/web)

Production deployments use `/exec` URLs. Each **new** deployment (Deploy > New deployment) generates a new deployment ID and a new URL. "Manage deployments > Edit > New version" keeps the same deployment ID (same URL) across pushes — but this is a manual step that must be done correctly every time. If someone accidentally creates a new deployment instead of editing an existing one, the URL changes and the Host Shell's hardcoded `iframe.src` breaks silently.

**Domain transfer breaks web apps:**

> "Web apps deployed in one domain cease to function if their ownership changes to a shared drive or account in a different domain. This can be corrected by having the new owner or collaborator redeploy the web app in the new domain."
> — [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)

**Protocol version drift is undetectable at build time:** The Host Shell (GitHub Pages, static JS) and the Apps Script iframe (`.gs` + `.html` via clasp) are deployed through completely separate pipelines. There is no shared type definition, no contract test, and no CI step that verifies protocol compatibility. If the Apps Script app adds a required field to a `postMessage` payload, the Host Shell has no way to know until runtime — and the failure mode is silent (message ignored or misinterpreted, not an error).

### Coupling risks summary:

| Coupling point | How it breaks | Detection | Fix effort |
|---|---|---|---|
| `/exec` URL in `iframe.src` | New deployment creates new URL; domain transfer breaks app | Silent (iframe loads a dead page) | Manual: update Host, redeploy Pages |
| postMessage protocol (types/shapes) | Either side changes payload; other side misinterprets | Silent (messages dropped/misread) | Manual: coordinate both deploys |
| Origin allowlist | Host origin changes (repo rename, account change, custom domain) | Silent (messages rejected by allowlist) | Manual: update allowlist in both places |
| `setXFrameOptionsMode(ALLOWALL)` | Google changes Apps Script iframe policy | Silent (iframe blocked by X-Frame-Options) | Unknown — depends on Google |
| Scanner overlay lifecycle | Host opens overlay; iframe expects to be visible | Visual (scanner appears over hidden app) | Manual: coordinate show/hide |

### Senior-engineer take

This is the kind of coupling that senior engineers call "distributed monolith" or "temporal coupling disguised as loose coupling." The two systems look independent (separate origins, separate deploys) but are tightly coupled by an undocumented protocol that can only be verified at runtime. I would not ship this without: (a) a version field in every postMessage payload, (b) a handshake that rejects protocol mismatches, (c) a contract test that runs in CI against both sides, and (d) a runbook for URL rotation. That's significant infrastructure for a church app.

---

## Q5 — URL stability comparison: Apps Script `/exec` vs GitHub Pages

### Direct answer

**GitHub Pages with a custom domain is more stable than an Apps Script `/exec` URL**, but GitHub Pages without a custom domain (the `*.github.io` URL) is roughly comparable in stability to a well-managed `/exec` URL. Both have distinct failure modes. Neither provides a truly stable URL without a custom domain.

### Evidence

**Apps Script `/exec` URL:**
- **Stable when managed correctly:** "Manage deployments > Edit > New version" keeps the same deployment ID (and thus the same `/exec` URL) across code pushes. This is the production-correct workflow.
- **Breaks when:** A new deployment is created instead of editing an existing one (new deployment ID = new URL); ownership transfers to a shared drive or different-domain account (app ceases to function); the script project is deleted.
- **No custom domain:** Apps Script web apps cannot be served on a custom domain. The URL is always `https://script.google.com/macros/s/<deployment-id>/exec`.
- **Deployment ID is opaque:** The URL contains a long opaque ID that is meaningless to humans and cannot be made memorable.

**GitHub Pages URL:**
- **Stable when:** The repo and account remain unchanged. The URL `https://<user>.github.io/<repo>/` persists across pushes (no deployment step needed — pushing to the repo updates the site).
- **Breaks when:** The repo is renamed (URL changes); the account is suspended/deleted; GitHub changes Pages policy.
- **Custom domain supported:** GitHub Pages supports custom domains with HTTPS (via "Enforce HTTPS"). A custom domain (e.g., `checkin.efcc.org`) is stable regardless of the underlying GitHub account/repo structure. — [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- **No deployment step:** Pushing to the repo updates the site immediately (no "Deploy > New version" manual step).

### Comparison table:

| Factor | Apps Script `/exec` | GitHub Pages `*.github.io` | GitHub Pages + custom domain |
|---|---|---|---|
| URL changes on code push? | No (if "Edit > New version") | No (push updates site) | No |
| URL changes on new deployment? | **Yes** (new deployment ID) | N/A (no deployment step) | N/A |
| Custom domain? | **No** | No | **Yes** |
| Memorable URL? | No (opaque ID) | Partially (`<user>.github.io/<repo>`) | **Yes** |
| Breaks on repo rename? | N/A | **Yes** | No (custom domain) |
| Breaks on account suspension? | Yes (script deleted) | **Yes** (Pages disabled) | **Yes** (DNS still works but site is down) |
| Breaks on domain transfer? | **Yes** (ceases to function) | No | No |
| SLA / uptime guarantee? | No | No | No |
| Manual deployment step? | **Yes** (Deploy > New version) | No (git push) | No (git push) |

### Senior-engineer take

If URL stability is the primary concern, the best option is a **custom domain pointed at GitHub Pages** (or any CDN). This decouples the canonical URL from both the GitHub account/repo name and the Apps Script deployment ID. However, this benefit applies equally to the ADR-0015 approach (where the GitHub Pages URL is just the scanner page) and the Host Shell (where it's the app entry point). The URL stability argument does **not** uniquely justify the Host Shell — it's an orthogonal improvement you can make to the scanner page host regardless.

---

## Q6 — Is this over-engineering for a church management system?

### Direct answer

**Yes.** The Host Shell is over-engineering for a system serving one church with dozens of users, maintained by one developer, where the camera requirement is a single feature (QR check-in). The micro-frontend / Host Shell pattern exists to solve organizational scaling (multiple teams, independent deployment). EFCC has none of those problems. Adding a second deployment origin, a cross-origin iframe protocol, and a new single point of failure to solve one feature's UX (same-tab vs. separate-tab scanning) is a disproportionate response.

### Evidence (from EFCC's own architectural history)

**ADR-0007 (Vanilla Multi-Page HTML Service)** explicitly retired a React SPA and chose vanilla HtmlService for three reasons that are directly relevant:

1. **5 MB GAS project limit** — React + dependencies consumed too much of the ceiling. The Host Shell does not add to the GAS project size (it's on GitHub Pages), but it adds a *second* codebase to maintain.
2. **GAS-native team surface** — "Requiring Vite/React/TypeScript/JSX from the next maintainer (who may only know Apps Script) is an artificial barrier." The Host Shell introduces a *second* codebase (GitHub Pages static site) with its own deployment pipeline, postMessage protocol, and browser API surface. This compounds the maintainer-surface problem that ADR-0007 was trying to solve.
3. **Official docs are vanilla-first** — "Staying aligned with the documented path reduces undocumented edge cases." The Host Shell is **not** a documented path. Google's documented path is `window.open` to a separate window (ADR-0015). The Host Shell is the user's own invention on top of that.

**ADR-0001 (Google Sheets as Database)** already made an unconventional choice. ADR-0007 compounded it by choosing vanilla HtmlService over a framework. The system's sustainability depends on each layer being *simple and conventional enough* that a single maintainer can hold the whole thing in their head. Adding the Host Shell — a cross-origin iframe composition with a postMessage protocol — pushes the system past the threshold where one person can Reason about the full request lifecycle without a whiteboard.

### The scale argument

Micro-frontends (and iframe composition specifically) are justified when:
- Multiple teams need to work independently (EFCC: one developer).
- The app is large enough that a monolith creates coordination problems (EFCC: ~7 views, 2670 lines of shell JS).
- Independent deployment is a competitive advantage (EFCC: a church app with no SLA pressure).
- Different domains use incompatible frameworks (EFCC: everything is vanilla JS).

None of these apply. The Host Shell solves a problem EFCC does not have (multi-team scaling) while creating problems it does have (maintainer surface, deployment coordination, cross-origin debugging).

### Senior-engineer take

This is the clearest signal of over-engineering: the proposed architecture (micro-frontend iframe composition) was designed for organizations with dozens of engineers and millions of users. EFCC has one engineer and dozens of users. The ratio of infrastructure-to-feature complexity is already high (Sheets DB + Apps Script + clasp + E2E pipeline). Adding the Host Shell increases the infrastructure surface without increasing feature delivery. I would veto this in a team review and ask: "What is the simplest thing that gives the operator a good check-in experience?"

---

## Q7 — What do senior engineers actually recommend for Apps Script apps that need camera/browser APIs?

### Direct answer

**Google's own official documentation prescribes exactly one method: host the camera functionality on a separate HTTPS domain, open it in a new window/tab via `window.open`, and bridge with `postMessage`.** This is the ADR-0015 approach. There is no documented method that uses iframe composition (Host Shell). The Host Shell is the user's own extrapolation from the documented method — it uses the same primitives (`postMessage`, external HTTPS origin) but in a fundamentally different topology (iframe composition vs. popup window).

### Evidence

**Google's official Apps Script Troubleshooting page** (last updated 2026-06-10 UTC) both documents the restriction and prescribes the remedy:

> "This error occurs when an application using HTMLService attempts to execute Web APIs that require sensitive permissions, such as `navigator.mediaDevices.getUserMedia()` for camera or microphone access. The Apps Script sandboxed environment restricts these features to protect user security."
>
> "Host the functionality that requires these permissions on a separate domain (outside of Apps Script) and **open it in a new window or tab**. You can then post the captured data or responses back to your Apps Script application as shown in this example."
> — [Apps Script Troubleshooting - Permissions policy violation](https://developers.google.com/apps-script/guides/support/troubleshooting)

Google's reference implementation uses `window.open(externalUrl, 'cameraWindow', ...)` — a **popup window**, not an iframe composition. The Apps Script app remains the top-level document.

**The sandbox structurally supports the popup approach:**

> "The `IFRAME` sandbox mode is based on the iframe sandboxing feature in HTML5, using the following keywords: `allow-same-origin`, `allow-forms`, `allow-scripts`, `allow-popups`, `allow-downloads`, `allow-modals`, `allow-popups-to-escape-sandbox`, `allow-top-navigation-by-user-activation`"
> — [HTML Service: Restrictions](https://developers.google.com/apps-script/guides/html/restrictions)

`allow-popups` + `allow-popups-to-escape-sandbox` let the opened window run as a normal top-level browsing context. This is the mechanism Google designed for exactly this use case.

**Community practice (from prior research, 2026-08-01-f5-qr-scanner-best-method.md):** Every practitioner who solved the Apps Script camera problem moved the camera off-Apps-Script to a separate HTTPS origin (Netlify, GitHub Pages, external server). None of them built a Host Shell / iframe composition. They all use the popup or `doPost` bridge pattern.

### Senior-engineer take

The documented and community-validated method is `window.open` to a separate window. The Host Shell is **not** what Google recommends, not what the community does, and not what the sandbox was designed for. If you ask any Apps Script senior engineer "how do I get camera access?", they will tell you to use `window.open` + `postMessage` — which is what ADR-0015 already does. The Host Shell is a solution looking for a problem that the documented method already solves.

---

## Q8 — Alternative approaches for same-tab continuous scanning

### Direct answer

There is **no way to get `getUserMedia` working inside the Apps Script iframe** — this is a hard browser security constraint (Permissions-Policy), confirmed by Google's docs and a deployed probe (issue #87). The only ways to get camera access are to move the camera code to a top-level HTTPS context. The alternatives below differ in *how* you structure that top-level context.

### Alternatives assessed:

| # | Approach | Same-tab? | Continuous scan? | Complexity | Sustainability |
|---|---|---|---|---|---|
| **1** | **ADR-0015 current: `window.open` to scanner page** | No (separate tab) | Yes | **Low** | **High** (documented, community-validated) |
| **2** | **Host Shell (proposed)** | Yes | Yes | **High** | **Low** (undocumented, fragile coupling) |
| **3** | `doGet`/`doPost` as JSON API + standalone frontend | Yes | Yes | **Very High** (rewrite entire frontend) | Medium (but abandons `google.script.run`, auth, and all ADR-0007 decisions) |
| **4** | Cloudflare Workers proxy in front of Apps Script | No (doesn't solve iframe camera) | No | Medium | Low (doesn't address the root cause) |
| **5** | Full-screen popup (`window.open` with `noopener` tricks) | Partial (feels same-tab on desktop) | Yes | Low | High |
| **6** | Accept single-photo capture (Option B, already failed) | Yes | No | Low | Low (iOS `capture` limitation, failed in production) |

### Detail on the most viable alternatives:

**Alternative 1 (current ADR-0015): `window.open` to scanner page.** This is Google's documented method. The scanner opens in a new tab, runs `getUserMedia` + `html5-qrcode`, posts results back via `postMessage`, and shows inline ✓/✗ feedback. The operator stays on the scanner tab for the duration of check-in. The only UX cost is the initial tab switch. This is the simplest, most documented, most sustainable option. **The "cheap" feeling is a UX polish problem, not an architecture problem.**

**Alternative 3: `doGet`/`doPost` as JSON API + standalone frontend.** This would mean abandoning the Apps Script HTML Service entirely and building a standalone frontend (on any host) that calls Apps Script `doGet`/`doPost` endpoints as a JSON API. This solves the camera problem (the frontend is top-level) but:
- Abandons `google.script.run` (ADR-0003), which is the documented RPC mechanism.
- Abandons the session/auth model (ADR-0002, ADR-0011) which relies on `google.script.run` + PropertiesService.
- Requires reimplementing the entire frontend outside Apps Script — which is exactly what ADR-0007 retired (the React SPA).
- Introduces CORS, authentication, and API design complexity.
This is a full rewrite, not an incremental improvement. **Reject for now.**

**Alternative 5: Full-screen popup.** On desktop, `window.open` with specific window features (`width=screen.width, height=screen.height`) can create a near-fullscreen window that feels like same-tab. On mobile, this doesn't work well (mobile browsers open new tabs, not sized windows). But on mobile, the scanner tab *is* effectively full-screen anyway. The "cheap" feeling on mobile comes from the tab switch, not from window size. **Marginal improvement over ADR-0015; not worth the complexity.**

### The honest truth about "same-tab":

There is **no way** to get same-tab continuous scanning with the Apps Script app as the top-level document. The camera must run in a top-level HTTPS context, and the Apps Script app *is* the top-level document. The only way to make the scanner "same-tab" is to make something *else* the top-level document (the Host Shell) and demote the Apps Script app to an iframe. That is the trade-off the Host Shell makes, and the cost is the entire architecture described in Q1-Q4.

### Senior-engineer take

The ADR-0015 approach is the right answer. The "cheap" feeling is addressable through UX polish on the scanner page (branded styling, clear event context, auto-focus, smooth result transitions, haptic feedback) — not through architectural inversion. I would invest in making the scanner page feel like a polished, purpose-built check-in tool rather than building a Host Shell to avoid a tab switch.

---

## Recommendation

### Do not build the Host Shell. Keep and polish the ADR-0015 approach.

The Host Shell is technically viable but architecturally unjustified for EFCC. It inverts Google's documented remedy, introduces cross-origin iframe coupling with no build-time contract, adds a second deployment pipeline and a new single point of failure (GitHub Pages as app entry point), and solves a problem (same-tab scanning) that is better addressed through UX polish on the existing scanner page. The system's sustainability — already stretched by Sheets-as-DB + Apps Script + vanilla HtmlService — would be compromised by adding a micro-frontend composition layer that no senior engineer would recommend for a single-team, single-church application.

### Why the ADR-0015 approach is the right call:

1. **It is Google's only documented method.** The troubleshooting page prescribes `window.open` + `postMessage` — not iframe composition.
2. **It is community-validated.** Every practitioner who solved the Apps Script camera problem uses this pattern.
3. **It preserves ADR-0007's sustainability principles.** One codebase, one deployment pipeline, vanilla JS, documented path.
4. **The scanner page already shows inline results.** The operator stays on the scanner tab for the duration of check-in. The tab switch is a one-time cost at the start of a check-in session.
5. **URL stability is an orthogonal concern.** If you want a stable, memorable URL, point a custom domain at the Apps Script app's deployment — or at the scanner page. This does not require the Host Shell.

### What to do instead (recommended actions):

1. **Keep ADR-0015 as-is.** The `window.open` + external scanner page + `postMessage` bridge is the documented, validated method.
2. **Polish the scanner page UX** to address the "cheap" feeling:
   - Brand it with EFCC styling (colors, logo, typography).
   - Show the active Event name prominently.
   - Auto-focus the camera on load.
   - Use smooth result transitions (✓ slides in green, ✗ slides in red, auto-return to scanning).
   - Add haptic feedback on scan (where supported).
   - Make the scanner page feel like a purpose-built check-in tool, not a generic web page.
3. **Use a custom domain for the scanner page** if URL stability matters (e.g., `scanner.efcc.org` pointed at GitHub Pages or Cloudflare Pages). This is a 30-minute DNS task, not an architecture change.
4. **Do NOT plan for multi-Apps-Script-project composition.** The "multiple Apps Script projects as iframes" vision is a micro-frontend architecture that solves multi-team scaling. EFCC has one team. If the app grows to need domain separation, revisit this then — with the evidence that the scale actually demands it.

### If you proceed with the Host Shell anyway (not recommended), these safeguards are mandatory:

If the user decides to build the Host Shell despite this assessment, the following are minimum viability requirements:

1. **Protocol versioning:** Every `postMessage` payload includes a `version` field. Both sides reject messages with incompatible versions with an explicit error message (not silent drop).
2. **Handshake protocol:** Host sends `{type: "EFCC_HANDSHAKE", version}` on iframe load; iframe responds with `{type: "EFCC_HANDSHAKE_ACK", version}`. Host does not send commands until ACK is received. Timeout after 5s -> show error.
3. **Heartbeat / liveness:** Iframe sends a heartbeat every 10s. If Host doesn't receive one for 30s, it assumes the iframe is dead and shows a recovery UI.
4. **Origin allowlist with exact string match:** Both sides verify `event.origin` against a single-entry allowlist. Never `*`.
5. **URL configuration externalized:** The `/exec` URL is stored in a config file (not hardcoded in the Host Shell JS), with a documented rotation runbook.
6. **Contract tests:** A CI test that sends each message type from a mock Host and verifies the iframe's response, and vice versa. This catches protocol drift before deployment.
7. **Custom domain on the Host:** Use a custom domain (not `*.github.io`) for origin isolation and URL stability.
8. **Monitoring:** A health check that loads the Host Shell and verifies the iframe loads successfully, with alerting on failure.
9. **Rollback plan:** If the Host Shell breaks, the ADR-0015 `window.open` approach must be immediately restorable as a fallback. Keep the scanner page's standalone `window.open` entry point functional.
10. **Document the protocol:** An ADR specifying every message type, payload shape, and lifecycle state, maintained as the source of truth.

These safeguards represent 3-5x the engineering effort of the ADR-0015 approach, for a feature (same-tab scanning) whose benefit is eliminating one tab switch per check-in session.

---

## Evidence index

| Claim | Primary source | URL |
|---|---|---|
| HtmlService camera restriction (Permissions policy violation) | Apps Script Troubleshooting | https://developers.google.com/apps-script/guides/support/troubleshooting |
| Official remedy: external domain + `window.open` + `postMessage` | Apps Script Troubleshooting | https://developers.google.com/apps-script/guides/support/troubleshooting |
| IFRAME sandbox keywords (`allow-popups`, `allow-popups-to-escape-sandbox`, no camera) | HTML Service: Restrictions | https://developers.google.com/apps-script/guides/html/restrictions |
| Web app `/exec` (production) vs `/dev` (testing) URL behavior | Apps Script Web Apps | https://developers.google.com/apps-script/guides/web |
| Web app ceases to function on domain transfer | Apps Script Web Apps | https://developers.google.com/apps-script/guides/web |
| Iframe composition: "less flexible," "routing/history/deep-linking more complicated," "extra challenges for responsiveness" | Cam Jackson, "Micro Frontends" (martinfowler.com) | https://martinfowler.com/articles/micro-frontends.html |
| JS integration is "the one that we see teams adopting most frequently" (not iframe) | Cam Jackson, "Micro Frontends" (martinfowler.com) | https://martinfowler.com/articles/micro-frontends.html |
| Micro-frontends: Trial (2018) -> Adopt (2020) -> now off-radar (mainstream) | ThoughtWorks Technology Radar | https://www.thoughtworks.com/radar/techniques/micro-frontends |
| `postMessage` is Baseline (July 2015); always verify `origin`; never use `*` | MDN: Window.postMessage | https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage |
| Cross-origin iframes cannot access DOM; `postMessage` is the only cross-origin channel | MDN: `<iframe>` - Scripting | https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe |
| Every iframe requires "increased memory and other computing resources" | MDN: `<iframe>` | https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe |
| Same-origin policy: scripts cannot access cross-origin window properties | MDN: Same-origin policy | https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy |
| `getUserMedia` requires secure context (HTTPS); only top-level can request unless iframe gets Permissions-Policy delegation | MDN: MediaDevices.getUserMedia | https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia |
| GitHub Pages is a static site hosting service | GitHub Docs: About GitHub Pages | https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages |
| GitHub Pages usage limits (soft: ~100 GB/month bandwidth, ~10 builds/hour) | GitHub Docs: About GitHub Pages > Usage limits | https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#usage-limits |
| GitHub Pages custom domain + HTTPS support | GitHub Docs: Managing a custom domain | https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site |
| React SPA retired in favor of vanilla HtmlService (sustainability rationale) | ADR-0007 | docs/adr/0007-vanilla-multipage-html-service.md |
| Current scanner architecture (window.open + postMessage) | ADR-0015 | docs/adr/0015-external-camera-origin-for-qr-scanner.md |
| Scanner best-method research (community practice, official method) | Research note 2026-08-01 | docs/research/2026-08-01-f5-qr-scanner-best-method.md |
| Scanner hosting/origin guidance | Research note 2026-07-31 | docs/research/2026-07-31-external-scanner-origin-approach.md |

---

## What this assessment did not do

- Did not implement any code or modify any files (read-only research).
- Did not mutate Google Sheets or deploy anything.
- Did not re-prove the `getUserMedia`-blocked finding (cross-references #87, ADR-0015, and prior research).
- Did not evaluate the scanner page's existing implementation (`prototype/scanner/`) for code quality — only its architectural role.
- Did not commit (left to repo owner).
