# Cloudflare Frontend + Apps Script Backend + Google Sheets DB: Free-Tier Viability & Sustainability

**Date:** 2026-08-01
**Author:** ResearchCloudflareMigration (research agent)
**Scope:** Stress-test the proposed migration of the EFCC web app's FRONTEND to a
modern framework hosted on Cloudflare, while KEEPING Google Apps Script + Google
Sheets as the backend/database. Constraints: free-tier-only ($0/mo preferred),
Sheets stays as the DB (hard), ~250 active members / ~250 weekly check-in users,
2-person volunteer team with turnover risk, growth path toward giving/payments,
member portal, events, and communication (email/SMS).
**Sources:** primary only — `developers.cloudflare.com`, `cloudflare.com/pricing`,
`developers.google.com/apps-script/*`, `developers.google.com/sheets/api/*`,
`stripe.com/pricing`, plus this repo's ADRs/plans for grounding. No blogs, no
Medium, no Stack Overflow treated as authority.
**Status:** READY where primary sources confirm; explicit `[UNVERIFIED]` markers
where Google does not document a behavior and the conclusion is inferred.

---

## TL;DR verdict

1. **On cost, the combo is excellent and stays $0/month for *hosting* across the
   entire realistic growth curve** (attendance → giving → member portal → events).
   Cloudflare Pages serves a static SPA with **unlimited free static-asset
   requests and no egress charges** (`developers.cloudflare.com/workers/platform/pricing`).
   At ~250 weekly check-ins the backend load is trivial against Apps Script's
   **30 simultaneous executions/user** and **1,000/script** limits
   (`developers.google.com/apps-script/guides/services/quotas`). The first thing
   that forces *any* spend is **communications** (email daily quota or paid SMS),
   not hosting — and that cost is per-message or a small Workspace subscription,
   not a re-architecture.

2. **The migration is NOT a no-op: it is gated by a CORS problem that Apps Script
   cannot solve natively.** Apps Script's `TextOutput` API exposes **no method to
   set HTTP response headers** (only `setContent`/`setMimeType`/`append`/`downloadAsFile`
   — `developers.google.com/apps-script/reference/content/text-output`), so a
   `/exec` endpoint **cannot emit `Access-Control-Allow-Origin`**. A browser
   `fetch()` from a Cloudflare origin to `/exec` is cross-origin and the browser
   will block JS from reading the response. A **same-origin proxy** (Cloudflare
   Worker or Pages Function) is therefore mandatory — still free (100,000
   requests/day), but it is a new moving part.

3. **`google.script.run` dies when the frontend leaves the Apps Script iframe.**
   It is the HtmlService-injected client-side RPC and does not exist on an
   external page (`developers.google.com/apps-script/guides/html/reference/run`).
   Every RPC must be re-wired to HTTP `fetch()` → proxy → `/exec`, and PIN/session
   auth (ADR-0002 / ADR-0011) must travel over HTTP instead of RPC parameters.
   EFCC has *precedent* for exactly this external-origin pattern (the GitHub
   Pages scanner bridges via `postMessage` because `getUserMedia` is blocked in
   the iframe — CONTEXT.md), but the full app has never made cross-origin calls
   to the backend.

4. **The biggest risk is sustainability, not cost.** ADR-0007 *retired* a React
   frontend specifically because the toolchain was "foreign to the Apps Script
   ecosystem" and the 5 MB project ceiling was real. Moving to Cloudflare
   *removes* the 5 MB ceiling but *re-adds* the framework toolchain **plus** a
   CORS proxy **plus** a second deploy system — more surface for a 2-volunteer
   team. Compounding this: **versioned deployments cannot transfer ownership**
   and **deleting the owner's account can cause script errors**
   (`developers.google.com/apps-script/concepts/deployments`) — a real failure
   mode given turnover.

5. **Verdict: proceed only with guardrails.** The combo is genuinely sustainable
   on free tier *for hosting* and scales well past 250 users. But it is a net
   *increase* in operational complexity over the current HtmlService app. Adopt
   it only if the team values modern-framework DX enough to absorb the CORS
   proxy + dual-deploy burden, AND commits to (a) a shared/Workspace-owned Apps
   Script project to survive owner turnover, (b) `webapp.access = ANYONE_ANONYMOUS`,
   and (c) thorough proxy documentation. If maintenance burden is the top worry
   (it is, per the brief), the lowest-risk free option is to **not migrate** and
   keep hardening the HtmlService app — at the cost of the 5 MB ceiling and
   framework DX.

---

## 1. Cloudflare free-tier for static/frontend hosting

### What is free, and the hard limits

Cloudflare's developer-platform free tier is unusually generous for a **static**
frontend. The decisive facts, all from `developers.cloudflare.com`:

