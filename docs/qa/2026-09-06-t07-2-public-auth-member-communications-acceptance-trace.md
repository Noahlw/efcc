# T07.2 Public/Auth/Member/Communications Storybook acceptance trace

## Current repair addendum — 2026-09-07

The legacy-PIN credential upgrade remains owned by `auth-sign-in` and is not a second route. Current repair coverage adds the supporting `PSN-AUTH-SIGN-IN-CREDENTIAL-UPGRADE` Story, which reaches the real production upgrade form through a synthetic system-boundary login response. The independent Screen Catalog still has one `auth-sign-in` obligation and retains the stable primary `PSN-AUTH-SIGN-IN-DEFAULT`.

**Ticket:** T07.2 / #567
**Scope:** Baseline Storybook catalog only; no route redesign, backend change, or T07.3–T07.6 work.
**Status:** `CHECKPOINT_GREEN`

## Auth credential-upgrade classification

`web/app/page.tsx` renders the legacy-PIN to new-credential flow as the
transient `view.kind === "UPGRADE"` state inside the `/` `LoginPage`. It is
not a separately routable meaningful screen, so the Screen Catalog does not
create a second PSN for it; the sign-in boundary remains the owning
presentation authority.

## Authority and intended seams

The baseline Stories use the shipped route/page components and the existing
`AppShell`, `AppProvider`, local primitives, tokens, and global styling. MSW
is used only at the genuine same-origin HTTP boundaries needed by those
components. Fixtures are synthetic and deterministic; no production/member
records or credentials are copied.

Storybook/Vitest owns baseline render and small interaction/a11y checks. The
real app remains authoritative for authentication, routing/session behavior,
authorization, Worker/D1 behavior, and production navigation integration.

## Code-backed screen audit

| Screen | Production source | Baseline PSN | Story | Gap |
|---|---|---|---|---|
| Sign-in/auth boundary | `web/app/page.tsx` | `PSN-AUTH-SIGN-IN-DEFAULT` | T07.2/Auth/SignIn | None |
| Registration | `web/app/register/page.tsx` | `PSN-AUTH-REGISTER-DEFAULT` | T07.2/Auth/Register | None |
| Home | `web/app/home/page.tsx` | `PSN-MEMBER-HOME-DEFAULT` | T07.2/Member/Home | None |
| Profile | `web/app/profile/page.tsx` | `PSN-MEMBER-PROFILE-DEFAULT` | T07.2/Member/Profile | None |
| Account Settings | `web/app/profile/settings/page.tsx` | `PSN-MEMBER-ACCOUNT-SETTINGS` | T07.2/Member/AccountSettings | None |
| Notices | `web/app/notices/page.tsx` | `PSN-COMMS-NOTICES-DEFAULT` | T07.2/Communications/Notices | None |
| Messages | `web/app/messages/page.tsx` | `PSN-COMMS-MESSAGES-DEFAULT` | T07.2/Communications/Messages | None |
| Not-found recovery | `web/app/not-found.tsx` | `PSN-PUBLIC-NOT-FOUND` | T07.2/Public/NotFound | None |

Redirect-only aliases and query parameters remain within their owning screen.
Guest check-in, scanner, attendance, Programs, and Management/Identity
surfaces remain owned by later T07 children.

The remaining route inventory is intentionally deferred by family ownership:
`/events`, `/programs`, and `/registrations` are Programs-family coverage;
`/permissions` and the non-hub Management modules are Management/Identity;
`/scanner` and `/guest-check-in` are Attendance/Scanner/Guest. They are not
Screen Catalog gaps for this child.

## Acceptance evidence to complete

- [x] Every audited screen has a resolvable Screen Catalog entry and baseline
  Story declaration.
- [x] Baseline Stories use synthetic deterministic fixtures and have no
  uncaught errors or unhandled genuine HTTP requests.
- [x] Authenticated screens reuse the production shell/provider path.
- [x] Focused Storybook interaction and cheap accessibility checks pass.
- [x] Storybook import/build and catalog integrity checks pass.
- [x] Standards and Spec reviews pass for the T07.2 diff.
- [x] One owning T07.2 commit exists on the shared T07 branch.

## Machine evidence

- `pnpm typecheck` — PASS (`tsconfig.json`, `tsconfig.worker.json`).
- `pnpm test:t07:foundation` — PASS, 3 files / 7 tests.
- `pnpm test:storybook` — PASS, 2 files / 12 browser stories.
- `pnpm test` — PASS, 44 files / 606 tests.
- `pnpm storybook:build` — PASS on Storybook `10.6.0`.
- Storybook server — PASS at `http://127.0.0.1:6006`.
- Representative browser review — Home Story rendered through the production
  shell and synthetic HTTP seams at:
  `http://127.0.0.1:6006/iframe.html?id=t07-2-public-auth-member-communications--home&viewMode=story`.
- Root `pnpm check` remains a pre-existing repository-wide failure with
  unrelated findings; no T07.2 file was reported as an error in that run.
- Final Standards review — PASS.
- Final Spec review — PASS after removing the unused participant-detail seam.
- Owning commit — this T07.2 checkpoint commit.

## Scope guard

No hard pixel baseline, human visual approval, `STACK_GREEN` claim, or
T07.3–T07.6 implementation is part of this child checkpoint.
