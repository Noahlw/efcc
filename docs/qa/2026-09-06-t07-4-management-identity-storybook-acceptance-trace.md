# T07.4 Management/Identity Storybook acceptance trace

**Ticket:** T07.4 / #569
**Scope:** Management/Identity presentation catalog only; no redesign,
permission/domain migration, backend change, or Attendance/T07.5 coverage.
**Status:** `CHECKPOINT_GREEN`

## Code-backed meaningful-screen audit

The existing T07.1 Management Hub Stories remain the Hub baseline. T07.4 adds
the distinct query-driven compositions below using the production Management
page and its live module components.

| Screen | Production intent/component | Persona | Baseline PSN | Gap |
|---|---|---|---|---|
| Account Directory | `module=accounts` / `AccountDirectoryPanel` | Synthetic authorized Manager | `PSN-MGMT-ACCOUNT-DIRECTORY` | None |
| Account Access | `module=accounts&account=…&view=access` / `AccountAccessPanel` | Synthetic authorized Manager | `PSN-MGMT-ACCOUNT-ACCESS` | None |
| Approval Queue | `module=approvals` / `ApprovalQueue` | Synthetic authorized Manager | `PSN-MGMT-APPROVAL-QUEUE` | None |
| Approval Detail | `module=approvals&request=…` / `ApprovalDetail` | Synthetic authorized Manager | `PSN-MGMT-APPROVAL-DETAIL` | None |
| Member Directory | `module=members` / `MemberDirectoryPanel` | Synthetic authorized Manager | `PSN-MGMT-MEMBER-DIRECTORY` | None |
| Home CMS Editor | `module=home-content` / `HomeContentEditor` | Synthetic authorized Manager | `PSN-MGMT-HOME-CMS` | None |
| Permission Editor | `module=permissions` / `PermissionEditorPanel` | Synthetic authorized Manager | `PSN-IDENTITY-PERMISSION-EDITOR` | None |
| Role Hierarchy | `module=roles` / `RoleHierarchyPanel` | Synthetic authorized Manager | `PSN-IDENTITY-ROLE-HIERARCHY` | None |
| Settings Hub | `module=settings` / `SettingsHub` | Synthetic authorized Manager | `PSN-MGMT-SETTINGS-HUB` | None |
| Check-in Settings | `module=checkin-settings` / `CheckinSettings` | Synthetic authorized Manager | `PSN-MGMT-CHECKIN-SETTINGS` | None |
| Timezone Settings | `module=timezone-settings` / `TimezoneSettings` | Synthetic authorized Manager | `PSN-MGMT-TIMEZONE-SETTINGS` | None |

Attendance/operator presentation remains T07.5. Management Hub is reused from
T07.1 rather than duplicated.

## Acceptance evidence

- [x] Every audited Management/Identity screen resolves from Screen Catalog to
  one owning Story/PSN declaration.
- [x] Stories use the authorized synthetic Manager persona and deterministic
  system-boundary MSW only.
- [x] Production Management page/components, shell/providers, styling, and
  local primitives are reused; no `/prototype` code is imported.
- [x] Focused Storybook interaction/a11y checks pass.
- [x] Storybook import/build and catalog integrity pass.
- [x] Standards and Spec reviews pass.
- [x] One owning T07.4 checkpoint commit exists on the shared branch.

## Machine evidence

- `pnpm typecheck` — PASS (`tsconfig.json`, `tsconfig.worker.json`).
- `pnpm test:t07:foundation` — PASS, 4 files / 9 tests.
- `pnpm test:storybook` — PASS, 4 files / 32 browser stories.
- `pnpm test` — PASS, 44 files / 606 tests.
- `pnpm storybook:build` — PASS on Storybook `10.6.0`.
- Final Standards review — PASS.
- Final Spec review — PASS.

## Scope guard

No human workshop-fidelity approval, hard pixel baseline, `STACK_GREEN` claim,
PR merge, or T07.5–T07.6 implementation is claimed by this child.
