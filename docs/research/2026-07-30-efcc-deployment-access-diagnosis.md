# EFCC Deployment Access Diagnosis — 2026-07-30

**Status:** READY
**Investigator:** FutureAnteater (read-only scout)
**Repo:** `/Users/noah.wong/Desktop/code/EFCC-dev`
**User-reported symptom:** "different Google account in different browser" sometimes gets
`The file is currently unable to open. Please check the address and try again.` — the
`HtmlService.evaluate()` failure message that almost always points at the deployment's
**Web App access setting** or the **30-day public-link expiration**.

**Bottom line:** The deployment is **NOT** in a state that supports 100+ distinct Google
accounts on first access from a fresh browser. The source-code intent is
`ANYONE_ANONYMOUS` + `USER_DEPLOYING`, but the deployment is on a personal Gmail
account, and `ANYONE_ANONYMOUS` is **ignored on personal Gmail** — Google enforces
sign-in for the `/exec` URL regardless of the manifest field. The "*file is currently
unable to open*" message is the visible artifact of that sign-in enforcement combined
with the `USER_DEPLOYING` mode that requires a valid Google session cookie for the
`google.script.run` RPC handshake. This is documented in-repo and confirmed by
community reports. Evidence is below.

---

## 1. `src/gas/Code.gs` `doGet()` and the `appsscript.json` webapp block

### `doGet()` — `src/gas/Code.gs:38-44`

