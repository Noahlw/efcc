# EFCC Project Guidance

## Docs-Backed (Apps Script)

- Ground every Apps Script call, manifest key, or clasp directive in official docs via Context7 (`/websites/developers_google_apps-script`) → `developers.google.com` → clasp docs. Community sources banned as primary evidence.
- Surface missing official docs as blocking question. Status stays `Proposed` until verified + minimal test + fresh deployed `/exec` IFRAME smoke test pass.

## Headless-Gate (Verification)

- Web app changes require an acceptance trace written BEFORE implementation (mechanical edits exempt).
- Authenticated E2E = Playwright against the standing dev-testing worker (local runs, no secrets; ask the user before building E2E at spec completion). Unauthenticated/CSS checks use Orca `browser` (`Stateless-Wall` blocks Orca on authenticated RPCs).
- 100% pass on a fresh `/exec` deployment is required before `READY`. The rebuilt Next/D1 release also requires its authenticated E2E to run against a fresh reserved `efcc-auth-*` `*.workers.dev` URL (`AUTH_TARGET_URL`) via the Playwright `auth-d1` pipeline; never reuse the stale `efcc-prototype-129` host. Assert every criterion via observable DOM state (never assume a click worked). Pipeline appends results to ticket plan (per `ADR-0012`).

## Sheet-Immutable (Database Safety)

- Google Sheet DB is read-only for agents. State exact sheet/columns/rows; ask user to edit manually.
- E2E Exception: CI may reset `E2E_` prefixed rows in `Programs`/`Program_Leaders` via Sheets API per `ADR-0013`. Snapshot before write, restore after; fail-closed on missing/duplicate `E2E_` IDs. `Users` tab is strictly immutable.
