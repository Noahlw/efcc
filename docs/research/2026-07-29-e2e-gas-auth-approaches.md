# E2E Auth Approaches for GAS Web App on Personal Gmail

**Date**: 2026-07-29
**Status**: Research complete — recommendation at bottom

## Context

EFCC web app deployed on a **personal Gmail account** (`aiacc2003@gmail.com`).
Manifest: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`.
In practice, Google requires Google account sign-in to access the `/exec` URL —
`ANYONE_ANONYMOUS` is ignored on personal accounts. This is consistent with
community reports (Stack Overflow, Google Groups).

The app uses `google.script.run` for all RPC — this bridge requires the
browser to hold a valid Google session cookie for the GAS iframe to function.

## Approaches evaluated

### 1. Playwright storageState capture (current implementation)

**How it works**: `auth.ts` opens headful Chromium → developer signs into Google
manually → script detects EFCC app at `#app[data-app-state="SIGNED_OUT"]` →
captures `context.storageState()` → saves to `.auth/<role>.storage.json`.
Playwright config loads `storageState` per project (alice/bob/noah).
E2E tests use the EFCC app's own login form (username + PIN) per role.

**Status**: `tests/e2e/auth.ts` exists and is architecturally correct.
**Blockers found in practice**:
- Google detects Playwright automation even with
  `--disable-blink-features=AutomationControlled`. The sign-in page shows
  "This browser or app may not be secure."
- The browser page/context closes during Google's OAuth redirect flow,
  crashing `page.waitForTimeout()` in the app-detection polling loop.
- `launchPersistentContext` was tried as an alternative but the same
  browser-close issue occurred.

Source: Playwright official docs — [Authentication](https://playwright.dev/docs/auth)

### 2. Persistent browser context

**How it works**: `chromium.launchPersistentContext(userDataDir)` creates a real
Chrome profile directory. Sign in once, cookies persist in the profile across
launches. No `storageState` capture needed — the profile IS the state.

**Status**: **VIABLE but untested end-to-end**.
- The profile directory was successfully created (63MB at `.auth/profile/`).
- User completed Google sign-in in the headful window.
- When reopened headlessly, the profile showed "signed into Google" but the
  GAS app's iframe content didn't render (`#app` not found in any frame).
- This may be because the iframe requires specific origin cookies that the
  persistent profile didn't have, or because the Google session was for
  `copperboostme@gmail.com` while the deployment runs as `aiacc2003@gmail.com`.

Source: Playwright docs — [Persistent context](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)

### 3. System Chrome profile copy

**How it works**: Copy the developer's real Chrome profile (`~/Library/Application Support/Google/Chrome/Default`) and use `launchPersistentContext` with it.

**Status**: **REJECTED** — Chrome stores cookies in an encrypted SQLite database.
The encryption key is in the macOS Keychain. Playwright/Puppeteer cannot
decrypt the cookies from a copied profile.

### 4. Service account / OAuth2 token

**How it works**: Use a Google Cloud service account with OAuth2 to obtain an
access token, pass as `Authorization: Bearer` header.

**Status**: **REJECTED for this project**.
- Service accounts require Google Workspace domain-wide delegation.
- Personal Gmail accounts cannot use domain-wide delegation.
- GAS web app `/exec` endpoints don't accept Bearer token authentication —
  they use Google's cookie-based session auth.
- The `google.script.run` bridge inside the HTML Service iframe has no
  mechanism to inject a Bearer token.

Source: [Google Apps Script service account guide](https://developers.google.com/apps-script/guides/service-account)

### 5. Browserbase / managed cloud browsers

**How it works**: Browserbase provides cloud-hosted Chromium instances with
persistent profiles. Google sign-in happens once on their infrastructure;
subsequent sessions reuse the profile.

**Status**: **VIABLE but costly**. ~$0.50/hour. Overkill for a church management
app with a single developer. Not recommended.

### 6. Google Chrome remote debugging

**How it works**: Start Chrome with `--remote-debugging-port=9222`, connect
Playwright via `browserType.connectOverCDP()`. Use the developer's
already-signed-in Chrome session.

**Status**: **UNVERIFIED**. Requires Chrome to be launched with the flag.
May work for local testing but not for CI.

## Recommendation

**The storageState approach (option 1) is the correct architecture.**
The implementation is sound. The blocker is purely operational:
Google's anti-automation detection during manual sign-in.

### Immediate fix: make auth.ts more resilient

1. **Catch page-closure errors** in the polling loop (already patched in this session).
2. **Listen for new pages** — Google's sign-in may open a new window:
   ```ts
   const pagePromise = context.waitForEvent('page');
   // Google sign-in may open a popup; capture it
   ```
3. **Use `page.waitForURL`** instead of polling `page.frames()`.
   Wait for the URL to return to `script.google.com/macros/s/.../exec`
   after Google sign-in completes.
4. **Longer timeout with user-friendly messaging** — the current 300s timeout
   is fine, but the error message should say "DO NOT close the browser."

### If storageState capture still fails: fall back to persistent context

If Google's automation detection keeps blocking Playwright Chromium,
use `launchPersistentContext` with a persistent profile directory.
The user signs in once through the persistent context (headful).
All subsequent test runs open the same profile headlessly.
No `storageState` file needed — the profile IS the state.

This requires changing the Playwright config to use persistent context
instead of `storageState` paths, which is a larger refactor but
eliminates the capture step entirely.

### CI workflow

The CI workflow (`e2e.yml`) decodes base64 storage-state secrets.
This is correct and standard. The storage state must be regenerated
locally when Google cookies expire (every few weeks/months).