- **Static-asset requests are free and unlimited.** "Requests to static assets
  are free and unlimited." (`developers.cloudflare.com/workers/platform/pricing`,
  Workers → footnotes.) A statically-exported SPA (Next.js `output: 'export'`,
  SvelteKit static adapter, Astro, Remix SPA) served from Cloudflare Pages
  therefore has **no request cap and no bandwidth/egress charge** on the free
  plan. "There are no additional charges for data transfer (egress) or
  throughput (bandwidth)." (same page.)
- **Cloudflare Pages free plan limits** (`developers.cloudflare.com/pages/platform/limits`):
  - Builds: **1 build at a time, 500 builds/month**, 20-minute build timeout.
  - Projects: 100 per account.
  - Users: unlimited collaborators via the dashboard.
- **Cloudflare Workers free plan limits** (`developers.cloudflare.com/workers/platform/limits`,
  "Account plan limits"):
  - Requests: **100,000/day** (account-wide).
  - CPU time: **10 ms per invocation**.
  - Memory: 128 MB/isolate; subrequests: 50/request; simultaneous outgoing
    connections: 6/request; Worker size: 3 MB; 100 Workers; 5 Cron Triggers.
- **When you start paying:** the Workers **Paid** plan is a **$5/month minimum**
  that includes 10M requests/month + 30M CPU-ms/month, then $0.30/million
  requests and $0.02/million CPU-ms (`developers.cloudflare.com/workers/platform/pricing`).
  Critically, **Pages Functions are billed as Workers** ("All Pages Functions
  are billed as Workers" — same page), so any server-side logic (e.g. a CORS
  proxy) consumes the 100,000/day free allotment, not the unlimited static pool.

### Static vs server-rendered fit

EFCC's frontend can be **fully static**: auth is PIN-based (no server sessions),
all data comes from the Apps Script `/exec` API, and the only "server" the
frontend needs is a thin CORS proxy. A static export is the right target — it
keeps 100% of member traffic in the free, unlimited static-asset bucket. The
*CORS proxy* is the only piece that runs as a Worker/Pages Function and counts
against the 100,000/day free limit. A server-rendered framework (SSR/edge
rendering) would push *all* traffic into the billable Worker path and is the
wrong choice for this constraint set.

### Will 250 weekly users hit limits?

No. 250 weekly check-ins, even at ~10 RPCs each = ~2,500 requests/week ≈
~360/day — **0.36% of the 100,000/day Worker ceiling**, and the static-asset
requests are unlimited. Even a 10× spike (a Sunday burst of 2,500 same-day
check-ins) is ~2.5% of the daily Worker budget. The free tier has enormous
headroom for attendance, and for the growth features (portal, events) which are
read-heavy and low-frequency.

**Citation:** `developers.cloudflare.com/pages/platform/limits`;
`developers.cloudflare.com/workers/platform/limits`;
`developers.cloudflare.com/workers/platform/pricing`;
`cloudflare.com/plans/developer-platform`.

---

## 2. Apps Script as a backend API for an EXTERNAL frontend

### Deployment model: `/exec`, execute-as-me, access level

Apps Script web apps are reached at a `/exec` (production) or `/dev` (testing)
URL. `doGet(e)`/`doPost(e)` receive query/path/postData; `e.pathInfo` carries
the path after `/exec` (`developers.google.com/apps-script/guides/web`,
"Request parameters"). The two deployment axes that govern an external frontend
(`developers.google.com/apps-script/manifest/web-app-api-executable`):

- **`executeAs`**: `USER_DEPLOYING` ("execute as me" — script always runs as the
  owner) vs `USER_ACCESSING` (runs as the visiting user, triggers OAuth
  consent). EFCC uses `USER_DEPLOYING` (CONTEXT.md manifest summary), which is
  correct for a PIN-auth API — the backend acts as a single trusted service
  account.
- **`access`** (this is the one that quietly determines whether `fetch()` works
  at all):
  - `MYSELF` — only the deployer.
  - `DOMAIN` — only same-domain users.
  - `ANYONE` — **"Any logged-in user"** (requires a Google sign-in).
  - `ANYONE_ANONYMOUS` — **"Any user, even if not logged in"** (no Google sign-in).

> **Discrepancy to verify:** CONTEXT.md summarises the manifest as
> `webapp.access = ANYONE`. But ADR-0002 explicitly rejects Google OAuth and
> members log in by **username + 4-digit PIN**, not Google — which is only
> possible if the deployed access is `ANYONE_ANONYMOUS`. For an **external
> Cloudflare frontend**, the deployment **must** be `ANYONE_ANONYMOUS`: with
> `ANYONE`, a cross-origin `fetch()` to `/exec` receives a **Google OAuth login
> redirect** instead of JSON. **Action: confirm the live deployment is
> `ANYONE_ANONYMOUS` before building the proxy.** (Source of the values:
> `developers.google.com/apps-script/manifest/web-app-api-executable`.)

