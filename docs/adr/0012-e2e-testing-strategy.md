# ADR-0012 — E2E Testing Strategy (Playwright Storage-State Pattern)

- **Status**: Superseded by ADR-0029 — historical rationale for the Apps Script `/exec` storage-state pattern, whose deployed suite and credential capture flow are retired. The deterministic `tests/gas/` suite and local Worker/D1 Playwright suites are current.
- **Deciders**: Noah Wong, OMP planner (grill-with-docs)
- **Date**: 2026-07-29
- **Related**: issue #67 (historical role-aware navigation), `docs/specs/009-phone-first-shell-navigation.md` (historical testing plan section), `docs/specs/067-role-nav-acceptance-plan.md` (historical manual plan), ADR-0029 (current local-first testing and readiness gate), AGENTS.md
- **Research**: primary-sourced via `web_search` (Playwright official docs, Apps Script Web Apps guide, Stack Overflow/community threads on Google Sign-In automation)

## Context

AGENTS.md's headless browser gate requires every user-facing implementation to include an executed acceptance plan against a fresh `/exec` deployment. In practice this session, driving the deployed EFCC app with the Orca `browser` tool worked for cold-start / CSS-only assertions (no login required — `SIGNED_OUT` state, nav visibility, viewport locking) but **failed for any post-login trace**: `google.script.run` calls returned TRANSPORT failures because the Apps Script iframe routes RPC calls through a Google sign-in wall the headless browser session cannot pass, even with the deployment's `webapp.access` set to `ANYONE_ANONYMOUS`.

Research confirmed this is expected: Apps Script web apps deployed with `executeAs: USER_DEPLOYING` still require the *calling browser* to hold a valid Google session cookie for the RPC handshake between the outer sandbox frame and the inner app frame to complete — deployment access controls who can *load* the page, not who can *call the server functions* once loaded. A stateless headless session (no persisted Google cookies) cannot pass this regardless of anonymous-access settings.

Playwright's documented pattern for exactly this class of problem — Google-authenticated app testing — is: authenticate once in a headful (visible) browser session, persist the resulting cookies + localStorage as a "storage state" JSON file, then load that storage state into subsequent headless test contexts to skip interactive sign-in. This is Playwright's first-party `context.storageState()` / `browser.newContext({ storageState })` API, documented at `playwright.dev/docs/auth`.

## Decision

1. **Runtime**: Playwright, added as a repo devDependency, living in a new `tests/e2e/` directory — separate from `tests/gas/` (vm-harness unit tests against mocked Apps Script globals) and separate from ad-hoc Orca `browser`-tool runs (kept as an interactive fallback for exploratory debugging, not part of the pipeline).

2. **Authentication**: three persisted storage states, one per test role, matching the dev-sheet users already seeded for this project:
   - `alice` / MEMBER / PIN 1234 → `.auth/alice.storage.json`
   - `bob` / STAFF / PIN 5678 → `.auth/bob.storage.json`
   - `noah` / ADMIN / PIN 6883 → `.auth/noah.storage.json`

   Generated via a one-shot interactive script (`npm run e2e:auth -- --role=alice`) that launches a headful Playwright browser, walks the developer through Google sign-in for that role's Google account, and calls `storageState({ path })` once the EFCC login form is reachable. Files are gitignored (session cookies are secrets) and regenerated locally whenever a session expires.

   Because the deployment uses `executeAs: USER_DEPLOYING` (per `appsscript.json`), each of the three storage states corresponds to a distinct Google account with its own session — this is a hard requirement, not a convenience; a single shared storage state cannot exercise three different role identities against a `USER_DEPLOYING` deployment. `alice`, `bob`, and `noah` are the EFCC application-layer usernames (Users sheet rows); the underlying Google account performing the sign-in step is a separate credential the developer supplies when running `e2e:auth`.

3. **Test assertions**: `tests/e2e/role-matrix.spec.ts` loads each role's storage state, opens the deployed `/exec` URL, drives the EFCC login form (application-layer PIN, not the Google account), and asserts the navigation matrix from issue #67 AC #2-#8 — phone nav item count/order per role, desktop side-rail completeness, active-section highlighting, forbidden-route recovery.

4. **Artifact target**: each run appends an "Executed results" section to `docs/specs/067-role-nav-acceptance-plan.md` (or the relevant ticket's plan doc for future tickets) with a timestamp, the deployment ID under test, and a per-assertion pass/fail table. This keeps the acceptance evidence diffable in git and colocated with the plan it satisfies, rather than a separate untracked artifacts directory.

5. **CI**: GitHub Actions workflow runs the pipeline on every push. The three storage-state files are stored as base64-encoded repository secrets (`ALICE_STORAGE_STATE`, `BOB_STORAGE_STATE`, `NOAH_STORAGE_STATE`), decoded to `.auth/*.storage.json` at job start, deleted at job end. A secret's cookie can expire independently of the others — no combined blob — so rotating one role's session does not require re-uploading all three.

6. **Expiry handling**: when a stored Google session cookie has expired, the affected role's test fails loud with an explicit message ("storage state expired for role <X> — run `npm run e2e:auth -- --role=<X>` locally and update the `<X>` repo secret"). No silent skip, no soft-pass. A red CI badge with a clear cause beats a green badge hiding a broken auth fixture.

7. **Governing policy update**: AGENTS.md's "Implementation verification workflow — headless browser gate" section is rewritten to reference this pipeline as the primary execution mechanism (superseding ad-hoc Orca `browser`-tool runs for anything requiring login), while keeping Orca available as an interactive fallback for exploratory / one-off debugging outside the pipeline.

## Consequences

- Every future ticket touching login-gated behavior gets a repeatable, CI-enforced acceptance run instead of a one-time manual trace that goes stale the moment the next deploy ships.
- Adds Playwright as a new devDependency and a new `tests/e2e/` surface the team must maintain — a second testing framework alongside vitest (`tests/gas/`).
- Three Google accounts (or three sets of app-credentials under a shared/family Google account structure) must exist and remain valid indefinitely; this is an operational dependency outside the codebase (unlike `tests/gas/`'s fully self-contained vm mocks).
- Storage-state secrets are a security-sensitive CI asset — rotation discipline (re-run `e2e:auth`, re-encode, update secret) is now a required maintenance task, not optional.
- The Orca `browser` tool remains useful for cold-start / no-login CSS and layout assertions (as demonstrated this session for the mobile-sidebar and scroll-lock bugs) — those do not require this pipeline and should continue to use the lighter-weight Orca flow rather than spinning up Playwright for a login-free check.

## Alternatives considered

- **Orca `browser` tool alone, no new pipeline**: rejected — confirmed this session to be structurally incapable of passing the Google sign-in wall for post-login RPC assertions; not a CI-capable or repeatable mechanism.
- **Mocked session injection into `localStorage`** (bypassing real login): considered as a faster path to client-side nav-rendering proof, but explicitly rejected earlier in this session's code review because it does not exercise the real server-side `api_loginUser` → `api_restoreApp` path and would produce false confidence about AC #12 ("versioned isolated development `/exec` demonstrates the navigation matrix").
- **Single combined storage-state secret**: rejected in favor of three separate secrets — smaller blast radius on rotation, matches the natural "one identity per role" boundary.