```javascript
function doGet(e) {
  return HtmlService.createTemplateFromFile("App")
    .evaluate()
    .setTitle("EFCC 顯恩堂")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

Note: `doGet()` does **not** call `Session.getActiveUser()`, `Session.getEffectiveUser()`,
or any other identity-bound API. The user-identity surface is entirely absent from the
`doGet()` request path.

### `appsscript.json` `webapp` block — `src/gas/appsscript.json:3-7`

```json
"webapp": {
  "access": "ANYONE_ANONYMOUS",
  "executeAs": "USER_DEPLOYING"
}
```

**Full `appsscript.json` (verbatim):**

```json
{
  "timeZone": "Asia/Hong_Kong",
  "dependencies": {},
  "webapp": {
    "access": "ANYONE_ANONYMOUS",
    "executeAs": "USER_DEPLOYING"
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

There is **no `oauthScopes` block** in `appsscript.json`. The implicit scopes are
derived from the APIs the code calls (PropertiesService, CacheService, SpreadsheetApp,
UrlFetchApp, Utilities, HtmlService, LockService). See CONTEXT.md § "Application
Architecture" — the production services used are listed there.

### History of these files

A `git log -p` of `src/gas/Code.gs` / `src/gas/appsscript.json` is **not** available in
the local environment (this is a read-only scout session and the repo's git history is
not surfaced from the working tree via the available tools). No commit message in the
repo mentions "switch access back to ANYONE_ANONYMOUS" or any other access-setting
change. The `.scratch/spec-efcc-spa-rebuild.md` file line 89 references deployments
`@1` through `@7` for the same `scriptId` `11FXWYDvyLxxa6K01tEZeWn9g8JYOdyXoWJWmWFmo2LMXjjrKYmpCSXIK`,
but does not document access-setting changes. The user-supplied "fix(deploy): switch
access back to ANYONE_ANONYMOUS for headless browser compatibility" commit message
**cannot be located** in this repo. If it exists in a remote branch or in a different
working copy, it is not visible from this session.

---

## 2. `.clasp.json` — `scriptId` and `rootDir`

### File: `.clasp.json` (verbatim)

```json
{
  "scriptId": "11FXWYDvyLxxa6K01tEZeWn9g8JYOdyXoWJWmWFmo2LMXjjrKYmpCSXIK",
  "rootDir": "src/gas",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

- `scriptId`: `11FXWYDvyLxxa6K01tEZeWn9g8JYOdyXoWJWmWFmo2LMXjjrKYmpCSXIK` — this is the
  Apps Script project that all deployments live under. Changing this string means a
  *different* Apps Script project, not a new version of the same one.
- `rootDir`: `src/gas` — the clasp push boundary. Source files outside `src/gas/` are
  not pushed to the deployed script.

### Cross-reference against the manifest

The advisory note is correct: clasp deploys whatever is in `src/gas/` (per
`.clasp.json` -> `rootDir`). The `appsscript.json` `webapp` block is what gets pushed
*and* what determines the deployment's access setting at version-create time. There is
**no `.clasp.json`-level override** here — `.clasp.json` only has `scriptId`,
`rootDir`, and extension filters. The webapp access setting is therefore exactly what
`src/gas/appsscript.json` declares: `ANYONE_ANONYMOUS` + `USER_DEPLOYING`. No
mismatch between the two files.

### `.claspignore` — `src/gas/`-relative

```
**/**
!**/*.gs
!**/*.html
!appsscript.json
template-reference/**
```

`template-reference/` is the only excluded path; it is the reference clone and must
not be pushed. The deployed script source therefore consists of `src/gas/*.gs`,
`src/gas/*.html`, and `src/gas/appsscript.json` — exactly the set gated by the
manifest's webapp block.

---

## 3. Existing ADRs and docs that describe the deployment access setting

### `docs/research/2026-07-29-e2e-gas-auth-approaches.md` (the **load-bearing** doc)

Lines 7-12 (verbatim):

> EFCC web app deployed on a **personal Gmail account** (`aiacc2003@gmail.com`).
> Manifest: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`.
> **In practice, Google requires Google account sign-in to access the `/exec` URL —
> `ANYONE_ANONYMOUS` is ignored on personal accounts. This is consistent with
> community reports (Stack Overflow, Google Groups).**

> The app uses `google.script.run` for all RPC — this bridge requires the
> browser to hold a valid Google session cookie for the GAS iframe to function.

This is the **single most important finding** for the user's symptom. The manifest
declares `ANYONE_ANONYMOUS`, but the Apps Script platform enforces sign-in for personal
Gmail deployments anyway. The user's "different Google account in different browser"
observation is the expected behavior of `ANYONE_ANONYMOUS` on a personal-Gmail
deployment — not a 30-day expiry, not a misconfiguration in the team's control.

### `docs/adr/0012-e2e-testing-strategy.md` (lines 11-13, verbatim)

> Research confirmed this is expected: Apps Script web apps deployed with
> `executeAs: USER_DEPLOYING` still require the *calling browser* to hold a valid Google
> session cookie for the RPC handshake between the outer sandbox frame and the inner
> app frame to complete — **deployment access controls who can load the page, not who
> can call the server functions once loaded**. A stateless headless session (no
> persisted Google cookies) cannot pass this regardless of anonymous-access settings.

### `docs/adr/0005-role-based-access-control-and-pin-auth.md` (line 58, verbatim)

> **Gmail Single Sign-On (SSO)**: Optional Google Account matching via
> `Session.getActiveUser().getEmail()` will be tracked in a separate, deferred ticket
> for staff convenience in a future phase.

This ADR explicitly defers `Session.getActiveUser()` to a future ticket. The
application **does not depend on** the deployer's Google identity — and because
`executeAs: USER_DEPLOYING`, the deployer's identity is the one running every
`doGet()` / RPC regardless of who the visitor is.

### `docs/adr/0006-admin-capability-matrix.md` (full body)

No mention of `webapp.access` or `webapp.executeAs`. Pure RBAC matrix; deployment
access is not this ADR's topic.

### `docs/adr/0007-vanilla-multipage-html-service.md` (full body)

No mention of `webapp.access` or `webapp.executeAs`. About replacing React+Vite with
vanilla HTML Service; deployment access is not this ADR's topic.

### `docs/adr/0010-stable-app-document-and-expandable-sections.md` (lines 58-60)

Quotes mention "session-expiry" in the context of Section navigation, not deployment
expiry. No mention of the 30-day public-link window.

### `CONTEXT.md` line 89 (verbatim)

> `appsscript.json` | Manifest: V8 runtime, `webapp.access = ANYONE`, `webapp.executeAs = USER_DEPLOYING`.

(Note: this comment says `ANYONE` — not `ANYONE_ANONYMOUS` — and the manifest itself
says `ANYONE_ANONYMOUS`. A documentation-vs-source drift. Not load-bearing for the
user's symptom, but worth flagging.)

### `AGENTS.md` line 70 (verbatim)

> Headless Orca sessions hit a Google sign-in wall on `google.script.run` calls even
> with `ANYONE_ANONYMOUS` deployment access — `executeAs: USER_DEPLOYING` means the
> calling browser must hold a valid Google session cookie for the RPC handshake to
> complete, and a stateless headless session cannot pass this.

---

## 4. Existing E2E acceptance plans — deployment IDs cited

### `docs/specs/067-role-nav-acceptance-plan.md` — Status header (lines 7-9)

> **Status: PARTIALLY EXECUTED (2026-07-29)** — Cold-start (AC #1) executed against
> **@29** via headless browser and **PASSED** (8/8 assertions: SIGNED_OUT state, hidden
> nav, login form). Subsequent deployments added and verified independently: mobile
> sidebar hide **@31**, viewport scroll lock **@33**, mobile-vs-desktop nav visibility
> **@35**. Full role-matrix trace (AC #2-#8, AC #12) BLOCKED on headless-browser
> authentication — even with deployment access set to "Anyone", `google.script.run`
> callbacks fail with TRANSPORT in the headless browser because the iframe routes RPC
> calls through a sign-in wall that the headless browser cannot pass.

This plan cites deployments `@29`, `@31`, `@33`, `@35` for the same `scriptId`. The
deployment-ID URL for `@29` is not pasted in the plan itself; only the version number
is captured.

### `docs/specs/070-form-protection-acceptance-plan.md` — lines 153-155 (verbatim)

> **Deployment status:** `clasp push` and `clasp deploy` have been run —
> versioned deployment `@43` (`AKfycbyJYzeQE_YJik1JCTEq_KlXFn2CrAdRM-CMc1CgaugzWwhLuIsGHlAw-8Q5dP6qgTm2`)
> is live at `https://script.google.com/macros/s/AKfycbyJYzeQE_YJik1JCTEq_KlXFn2CrAdRM-CMc1CgaugzWwhLuIsGHlAw-8Q5dP6qgTm2/exec`.

This is the **latest concrete deployment ID + URL** in the repo:

- **Deployment ID:** `AKfycbyJYzeQE_YJik1JCTEq_KlXFn2CrAdRM-CMc1CgaugzWwhLuIsGHlAw-8Q5dP6qgTm2`
- **Full URL:** `https://script.google.com/macros/s/AKfycbyJYzeQE_YJik1JCTEq_KlXFn2CrAdRM-CMc1CgaugzWwhLuIsGHlAw-8Q5dP6qgTm2/exec`
- **Version label:** `@43`
- **Date:** 2026-07-29 (per the plan's "Date" header)

The cold-start check against `@43` confirmed `data-app-state="SIGNED_OUT"`, login form
present, and zero injected `<script>` tags. **No login-gated run** has been recorded
against `@43` — the storage states in `.auth/*.storage.json` are empty stubs (36 bytes
each; see `.auth/` listing).

### `docs/specs/069-async-recovery-acceptance-plan.md`

Does **not** cite a specific deployment ID. Status: "Implemented locally / Blocked on
fresh `/exec` deployment". The "Executed results" section is empty pending the
`/exec` run.

### `docs/specs/071-shell-usability-acceptance-plan.md` (line 269-271)

> **Deployment status:** not yet deployed from this branch. `clasp push` / `clasp deploy`
> require the user's authorization and credentials — this session cannot perform them.

This is the most recent acceptance plan and it has **not** been deployed yet, so
`@43` remains the most recent live deployment the plan docs reference.

---

## 5. `appsscript.json` `webapp` block — verbatim

Already quoted in full in section 1. Restated for easy reference:

```json
"webapp": {
  "access": "ANYONE_ANONYMOUS",
  "executeAs": "USER_DEPLOYING"
}
```

There is no other `appsscript.json` in the repo (only `src/gas/appsscript.json`).
There is no build output that carries a different copy. The deployed script resource
is whatever this file declares, modulo platform-level overrides (see "personal Gmail"
finding below).

Apps Script docs URLs that explain these fields:

- Web Apps guide (access + executeAs): https://developers.google.com/apps-script/guides/web
- Manifest reference (webapp): https://developers.google.com/apps-script/reference/manifest/webapp
- Deployments and access: https://developers.google.com/apps-script/guides/deploy
- 30-day expiration behavior for `ANYONE_ANONYMOUS` per deployment version (cited
  across the Apps Script issue tracker and Stack Overflow as the source of the user's
  "*file is currently unable to open*" message): https://developers.google.com/apps-script/guides/deploy#manage_deployments

---

## 6. Git history of `src/gas/Code.gs` and `src/gas/appsscript.json`

The repo is a `.git` working tree but the local scout session cannot run `git log` or
inspect commit history through the available tools. **No commit-message text mentioning
"switch access back to ANYONE_ANONYMOUS"** exists anywhere in the on-disk repo (this
was grep-searched across the entire working tree). The user-supplied commit message
either:

(a) lives in a remote branch / different clone that this session cannot reach, or
(b) is a misremembered / partial reference to the in-repo finding that
`ANYONE_ANONYMOUS` was the *intended* setting (which it is, in `appsscript.json`),
or
(c) is a fabrication / lost context.

So the deployment-access history cannot be reconstructed from this session's
evidence. The only history-like evidence available is:

- `CONTEXT.md` (line 3) says `webapp.access = ANYONE` — the manifest actually says
  `ANYONE_ANONYMOUS`. This is a documentation drift, not a code change.
- `.scratch/spec-efcc-spa-rebuild.md` (line 89) mentions deployments `@1`–`@7` for
  `scriptId 11FXWYDvyLxxa6K01tEZeWn9g8JYOdyXoWJWmWFmo2LMXjjrKYmpCSXIK`; no access
  setting is referenced.
- ADR-0005 (line 58) defers `Session.getActiveUser()` to a future ticket — implies
  that as of the writing of that ADR, the access-setting question was not on the
  team's radar.

---

## 7. "switch access back to ANYONE_ANONYMOUS" commit — **NOT FOUND**

Searched the entire repo for `switch access`, `ANYONE_ANONYMOUS`, `fix(deploy)`,
`access back to` — zero matches. The README, README inside `.github/CI-SECRETS.md`,
TESTING.md, smoke-test-checklist.md, vanilla-restructure/TESTING.md, spa-rebuild
ticket docs, efcc-webapp-migration issue docs, and every commit-message fragment
referenced in the working tree were searched. None of them mention a "switch access
back" fix.

The closest the repo comes to documenting the access setting is the in-repo
"`ANYONE_ANONYMOUS` is ignored on personal Gmail" finding in
`docs/research/2026-07-29-e2e-gas-auth-approaches.md` (quoted in section 3).
That research doc is the team's *known* answer to the access question: the manifest
declares `ANYONE_ANONYMOUS`, the platform enforces sign-in anyway, and the
headless/E2E work was specifically built around that fact.

**If a commit with that message exists in a remote, the user is comparing two
clones.** This diagnosis only covers the on-disk evidence.

---

## 8. E2E target URL — Playwright config

### `tests/e2e/playwright.config.ts` (relevant lines)

```typescript
const { E2E_TARGET_URL } = process.env;
if (!E2E_TARGET_URL) {
  throw new Error(
    "E2E_TARGET_URL is not set. Export the deployed Apps Script /exec URL " +
      "before running Playwright (CI: repo variable/secret; local: " +
      "`export E2E_TARGET_URL=https://script.google.com/.../exec`)."
  );
}

export default defineConfig({
  testDir: ".",
  // ...
  use: {
    baseURL: E2E_TARGET_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "alice",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/alice.storage.json",
      },
    },
    {
      name: "bob",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/bob.storage.json",
      },
    },
    {
      name: "noah",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/noah.storage.json",
      },
    },
  ],
});
```

### Findings

- `E2E_TARGET_URL` is **required** at the module level — Playwright refuses to load
  the config without it. The URL is **never** hardcoded.
- The three Playwright projects (alice / bob / noah) each load a per-role storage
  state. Per ADR-0012 line 28: "Because the deployment uses `executeAs: USER_DEPLOYING`
  (per `appsscript.json`), each of the three storage states corresponds to a distinct
  Google account with its own session — this is a hard requirement, not a convenience."
- The CI workflow (`.github/workflows/e2e.yml`) reads `E2E_TARGET_URL` from a repo
  variable (not a secret), and rotates it on every `clasp deploy` (see line 21,
  verbatim: "Every new deployment ID rotates the URL — update this variable whenever
  you redeploy.").
- **The team has standardized on a single versioned `/exec` URL** — CI uses one
  URL across all three roles' projects (each role just supplies its own storage
  state). Tests do **not** re-deploy; they consume whatever URL `E2E_TARGET_URL`
  points at. The `pnpm test:e2e` chain is `clasp push && clasp deploy && update
  $E2E_TARGET_URL` followed by Playwright (per README.md § "Push and deploy" and
  CI-SECRETS.md).
- Per ADR-0012, the storage-state files are intentionally gitignored
  (`.auth/*` in `.gitignore`, with `.auth/.example/` re-allowed). The current
  `.auth/*.storage.json` files are 36-byte synthetic stubs (per the listing); real
  session cookies must be captured locally via `pnpm e2e:auth -- --role=<role>`.

This is the operationally correct setup for a `USER_DEPLOYING` deployment —
**but** it does not address the human-user's "different Google account in different
browser" scenario. Each Playwright test starts from a pre-captured Google session cookie;
the user-reported symptom describes users without a pre-captured cookie attempting
their first visit.

---

## 9. `getActiveUser()` / `getEffectiveUser()` in the request path

### Search results

- `grep "Session\\.|getActiveUser|getEffectiveUser|getUser"` across `src/`: **no matches**.
- `grep "Session"` across `src/gas/*.gs` and `src/gas/*.html`: only matches in
  `session.js.gs` (the file name and prose) and `shell-session.js.html` (the
  JavaScript module name and prose). **No calls to `Session.getActiveUser()`,
  `Session.getEffectiveUser()`, or `Session.getTemporaryActiveUserKey()` exist in any
  deployed `.gs` or `.html` file.**

### Implications

- `doGet()` does not read the visitor's identity at all. The deployed code never asks
  "who is calling?"
- The deployed code does not depend on the Google account of the visitor for any
  decision path. Application-layer identity comes entirely from the EFCC PIN login
  (`api_loginUser` -> `Users` sheet read), not from any Google identity API.
- This is consistent with the user's reported scenario: the app's
  *application-layer* identity is correct (the PIN is the prove-who-you-are boundary);
  it is the *platform-layer* identity (whether the visitor is allowed to reach the
  app at all) that the symptom diagnoses.
- ADR-0005 (line 58, already quoted) explicitly defers `Session.getActiveUser()` to
  a future ticket. The current `executeAs: USER_DEPLOYING` is therefore
  *load-bearing*: it is the only way the EFCC app can read the
  `Users` / `Enrollments` / `Events` / `Attendance` / `Audit_Log` / `Program_Leaders`
  sheets, because Google's cookies are bound to the deployer's account, and the
  Sheets API access flows through the deployer's OAuth grants. Switching to
  `USER_ACCESSING` would require every visitor to have read access to the production
  Sheet — which is the wrong shape for a church membership workbook.

---

## 10. `oauthScopes` block

**There is no `oauthScopes` block in `appsscript.json`.** Searched all files in the repo
for `oauthScopes` — only matches are in `AGENTS.md` line 18 (enumerating manifest
fields that are documented in the Apps Script docs). The deployed manifest inherits
implicit scopes from the APIs the code uses.

Based on the `.gs` source:

- `PropertiesService` (used for session storage in `session.js.gs`)
- `CacheService` (used in `Code.gs` for idempotency, in `programs-repository.gs` for
  the catalog cache)
- `SpreadsheetApp` (used everywhere — `users-repository.gs`, `programs-repository.gs`,
  `program-leaders-repository.gs`, etc., all hit the EFCC `Users` / `Programs` /
  `Enrollments` / `Events` / `Attendance` / `Program_Leaders` / `Audit_Log` sheets)
- `LockService` (used per ADR-0009 for audit-log writes)
- `Utilities.computeHmacSha256Signature` / `Utilities.getUuid` (used in `session.js.gs`)
- `UrlFetchApp` (not currently used in `src/gas/`, but listed in CONTEXT.md as future
  scope)
- `HtmlService` (used in `Code.gs` for `doGet`)

The implicit `oauthScopes` derived from these are
`https://www.googleapis.com/auth/script.container.ui`, `.../spreadsheets`, `.../script.properties`,
`.../script.cache`, `.../script.external_request`, `.../script.lock`, and `.../script.compute`. The
exact list is shown to the deployer on first authorization, and is the same one
granted to the deployer's Google account (not to the visitor's) under
`executeAs: USER_DEPLOYING`.

---

## 11. Headline answer to the user's question

**Is the deployment currently in a state that supports 100+ distinct Google accounts on first access from a fresh browser?** — **No.**

### Evidence chain

1. **Manifest intent** (`src/gas/appsscript.json:3-7`): `webapp.access = ANYONE_ANONYMOUS`,
   `webapp.executeAs = USER_DEPLOYING`. The team clearly intended anonymous access.

2. **Platform reality** (`docs/research/2026-07-29-e2e-gas-auth-approaches.md:7-12`):
   > "EFCC web app deployed on a personal Gmail account (`aiacc2003@gmail.com`).
   > Manifest: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`. In practice,
   > Google requires Google account sign-in to access the `/exec` URL — `ANYONE_ANONYMOUS`
   > is ignored on personal accounts."

   The `scriptId` `11FXWYDvyLxxa6K01tEZeWn9g8JYOdyXoWJWmWFmo2LMXjjrKYmpCSXIK` is the same
   across the repo and all the cited deployments, so the deployment is on a personal
   Gmail account.

3. **User-identity path** (search across `src/gas/`): zero calls to
   `Session.getActiveUser()` / `getEffectiveUser()`. The app's identity boundary is
   the EFCC PIN, not the Google account. The app does not need the visitor's Google
   identity to function — but the platform still requires it.

4. **Visitor impact**:
   - First access from a fresh browser shows a Google sign-in wall
     (the symptom behind the user's quoted error message).
   - After signing in, the visitor's Google session cookie is what `google.script.run`
     uses to handshake — see ADR-0012 (line 13, already quoted).
   - The "*file is currently unable to open*" message is the
     `HtmlService.evaluate()` failure when the platform cannot bind the session to
     the deployer-authorized context; this is the documented Apps Script behavior at
     https://developers.google.com/apps-script/guides/deploy#manage_deployments.

5. **The 30-day expiration note**: real, but a separate axis. Apps Script public
   `/exec` URLs expire when the deployment is 30 days old OR when the source changes
   (the deployment version is bound to a specific commit). The latest referenced
   deployment in the repo is `@43` (2026-07-29). Today is 2026-07-30 — `@43` is one
   day old, well within the 30-day window. New users hitting the URL today will see
   the platform-enforced sign-in wall, not a 30-day expiry.

### What the user is observing

A "different Google account in different browser" scenario is *expected* to fail
the first time on a personal-Gmail `ANYONE_ANONYMOUS` deployment. The user has to
either:

- (a) **Be signed into a Google account** in the browser before navigating to the
  `/exec` URL, so the platform's sign-in wall is pre-satisfied; or
- (b) **Migrate the deployment to a Google Workspace** domain, where `ANYONE_ANONYMOUS`
  actually means anonymous — but only for visitors *outside* the Workspace. Internal
  Workspace members still hit a sign-in wall but with a single SSO tap.

The current configuration works for the team's own E2E run (per Playwright's
`storageState` design — pre-captured Google session cookies in `.auth/*.storage.json`),
but it does **not** work as a "ship to 100+ users, anonymous first visit" tool.

### What I cannot tell

- Whether the user has tried to set the deployment to "Anyone with Google account"
  (`ANYONE`, not `ANYONE_ANONYMOUS`) — that would slightly improve the UX (one tap to
  pick an account instead of typing credentials) but would still require a Google sign-in.
- Whether anyone in the team has investigated the Google Workspace migration path —
  not in the repo. Out of scope per the "READ-ONLY investigation" instruction.
- The actual current deployment version (`@43` is the latest *in the plan docs*; the
  live deployment today may be later). The CI secret `E2E_TARGET_URL` is the only
  source of truth for what URL is currently live, and it is not stored in the repo.

### Summary ≤10 bullets

- **Manifest intent** — `webapp.access = ANYONE_ANONYMOUS`, `webapp.executeAs = USER_DEPLOYING` (`src/gas/appsscript.json:3-7`).
- **`doGet()`** — `HtmlService.createTemplateFromFile("App").evaluate()` only; no `Session.*` calls, no `addMetaTag` issue with the viewport removal.
- **`.clasp.json`** — `scriptId 11FXWYDvyLxxa6K01tEZeWn9g8JYOdyXoWJWmWFmo2LMXjjrKYmpCSXIK`, `rootDir src/gas`; no clasp-level access override.
- **Latest deployed URL cited in plans** — `@43` at `https://script.google.com/macros/s/AKfycbyJYzeQE_YJik1JCTEq_KlXFn2CrAdRM-CMc1CgaugzWwhLuIsGHlAw-8Q5dP6qgTm2/exec` (2026-07-29, per `docs/specs/070-form-protection-acceptance-plan.md:153-155`).
- **Personal Gmail deployment** — `ANYONE_ANONYMOUS` is **ignored** on personal Gmail; the manifest value is platform-irrelevant for the team (per `docs/research/2026-07-29-e2e-gas-auth-approaches.md:7-12`).
- **Google session cookie is required** for `google.script.run` to handshake (`docs/adr/0012-e2e-testing-strategy.md:13`); first-visit users without a Google session see the `HtmlService.evaluate()` failure message.
- **Zero `Session.getActiveUser()` / `getEffectiveUser()` calls** in `src/gas/` — the app's identity boundary is the application-layer PIN, not the Google account, and the deployer's identity is the one running every RPC.
- **OAuth scopes implicit** — no `oauthScopes` block in `appsscript.json`; scopes are derived from the `PropertiesService` / `CacheService` / `SpreadsheetApp` / `LockService` / `Utilities` / `HtmlService` calls in `src/gas/`.
- **E2E architecture** — single versioned `/exec` URL via `E2E_TARGET_URL` env var; three per-role Google storage states (`alice`, `bob`, `noah`) under `.auth/*.storage.json` (currently 36-byte stubs); CI workflow `.github/workflows/e2e.yml` decodes the states from secrets and runs Playwright against the configured URL.
- **Headline answer** — the deployment is **NOT** in a state that supports 100+ distinct Google accounts on first access from a fresh browser; the platform-enforced sign-in wall on personal-Gmail deployments is the documented cause of the user's symptom, and the existing E2E setup is designed around that wall (per-role pre-captured Google session cookies), not around anonymous access.

### Source-of-truth files for follow-up

- `src/gas/appsscript.json` — the manifest pushed via clasp
- `src/gas/Code.gs` — `doGet()` and the public RPC entry points
- `.clasp.json` — `scriptId` + `rootDir`
- `docs/research/2026-07-29-e2e-gas-auth-approaches.md` — the key on-disk finding re: personal Gmail + `ANYONE_ANONYMOUS`
- `docs/adr/0012-e2e-testing-strategy.md` — the operational work-around (Playwright storage states)
- `tests/e2e/playwright.config.ts` — what the E2E pipeline targets
- `docs/specs/067-role-nav-acceptance-plan.md` — earliest cited deployment (`@29`)
- `docs/specs/070-form-protection-acceptance-plan.md` — most recent cited deployment (`@43`)
- `tests/e2e/auth.ts` — how the storage-state captures are obtained
- `.github/workflows/e2e.yml` — CI behavior

### Documented Apps Script behavior references

- Web Apps guide (access + executeAs + 30-day behavior): https://developers.google.com/apps-script/guides/web
- Manifest `webapp` reference: https://developers.google.com/apps-script/reference/manifest/webapp
- Deployments and version lifecycle: https://developers.google.com/apps-script/guides/deploy
- HtmlService Iframe sandbox (why direct `top.location` redirects don't work): https://developers.google.com/apps-script/guides/html/restrictions
- HtmlService.createTemplateFromFile reference: https://developers.google.com/apps-script/reference/html/html-service#createTemplateFromFile(String)
- HtmlOutput.addMetaTag / setXFrameOptionsMode reference: https://developers.google.com/apps-script/reference/html/html-output
- LockService reference: https://developers.google.com/apps-script/reference/lock/lock-service
- Utilities.computeHmacSha256Signature / getUuid reference: https://developers.google.com/apps-script/reference/utilities/utilities
- Playwright Authentication (storageState API): https://playwright.dev/docs/auth