### Execution limits and quotas (the real backend ceiling)

All quotas are **per user** and "reset 24 hours after the first request"
(`developers.google.com/apps-script/guides/services/quotas`). Because EFCC runs
"execute as me", **every member's request consumes the single owner account's
quota** — the 250 users' traffic is funnelled through one account. Verified
figures:

| Feature | Consumer (gmail.com) | Google Workspace |
|---|---|---|
| Script runtime | 6 min / execution | 6 min / execution |
| Simultaneous executions per user | 30 / user | 30 / user |
| Simultaneous executions per script | 1,000 | 1,000 |
| Triggers total runtime | **90 min / day** | **6 hr / day** |
| URL Fetch calls | **20,000 / day** | **100,000 / day** |
| Email recipients (MailApp) | **100 / day** | **1,500 / day** |
| Documents created | 250 / day | 1,500 / day |

(Source: `developers.google.com/apps-script/guides/services/quotas`, table rows
"Script runtime", "Simultaneous executions per user/script", "Triggers total
runtime", "URL Fetch calls", "Email recipients per day", extracted verbatim.)

Reaching a quota throws exceptions like `Service invoked too many times`,
`Service using too much computer time for one day`, or `Script invoked too many
times per second for this Google user account` (same page, "Exception
messages").

**At attendance scale these are nowhere near binding.** 250 weekly check-ins ≈
a few hundred executions/day, each sub-second — the 30-simultaneous and
6-min-execution limits are untouched. The quotas that *will* bind later are
**email (comms)** and **triggers (scheduled jobs)** — see §5.

### Can a Cloudflare page `fetch()` an Apps Script `/exec` URL? — The CORS reality

This is the single most important technical question, and the answer is **not
directly — a proxy is required.** The chain of verified primary-source facts:

1. **`/exec` serves content from a different origin than the script URL.** The
   official Apps Script content guide states the response is served such that
   "the browser URL will differ from the script URL for security"
   (`developers.google.com/apps-script/guides/content`, retrieved via Context7).
   (This is the well-known redirect of `/exec` → `script.googleusercontent.com`.)
2. **Apps Script provides no API to set CORS response headers.** The complete
   `TextOutput` method set is `append`, `clear`, `downloadAsFile`, `getContent`,
   `getFileName`, `getMimeType`, `setContent`, `setMimeType`
   (`developers.google.com/apps-script/reference/content/text-output`). There is
   **no** `setHeader` / `Access-Control-Allow-Origin` capability. `HtmlOutput`
   likewise cannot set arbitrary response headers.
3. **Therefore** a browser `fetch()` from a Cloudflare Pages origin to the Apps
   Script `/exec` origin is a cross-origin request whose response carries no
   `Access-Control-Allow-Origin` header, so the browser **blocks JavaScript from
   reading it** (per the CORS specification). Google does not publish an
   explicit "CORS is blocked" statement for `/exec`, so the *exact* runtime
   behaviour across browsers/redirect-steps is `[UNVERIFIED]` as a stated Google
   claim — but it follows necessarily from facts (1) and (2), and robust designs
   must not rely on incidental cross-origin readability.

**Workarounds (all free-tier-compatible):**

- **Recommended: a same-origin Cloudflare Worker / Pages Function proxy.** The
  SPA calls `fetch('/api/...')` on its own Cloudflare origin; the Worker adds
  `Access-Control-Allow-Origin` and performs a server-side `fetch()` to the Apps
  Script `/exec` URL (server-side fetch is not subject to CORS). This consumes
  the 100,000/day free Worker quota — ample at EFCC scale. This is the standard,
  robust pattern and the one this report assumes.
- **Partial: JSONP for reads.** Because `<script>` tags are not subject to CORS,
  a `doGet` can return `callback({...})` and the frontend loads it via a script
  tag. This works for **GET only** and is legacy/fragile; it does not cover
  POST writes (check-ins). Not recommended as the primary mechanism.
- **Do not use `mode: 'no-cors'`** — it yields an opaque response the SPA cannot
  read.

**Citation:** `developers.google.com/apps-script/guides/web`;
`developers.google.com/apps-script/manifest/web-app-api-executable`;
`developers.google.com/apps-script/reference/content/text-output`;
`developers.google.com/apps-script/guides/content` (Context7);
`developers.google.com/apps-script/guides/services/quotas`.

---

## 3. The `google.script.run` problem

### Confirmation from primary sources

`google.script.run` is the **client-side** RPC injected by HtmlService into the
served HTML document (`developers.google.com/apps-script/guides/html/reference/run`,
listed under the HTML reference as "google.script.run (client-side)"). It exists
only inside an Apps Script HtmlService IFRAME — it is not a network API and is
not present on an arbitrary external page. This repo's own prior research
(2026-07-28-gas-multipage-best-practice.md) corroborates that the HtmlService
client APIs (`google.script.history`, `google.script.url`, `google.script.run`)
are scoped to the `IFRAME`-mode web app.

EFCC's entire client/server contract is built on it: `google.script.run`
callbacks with a `{success, requestId, data}` / `{success, requestId, error}`
envelope, every call registering both a success and failure handler
(CONTEXT.md "Client/server contracts"; ADR-0003). ADR-0003's rationale
explicitly chose `google.script.run` because it meant "no REST endpoints, no
CORS configuration" — moving the frontend off Apps Script **removes that
advantage** and re-introduces exactly the REST + CORS work ADR-0003 rejected.

### Implications of replacing it with HTTP `fetch()`

1. **Every `api_*` server function must be exposed over HTTP.** Today they are
   called via `google.script.run.api_loginUser(...)`. Post-migration they must
   be reachable as `POST /exec?action=loginUser` (or via `e.pathInfo`) returning
   `TextOutput` JSON. The existing `api_*` functions and the RPC envelope can be
   reused — the change is at the **entry point**: `doGet`/`doPost` must branch
   on action/path and return `ContentService.createTextOutput(JSON.stringify(...))`
   instead of `HtmlService` output. This is a bounded but real backend rewrite
   of the dispatch layer.
2. **Auth moves from RPC params to HTTP.** The current `AuthenticatedBootstrap`
   DTO and the HMAC session token (ADR-0011: `PropertiesService` +
   `Utilities.computeHmacSha256Signature`) are already a bearer-style token, so
   they translate cleanly: the token travels in an HTTP header/body and each
   protected endpoint re-validates it server-side (which ADR-0011 already
   requires). The one-active-session model (ADR-0011) is unaffected.
3. **Error semantics change.** `google.script.run`'s binary
   success/failure-handler model is replaced by HTTP status + the existing
   `RPC_CODES` envelope in the body. Business errors (`AUTH_REQUIRED`,
   `FORBIDDEN`, `VALIDATION`, …) that today travel through the *success* path
   (ADR-0003 amendment) should now map to HTTP statuses, while the envelope
   `code` is preserved for the client.
4. **The 5 KB `google.script.run` parameter limit disappears** (ADR-0003
   constraint) — HTTP bodies are far larger — a minor upside.

**Net:** the backend logic is portable; the **dispatch, auth-transport, and
error-mapping layers must be rebuilt for HTTP**, and a CORS proxy is mandatory
(§2). This is the largest single chunk of migration work.

**Citation:** `developers.google.com/apps-script/guides/html/reference/run`;
ADR-0003; ADR-0011; CONTEXT.md "Client/server contracts".

---

## 4. Google Sheets as DB under an external frontend

### Which quota governs EFCC

EFCC reads/writes Sheets through Apps Script's **`SpreadsheetApp`** service, not
the Google Sheets REST API. Therefore the binding limits are the **Apps Script
execution limits** (§2), not the Sheets REST API quotas. Note the distinction:

- The **Sheets REST API** limits are 300 read + 300 write requests/min/project
  and 60/min/user, a 180-second per-request timeout, and "no limit to the number
  of requests that you can make per day" provided per-minute quotas hold; all
  updates are atomic (`developers.google.com/sheets/api/limits`). These apply
  only if EFCC called Sheets directly over REST — it does not.
- The **Apps Script quota table** does **not** list a separate per-day
  cell-read/cell-write quota for `SpreadsheetApp`; the governing ceilings are
  the 6-min execution, 30-simultaneous/user, and 1,000/script limits
  (`developers.google.com/apps-script/guides/services/quotas`).

### Write contention and the EFCC mitigation

ADR-0001 already flags that "`SpreadsheetApp` is synchronous and not designed
for concurrent writes." EFCC mitigates this server-side with
`LockService.getScriptLock()` serialization for atomic check-ins and audit-log
writes (ADR-0009; migration plan "Global Constraints"). **Crucially, moving the
frontend to Cloudflare does not change the backend concurrency model at all** —
the same `LockService` guards run regardless of whether the request arrived via
`google.script.run` or via HTTP. So Sheets write contention is **no worse** post-
migration; the external frontend is just a different transport to the identical
serialized backend.

### What breaks first at 250 weekly check-ins?

**Nothing on the Sheets/Apps-Script side.** Quantitatively:

- 250 check-ins over a 2-hour Sunday window ≈ ~2/min, each a single serialized
  write. Even compressed into 15 minutes (~17/min) this is far below the 30
  simultaneous executions/user ceiling.
- Each check-in RPC is sub-second, nowhere near the 6-min execution cap.
- Annual attendance volume (~13,000 rows/year) is trivial against Sheets' 10M-
  cell ceiling (ADR-0001).

**Order of failure under growth:** Cloudflare limits (essentially unlimited for
static; 100k/day Worker) → Apps Script **30-simultaneous-executions/user** and
**6-min-execution** (only threatened by a future long-running RPC under burst
load) → Apps Script **daily quotas** (email/URL-Fetch, not Sheets) → Sheets
write contention (already serialized, low risk). **Sheets is not the first
thing to break; Apps Script compute quotas and email quota are.**

**Citation:** `developers.google.com/sheets/api/limits`;
`developers.google.com/apps-script/guides/services/quotas`;
ADR-0001; ADR-0009; CONTEXT.md.

---

## 5. Cost model & the growth curve

The realistic trajectory, with what is free, what tips over, and the first
forced cost at each stage. "Hosting" = Cloudflare + Apps Script + Sheets.

| Stage | Hosting free? | What breaks first | Est. monthly cost |
|---|---|---|---|
| **Attendance-only (now, ~250 weekly)** | Yes | Nothing. CF static unlimited; Worker proxy ~360/day « 100k/day; Apps Script 30-simul & 6-min untouched; Sheets writes serialized. | **$0** |
| **+ Giving / payments** | Yes | Nothing in hosting. Use a hosted processor page (e.g. Stripe Checkout redirect) so **card data never touches Apps Script** (PCI stays with the processor). Stripe charges **per transaction, no monthly fee** (e.g. ~2.9% + $0.30 US; locale-dependent — the live pricing page rendered ~3.6%/txn in this session's locale). The fee is borne by each donation, not a hosting line. Webhook signature verification uses `UrlFetchApp` + `Utilities.computeHmacSha256Signature` (available; counts against 20k/100k URL-Fetch quota — negligible). | **$0 hosting** + per-txn processor fee |
| **+ Member portal / profiles** | Yes | Nothing. More reads, low frequency, trivial volume. | **$0** |
| **+ Events / registration** | Yes | Nothing. More writes, still trivial; `LockService` serializes. | **$0** |
| **+ Communication (email / SMS)** | **Partially** | **First forced cost.** Email via `MailApp`: **100/day (consumer) / 1,500/day (Workspace)** — a 250-member weekly newsletter fits Workspace easily but strains/overflows a consumer account. SMS is inherently paid (a provider like Twilio charges per message; Apps Script sends via `UrlFetchApp`). | Email: $0 on Workspace or if batched; SMS: per-message. Or a small Workspace sub (~$6–12/account/mo). |

### The first thing that forces them off free tier

**Communications** — specifically the **email daily quota on a consumer
(gmail.com) owner account (100/day)** and **SMS, which is paid per message by
nature**. Hosting (Cloudflare + Apps Script + Sheets) **stays $0/month across
the entire curve** and well beyond 250 users; the first spend is a per-message
communications cost or a small Workspace subscription to lift the email ceiling.
Nothing in the *hosting* stack forces a paid tier at this scale.

### Does payments/giving break the "free + Apps Script" model?

**No — but it requires discipline.** Apps Script must never receive, store, or
log raw card numbers (PCI scope). The correct pattern is a **redirect to the
processor's hosted checkout** (Stripe Checkout / payment link), where the
processor handles PCI; Apps Script only records the *result* (via webhook or
return URL) and writes an order row to Sheets. This keeps the backend free and
non-PCI. The cost is the processor's per-transaction fee, not a hosting cost.

**Citation:** `stripe.com/pricing` (per-transaction, no monthly fee; rate is
locale-dependent);
`developers.google.com/apps-script/guides/services/quotas` (email/URL-Fetch).

---

## 6. Sustainability for a 2-person volunteer team

### Lock-in

- **Cloudflare:** low lock-in for a static SPA (it's portable static files), but
  the **CORS proxy** (Worker/Pages Function) and any Cloudflare-specific config
  (wrangler, bindings) create mild platform coupling. Migrating the proxy to
  another edge host (Vercel/Netlify/Deno) is feasible but is another thing to
  document.
- **Google (Apps Script + Sheets):** high lock-in. The entire data model, auth,
  and business logic are Apps Script + Sheets-specific. This is pre-existing
  (ADR-0001) and the migration does not change it.

### Handoff difficulty — the ADR-0007 tension

This is the core sustainability concern. **ADR-0007 *retired* a React frontend**
for two reasons that apply *even more* to a Cloudflare-hosted SPA:

> "Requiring Vite/React/TypeScript/JSX from the next maintainer (who may only
> know Apps Script) is an artificial barrier…" and "the 5 MB GAS project limit"
> (ADR-0007).

Moving to Cloudflare **removes the 5 MB ceiling** (the bundle is no longer
pushed via `clasp`) but **re-introduces the Vite/React/TypeScript toolchain**
and **adds** a CORS proxy, a Worker/Pages Function, and a second deploy system
(Cloudflare) on top of Apps Script + Sheets. A successor volunteer must now
understand: the SPA framework build, the Cloudflare deploy, the CORS proxy
behaviour (undocumented by Google), the Apps Script `/exec` HTTP dispatch, the
HMAC session model, *and* the Sheets schema. That is a **wider** knowledge
surface than the current vanilla HtmlService app — directly counter to ADR-0007's
"vanilla-first, GAS-native team surface" rationale.

### What happens when the Apps Script owner account leaves? (verified, primary)

Two official statements make this the single most consequential sustainability
risk:

1. **"You cannot transfer ownership of versioned deployments. If you transfer
   ownership of a script project, the owner of the existing versioned deployments
   doesn't change. If an administrator deletes the deployment owner's account,
   their deployments might experience script errors."**
   (`developers.google.com/apps-script/concepts/deployments`, "Versioned
   deployments".)
2. **"A common problem in collaboration occurs when a script project owner
   leaves the team without transferring ownership of the project to someone else
   on the team. This can leave you unable to maintain or update the project…
   Always share ownership of script projects. If someone leaves your
   organization and their account is removed, access to scripts without other
   owners is lost."**
   (`developers.google.com/apps-script/guides/collaborating`, "Collaboration
   basics".)

**Mitigation (official):** place the script in a **shared drive**, where "files
in a shared drive don't have specific owners" — but **shared drives are only
available to Google Workspace Business/Enterprise customers**
(`developers.google.com/apps-script/guides/collaborating`, "Collaborate with
shared drives"). A free consumer account cannot use shared drives, so a
consumer-account EFCC deployment has **no clean ownership-transfer path**: if
the owner leaves, the `/exec` URL eventually breaks, the Cloudflare proxy
endpoint must be repointed, and member bookmarks/deep links break.

**Note:** code *updates* do keep the same `/exec` URL — "create a new version
and edit the deployment to use it… without changing its URL or deployment ID"
(`developers.google.com/apps-script/concepts/deployments`, "Edit a versioned
deployment"). So day-to-day deploys are stable; it is only **owner-account
loss** that is catastrophic.

### 3–5 year viability per piece

- **Cloudflare free tier:** very likely stable; Cloudflare's free static hosting
  is a long-standing product. Risk: the Pages/Workers product merger could
  shift limits, but static-asset-free is a durable commitment.
- **Apps Script:** mature and stable, but Google's quota table warns limits
  "are subject to change at any time without notice." The 6-min ceiling and
  per-account quotas are longstanding. Viability: high for 3–5 years at this
  scale.
- **Google Sheets as DB:** viable at this volume for years (10M-cell ceiling,
  ~13k attendance rows/year). The longer-term risk is concurrent-write
  latency as tabs grow, mitigated by range-limited reads (ADR-0001).
- **The CORS proxy + dual-deploy surface:** the **least durable** piece — it
  depends on Apps Script's *undocumented* cross-origin behaviour staying
  workaround-able, and on the volunteer team retaining both skill sets.

**Citation:** `developers.google.com/apps-script/concepts/deployments`;
`developers.google.com/apps-script/guides/collaborating`; ADR-0007; ADR-0001.

---

## 7. Honest verdict

Given **free-tier-only + Sheets-stays + 2 volunteers**, does the
Cloudflare-frontend + Apps Script-backend combo hold up, and for how long?

- **On cost: yes, indefinitely at this scale.** Hosting is $0/month across the
  entire growth curve; the only future spend is communications (email quota /
  paid SMS) or a small Workspace subscription — neither forces re-architecture.
  Cloudflare's free static hosting + the 100k/day Worker proxy is more than
  enough for 250 users and 10× growth. This is the combo's genuine strength.
- **On sustainability: it is weaker than the status quo.** The migration trades
  the 5 MB ceiling (real, ADR-0007) for a CORS proxy, an HTTP dispatch rewrite,
  a second deploy system, and a framework toolchain — exactly the burdens
  ADR-0007 retired. For a 2-person volunteer team with turnover risk, that is a
  net increase in operational surface.

**Single biggest risk:** the combination of (a) the **mandatory CORS proxy**
depending on Apps Script's *undocumented* cross-origin behaviour, and (b)
**versioned-deployment ownership non-transferability** — both landing on a team
where one departure can break the `/exec` endpoint and orphan the proxy config.
These two together are the most likely way the app goes dark.

**What would make me recommend AGAINST it:** if the Apps Script owner account is
a **free consumer (gmail.com) account with no path to a shared drive**, the
ownership-transfer failure mode is unsolvable and turnover is likely — in that
case the migration *adds* fragility (proxy + dual deploy) on top of an already
un-transferable backend, and I would recommend **not migrating** the frontend
and instead investing in documentation + a shared/deployer Google account first.

**If a genuinely better free-tier combo exists for these constraints:** the
lowest-complexity free option is to **keep the frontend inside Apps Script
HtmlService** (the current ADR-0007 architecture) and accept the 5 MB ceiling +
vanilla DX — it eliminates the CORS proxy, the `google.script.run`→HTTP rewrite,
and the second deploy system entirely. The Cloudflare migration is justified
*only* by the desire for a modern framework and the removal of the 5 MB cap.
Given the user has chosen this combo, the recommendation is to **proceed with
guardrails**: (1) move the Apps Script project to a Workspace shared drive or a
dedicated shared deployer account so ownership survives turnover; (2) confirm
`webapp.access = ANYONE_ANONYMOUS`; (3) document the CORS proxy as a
first-class, tested component (it is now a single point of failure); (4) keep
the SPA a **static export** so all member traffic stays in Cloudflare's
unlimited free static pool and only API calls hit the 100k/day Worker budget.

**Citation (synthesis):** all sources listed below; verdict logic grounded in
ADR-0007 (toolchain-burden rationale), ADR-0001 (Sheets-as-DB constraints), and
the verified deployment-ownership and quota facts.

---

## Risks (ranked by likelihood × impact)

| # | Risk | Likelihood | Impact | Notes |
|---|---|---|---|---|
| 1 | **CORS proxy fragility** — entire external frontend depends on a Cloudflare Worker/Pages Function proxy because Apps Script cannot emit CORS headers; Apps Script cross-origin behaviour is undocumented by Google | High | High | Single point of failure; must be documented + monitored. `[UNVERIFIED]` as a stated Google behaviour — inferred from TextOutput API + CORS spec. |
| 2 | **Deployment ownership non-transferability** — versioned deployments can't transfer; deleting owner account → script errors; consumer accounts can't use shared drives | High | High | Direct turnover risk for a 2-volunteer team. Mitigate via Workspace shared drive / dedicated deployer account. |
| 3 | **Toolchain/handoff burden** — Cloudflare SPA reintroduces Vite/React/TS + proxy + dual deploy on top of Apps Script, widening the knowledge surface vs ADR-0007's vanilla rationale | Medium | High | The core sustainability worry; successor volunteer must span 3+ systems. |
| 4 | **`webapp.access` misconfiguration** — must be `ANYONE_ANONYMOUS` for unauthenticated `fetch()`; `ANYONE` yields a Google OAuth redirect instead of JSON | Medium | Medium | CONTEXT.md says `ANYONE`; PIN design implies `ANYONE_ANONYMOUS`. Verify the live deployment. |
| 5 | **Consumer-vs-Workspace quota cliff** — email 100/day (consumer) vs 1,500/day (Workspace); triggers 90 min/day vs 6 hr/day; URL-Fetch 20k vs 100k/day | Medium | Medium | Account type unconfirmed in repo; dramatically changes comms/scheduled-job ceiling. |
| 6 | **`google.script.run` → HTTP rewrite scope** — dispatch, auth-transport, and error-mapping layers must be rebuilt; underestimation risk | Medium | Medium | Largest single migration work item; backend logic is portable but the seams are not. |
| 7 | **Cloudflare free-plan hard limits** — 100k Worker req/day, 500 builds/mo, 10ms CPU/invocation | Low | High | Unlikely at EFCC scale; becomes relevant only if a future feature spikes request/build volume. |
| 8 | **Sheets write contention** | Low | Medium | Already mitigated server-side by `LockService`; does not worsen with external frontend. |

---

## Sources

### Cloudflare
- `developers.cloudflare.com/pages/platform/limits/` — Pages free-plan limits (500 builds/mo, 1 concurrent, 20-min timeout, 100 projects/account).
- `developers.cloudflare.com/workers/platform/limits/` — Workers free-plan account limits (100k req/day, 10ms CPU, 128 MB, 50 subrequests, 6 outgoing conns, 100 Workers, 5 cron triggers).
- `developers.cloudflare.com/workers/platform/pricing/` — Free default; Paid $5/mo min (10M req + 30M CPU-ms included, then $0.30/M req, $0.02/M CPU-ms); no egress/throughput charges; **static-asset requests free & unlimited**; **Pages Functions billed as Workers**.
- `cloudflare.com/plans/developer-platform/` — developer-platform plan overview.

### Google Apps Script
- `developers.google.com/apps-script/guides/services/quotas` — quotas table: 6 min/execution; 30 simultaneous/user; 1,000/script; Triggers 90 min/day (consumer) / 6 hr/day (Workspace); URL Fetch 20,000/day / 100,000/day; Email 100/day / 1,500/day; per-user, reset 24h; exception messages.
- `developers.google.com/apps-script/guides/web` — web app lifecycle, `doGet`/`doPost`, `/exec` vs `/dev`, `e.pathInfo`, execute-as-me vs user-accessing, permissions, test deployments.
- `developers.google.com/apps-script/manifest/web-app-api-executable` — `access` values (`MYSELF`/`DOMAIN`/`ANYONE`=logged-in/`ANYONE_ANONYMOUS`=even anonymous); `executeAs` (`USER_DEPLOYING`/`USER_ACCESSING`).
- `developers.google.com/apps-script/reference/content/text-output` — `TextOutput` method set (no header-setting API).
- `developers.google.com/apps-script/guides/content` (via Context7 `/websites/developers_google_apps-script`) — "the browser URL will differ from the script URL for security" (the `/exec` redirect).
- `developers.google.com/apps-script/guides/html/reference/run` — `google.script.run` is the HtmlService client-side RPC (iframe-only).
- `developers.google.com/apps-script/concepts/deployments` — versioned deployments; **cannot transfer ownership**; deleting owner account → script errors; update via new version keeps the same URL/ID.
- `developers.google.com/apps-script/guides/collaborating` — owner-leaves problem; **shared drives require Workspace Business/Enterprise**; "Always share ownership."

### Google Sheets
- `developers.google.com/sheets/api/limits` — Sheets **REST API** quotas (300/min project read+write, 60/min/user, 180s timeout, no daily cap if within per-minute, atomic updates). Note: EFCC uses Apps Script `SpreadsheetApp`, governed by the Apps Script quotas above, not these.

### Other
- `stripe.com/pricing` — per-transaction pricing, no monthly fee; rate is locale-dependent (page rendered ~3.6%/txn in this session's locale; ~2.9% + $0.30 US is the commonly published US figure — `[UNVERIFIED]` exact figure for EFCC's locale).

### Repo grounding (read-only)
- `AGENTS.md` — Docs-Backed / Headless-Gate / Sheet-Immutable guardrails; "Stateless-Wall blocks Orca on authenticated RPCs."
- `CONTEXT.md` — manifest summary (`webapp.access = ANYONE`, `executeAs = USER_DEPLOYING`); `google.script.run` RPC envelope; scanner-on-GitHub-Pages external-origin precedent (`noahwong-hue.github.io/efcc-scanner`, `postMessage` bridge, `getUserMedia` blocked in iframe).
- `docs/adr/0001-google-sheets-as-database.md` — Sheets-as-DB rationale, constraints (no concurrent writes, 10M-cell ceiling, range-limited reads).
- `docs/adr/0002-pin-based-authentication.md` — PIN auth, no Google OAuth, session-less (amended by 0011).
- `docs/adr/0003-google-script-run-rpc.md` — `google.script.run` chosen to avoid REST/CORS; 5 KB param limit.
- `docs/adr/0007-vanilla-multipage-html-service.md` — React retired for 5 MB limit + toolchain-burden rationale.
- `docs/adr/0011-one-active-session-per-member.md` — HMAC session token via `PropertiesService` + `Utilities.computeHmacSha256Signature`.
- `docs/wayfinder/002-migration-playbook.md`, `docs/omp-plans/2026-07-27-efcc-webapp-migration.md` — prior migration thinking (React singlefile inside Apps Script).
- `docs/research/2026-07-28-gas-multipage-best-practice.md` — convention template; corroborates HtmlService client APIs are iframe-scoped.

---

## `[UNVERIFIED]` claims (could not be confirmed against a primary source)

1. **Exact runtime CORS behaviour of Apps Script `/exec` across browsers.** Google does not publish an explicit "cross-origin `fetch()` to `/exec` is blocked" statement. The conclusion that a proxy is required is **inferred** from two verified primary facts: (a) `TextOutput` has no header-setting API (`developers.google.com/apps-script/reference/content/text-output`), and (b) `/exec` serves content from a different origin than the script URL (`developers.google.com/apps-script/guides/content`). The proxy recommendation is robust regardless; relying on incidental cross-origin readability is not.
2. **EFCC's currently-deployed `webapp.access` value.** CONTEXT.md summarises it as `ANYONE`, but the PIN-auth design (ADR-0002, no Google OAuth) requires `ANYONE_ANONYMOUS`. The live deployment value is not verified here — it must be confirmed before building the proxy.
3. **Whether the EFCC Apps Script owner account is consumer (gmail.com) or Google Workspace.** Not stated in the repo. The quota cliff (email 100 vs 1,500/day; triggers 90 min vs 6 hr/day; URL-Fetch 20k vs 100k/day; shared-drive availability) depends entirely on this. Flagged as a key variable to confirm.
4. **Exact Stripe per-transaction rate for EFCC's locale.** `stripe.com/pricing` geo-rendered to ~3.6%/txn (JP) in this session; the US figure (~2.9% + $0.30) is commonly published but not verified for EFCC's locale. The load-bearing point — per-transaction fee, no monthly fee — is confirmed.
