# #650 Knip reports and evidence-based cleanup ledger

Pinned dev-only Knip `6.38.0` (exact). Docs: Context7 quota was still
exhausted (as on 2026-09-25), so CLI/config behavior below is sourced from
the current official primary docs at knip.dev (configuration,
production-mode, configuration-hints, monorepos-and-workspaces,
reference/configuration, reference/plugins/{next,wrangler}).

## Commands (root `package.json`)

- `pnpm knip` — default analysis. Gate: wired into `pnpm verify`
  (outside fast pre-commit; full graph scans stay out of `verify:fast`).
- `pnpm knip:production` — production analysis. Separate advisory signal
  (see scope finding). Not gated: it cannot see plugin-claimed files.
- Env shims in both commands (`STORYBOOK_PORT`,
  `PROGRAMS_CANDIDATE_SHA`, `PROGRAMS_VISUAL_ARTIFACT_DIR`) satisfy
  config-file evaluation only; they change no product behavior.
- `apps/web/.storybook/main.ts` robustness fix (`import.meta.dirname`
  fallback to module URL): Knip's loader provides no `dirname`, which
  blinded the Storybook plugin (stories/addons unregistered). Behavior
  under Node is unchanged.

## Configuration (`knip.jsonc`, `treatConfigHintsAsErrors: true`)

Workspaces `.` and `apps/web`. Root entries cover runnable/tested code the
script parser cannot see (Playwright `--config=` files, `serve-static.ts`
via webServer command strings, manual CLI tools `plan-doc-appender.ts` and
`tests/e2e/inspect-local-identity-schema.ts`). `worker.ts` stays a Wrangler
plugin entry; Next/Vitest/Playwright/Storybook/Tailwind/MSW entries are
automatic. Generated `mockServiceWorker.js` is ignored (never delete).
`cloudflare` is ignored (runtime `cloudflare:workers`/`cloudflare:test`
builtins, no npm package). All configuration hints are resolved (zero);
any new hint fails the gate.

## Production-scope finding (empirical, Knip 6.38.0)

`!`-suffixed user entries only take effect outside plugin-claimed paths
(proven: `lib/nav-bar.tsx!` and `lib/utils.ts!` register; `app/**` and
`worker.ts` do not, with plugins enabled or disabled, via workspace entry
or plugin entry override). Plugin-claimed shipped files therefore do not
carry production status. Consequence: `--production` today reports
production-unreached dependencies rather than dead shipped code, so it
stays advisory; the default analysis is the enforcement gate. Revisit when
Knip ships production status for plugin entries.

## Ratchet

- Default analysis + hints-as-errors is the gate: any NEW unused
  file/export/dependency not covered here fails `pnpm verify`.
- No blanket `ignoreIssues`: confirmed-existing findings are either
  deleted per this ledger (#652 executes) or kept by precise config
  (entries, generated ignore, proven-invisible imports).
- This ledger shrinks by executing its DELETE/UN-EXPORT rows; each row
  cites entrypoint/import/test/story/seed/URL/generated/docs/historical
  evidence. Knip output is a lead, never a deletion proof.

## KEEP (proven live, configured)

- Entries: e2e `*.config.ts` (Playwright `--config=`), `serve-static.ts`
  (geometry webServer), `plan-doc-appender.ts` + `inspect-local-identity-schema.ts`
  (manual CLIs documented in tests/e2e/README.md and s4-phase-f trace).
- Generated: `.storybook/public/mockServiceWorker.js` (`msw init` output).
- Knip-invisible live imports: `tailwindcss` + `tw-animate-css` (CSS
  `@import` in `app/globals.css`), `@storybook/addon-a11y`
  (`.storybook/main.ts` addons), `cloudflare:workers`/`cloudflare:test`
  (workerd builtins, 24 sites).
- Registry/string classifiers are NOT existence proofs and NOT usage
  either: ratchet `*_EXPORTS` sets and census `cardTags` classify import
  specifiers found in audited files; removing an unused export does not
  break them (verified call sites in `presentation-override-ratchet.ts`
  and `t09-frontier-census.mjs`).

## DELETE-FILE in #652 (zero live references each)

- `apps/web/components/ui/accordion.tsx`, `scroll-area.tsx`, `table.tsx`,
  `tooltip.tsx` — vendored shadcn primitives; zero importers repo-wide
  (Knip + word search). Used primitives (card/alert/dialog/…) stay.
- `apps/web/lib/programs/programs-manager.tsx` — zero importers and zero
  name references outside itself.
- `tests/e2e/qa-adversarial-hunter.ts`, `tests/e2e/qa-audit-runner.ts` —
  unreferenced manual harnesses (last touched by an artifact-rescue sync);
  no package.json script, doc, or importer cites them.
- `apps/web/lib/screen-foundations.tsx` — zero file references; all 12
  exports definition-only.

## DELETE-DEP in #652

- `shadcn` (`apps/web/package.json`) — CLI never invoked (no script, doc,
  or command cites it); only the `$schema` URL in `components.json`
  mentions shadcn. Knip is silent on it; evidence is manual.

## Per-export actions (execute in #652)

Actions: `DELETE-BARREL-LINE` (drop re-export), `DELETE-RE-EXPORT`
(catalog re-export), `UN-EXPORT` (used in-file only; drop `export`),
`DELETE-CODE` (dead; remove). Duplicated types across the worker/client
boundary (e.g. `ManagementAttentionItem`, `RecurrenceTag`,
`ParticipantNoticeKind`) are NOT consolidated here: each file keeps the
copy it uses; only the unused duplicate goes. `HK_TIME_ZONE` stays defined
in both `hk-time.ts` and `recurrence.ts` (each used internally) with the
export dropped on both.

### `apps/web/.storybook/attendance-scanner-guest-fixtures.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `ATTENDANCE_ADDITION_MEMBER` | value | **UN-EXPORT** | used 2x inside own file only |
| `ATTENDANCE_EVENT` | value | **UN-EXPORT** | used 14x inside own file only |
| `ATTENDANCE_EVENT_SUMMARY` | value | **UN-EXPORT** | used 4x inside own file only |
| `ATTENDANCE_MEMBER` | value | **UN-EXPORT** | used 4x inside own file only |
| `ATTENDANCE_POST_EVENT` | value | **UN-EXPORT** | used 8x inside own file only |
| `ATTENDANCE_POST_EVENT_EXPECTED_ROWS` | value | **UN-EXPORT** | used 4x inside own file only |
| `ATTENDANCE_ROW` | value | **UN-EXPORT** | used 5x inside own file only |

### `apps/web/.storybook/management-hub-fixtures.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `AUTH_ME_RESULT` | value | **UN-EXPORT** | used 2x inside own file only |
| `STORYBOOK_USER` | value | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/.storybook/management-hub-story-ids.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `MANAGEMENT_HUB_STORYBOOK_ID` | value | **UN-EXPORT** | used 5x inside own file only |

### `apps/web/.storybook/management-hub-structured-failure.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `BROKEN_MANAGEMENT_HUB_FIXTURE` | value | **UN-EXPORT** | used 12x inside own file only |

### `apps/web/.storybook/presentation-catalog.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `FoundationPresentationMetadata` | type | **DELETE-RE-EXPORT** | catalog re-export; stories/tests import origin ./presentation-meta |
| `PresentationMetadata` | type | **DELETE-RE-EXPORT** | catalog re-export; stories import origin ./presentation-meta |
| `PresentationStoryDeclaration` | type | **DELETE-RE-EXPORT** | catalog re-export; origin ./presentation-meta is the live source |
| `discoverPresentationDeclarations` | function | **UN-EXPORT** | used 8x inside own file only |

### `apps/web/.storybook/presentation-meta.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `PresentationBaseline` | type | **UN-EXPORT** | used 3x inside own file only |
| `PresentationLifecycle` | type | **UN-EXPORT** | used 3x inside own file only |
| `ResolvedPresentationMetadata` | type | **UN-EXPORT** | used 2x inside own file only |
| `ResolvedScreenPresentationMetadata` | type | **UN-EXPORT** | used 4x inside own file only |
| `ScreenPresentationMetadata` | interface | **UN-EXPORT** | used 3x inside own file only |

### `apps/web/app/management/directory-frame.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `DirectoryFrameFocus` | interface | **UN-EXPORT** | used 2x inside own file only |
| `DirectoryFramePagination` | interface | **UN-EXPORT** | used 3x inside own file only |
| `DirectoryListSlot` | type | **UN-EXPORT** | used 2x inside own file only |
| `DirectorySelection` | interface | **UN-EXPORT** | used 4x inside own file only |
| `DirectoryVirtualization` | interface | **UN-EXPORT** | used 3x inside own file only |

### `apps/web/app/management/management-action-framework.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `actionSurfaceVariants` | value | **UN-EXPORT** | used 3x inside own file only |

### `apps/web/app/management/settings-ui.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `BackIcon` | function | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/app/profile/account-settings.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `ACCOUNT_UPDATED_KEY` | value | **UN-EXPORT** | external refs: ['apps/web/app/page.tsx'] [reviewed: decided by internal-use count] |

### `apps/web/components/ui/alert-dialog.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `AlertDialogMedia` | value | **UN-EXPORT** | used 2x inside own file only |
| `AlertDialogOverlay` | value | **UN-EXPORT** | external refs: ['apps/web/.storybook/foundations.stories.tsx', 'apps/web/lib/governance/presentation-override-ratchet.ts'] [reviewed: decided by internal-use count] |
| `AlertDialogPortal` | value | **UN-EXPORT** | used 4x inside own file only |
| `alertDialogContentVariants` | value | **UN-EXPORT** | used 4x inside own file only |

### `apps/web/components/ui/alert.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `AlertAction` | value | **UN-EXPORT** | used 2x inside own file only |
| `AlertAnnouncement` | type | **UN-EXPORT** | used 2x inside own file only |
| `AlertTone` | type | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/components/ui/badge.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `badgeVariants` | value | **UN-EXPORT** | used 4x inside own file only |

### `apps/web/components/ui/calendar.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `CalendarProps` | type | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/components/ui/card.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `CardAction` | value | **UN-EXPORT** | external refs: ['scripts/t09-frontier-census.mjs'] [reviewed: decided by internal-use count] |
| `CardDescription` | value | **UN-EXPORT** | external refs: ['scripts/t09-frontier-census.mjs'] [reviewed: decided by internal-use count] |

### `apps/web/components/ui/checkbox.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `checkboxVariants` | value | **UN-EXPORT** | used 4x inside own file only |

### `apps/web/components/ui/dialog.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `DialogClose` | value | **UN-EXPORT** | used 2x inside own file only |
| `DialogOverlay` | value | **UN-EXPORT** | external refs: ['apps/web/.storybook/foundations.stories.tsx', 'apps/web/lib/governance/presentation-override-ratchet.ts'] [reviewed: decided by internal-use count] |
| `DialogPortal` | value | **UN-EXPORT** | used 4x inside own file only |

### `apps/web/components/ui/popover.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `PopoverAnchor` | value | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/components/ui/screen-card.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `ScreenCardPrimitiveProps` | interface | **UN-EXPORT** | used 2x inside own file only |
| `ScreenCardPrimitiveTone` | type | **DELETE-CODE** | definition-only; zero references repo-wide |

### `apps/web/components/ui/screen-controls.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `ScreenFilterChipPrimitiveProps` | type | **UN-EXPORT** | external refs: ['apps/web/lib/screen-foundations.tsx']; screen-foundations.tsx ref dies with that file |
| `ScreenIconButtonPrimitiveProps` | interface | **UN-EXPORT** | external refs: ['apps/web/lib/screen-foundations.tsx']; screen-foundations.tsx ref dies with that file |
| `ScreenIconButtonPrimitiveTone` | type | **DELETE-CODE** | external refs: ['apps/web/lib/screen-foundations.tsx']; screen-foundations.tsx ref dies with that file |
| `screenFilterChipPrimitiveVariants` | value | **UN-EXPORT** | external refs: ['apps/web/lib/screen-foundations.tsx']; screen-foundations.tsx ref dies with that file |

### `apps/web/components/ui/select.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `SelectGroup` | value | **UN-EXPORT** | used 2x inside own file only |
| `SelectLabel` | value | **UN-EXPORT** | used 2x inside own file only |
| `SelectScrollDownButton` | value | **UN-EXPORT** | used 3x inside own file only |
| `SelectScrollUpButton` | value | **UN-EXPORT** | used 3x inside own file only |
| `SelectSeparator` | value | **UN-EXPORT** | used 2x inside own file only |
| `selectTriggerVariants` | value | **UN-EXPORT** | external refs: ['apps/web/lib/governance/presentation-override-ratchet.ts']; screen-foundations.tsx ref dies with that file |

### `apps/web/components/ui/tabs.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `TabsContent` | value | **UN-EXPORT** | used 2x inside own file only |
| `tabsListVariants` | value | **UN-EXPORT** | used 4x inside own file only |

### `apps/web/lib/announcement-detail.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `announcementDetailVariants` | value | **UN-EXPORT** | used 4x inside own file only |

### `apps/web/lib/api.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `PublicIdentitySummary` | interface | **UN-EXPORT** | external refs: ['apps/web/lib/auth/handlers.ts'] [reviewed: decided by internal-use count] |

### `apps/web/lib/approval-queue.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `preserveApprovalSelectionForDetail` | function | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/attendance-scanner-ui.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `ScannerCamera` | value | **DELETE-CODE** | definition-only; zero references repo-wide |
| `ScannerUnavailableNotice` | value | **DELETE-CODE** | definition-only; zero references repo-wide |
| `statusOutputVariants` | value | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/attendance.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `AttendanceExpectedSource` | type | **UN-EXPORT** | used 5x inside own file only |
| `AttendanceMethod` | type | **UN-EXPORT** | used 6x inside own file only |
| `GUEST_NAME_MAX_LENGTH` | value | **UN-EXPORT** | used 5x inside own file only |
| `materializeAttendanceSnapshot` | function | **UN-EXPORT** | external refs: ['apps/web/lib/attendance-operator-panel.tsx', 'apps/web/lib/programs/program-api.ts'] [reviewed: decided by internal-use count] |

### `apps/web/lib/attention-panel.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `AttentionItem` | interface | **UN-EXPORT** | used 3x inside own file only |
| `AttentionNotice` | interface | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/auth/cookies.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `ACCESS_COOKIE_MAX_AGE_SEC` | value | **UN-EXPORT** | used 2x inside own file only |
| `REFRESH_COOKIE_MAX_AGE_SEC` | value | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/check-in-sheet.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `CheckInSheetRow` | interface | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/feed-presentation.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `feedPresentationVariants` | value | **UN-EXPORT** | used 4x inside own file only |

### `apps/web/lib/governance/audit.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `normalizeRepoPath` | function | **UN-EXPORT** | used 13x inside own file only |

### `apps/web/lib/governance/presentation-screen-catalog.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `PresentationScreenLifecycle` | type | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/governance/registries.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `getApprovalPackage` | function | **DELETE-CODE** | definition-only; zero references repo-wide |
| `getNativeException` | function | **DELETE-CODE** | definition-only; zero references repo-wide |
| `getPreservationReference` | function | **DELETE-CODE** | definition-only; zero references repo-wide |
| `getScenario` | function | **DELETE-CODE** | definition-only; zero references repo-wide |
| `getUIContract` | function | **DELETE-CODE** | definition-only; zero references repo-wide |
| `getWaiver` | function | **DELETE-CODE** | definition-only; zero references repo-wide |

### `apps/web/lib/governance/types.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `APPROVAL_KINDS` | value | **UN-EXPORT** | used 2x inside own file only |
| `CANONICAL_VIEWPORTS` | value | **DELETE-CODE** | definition-only; zero references repo-wide |
| `CanonicalViewportWidth` | type | **UN-EXPORT** | used 3x inside own file only |
| `UIContractProbe` | interface | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/guest-context.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `CheckInCredentialKind` | type | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/hk-time.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `HK_TIME_ZONE` | value | **UN-EXPORT** | duplicate const in hk-time.ts and recurrence.ts; each used internally only |

### `apps/web/lib/home-api.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `HomeExploreProgram` | interface | **UN-EXPORT** | used 2x inside own file only |
| `HomeFeaturedEvent` | interface | **UN-EXPORT** | used 2x inside own file only |
| `HomeResponse` | interface | **DELETE-CODE** | definition-only; zero references repo-wide |

### `apps/web/lib/home-handlers.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `HomeAnnouncementDto` | interface | **UN-EXPORT** | used 5x inside own file only |
| `HomeExploreProgramDto` | interface | **UN-EXPORT** | used 3x inside own file only |
| `HomeFeaturedEventDto` | interface | **UN-EXPORT** | used 3x inside own file only |
| `HomeProjectionData` | interface | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/identity/capability-catalog.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `CapabilityGroup` | type | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |
| `CapabilityRisk` | type | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |
| `HIGH_RISK_CAPABILITIES` | value | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |

### `apps/web/lib/identity/index.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `AccountAccessAccount` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `AccountAccessActions` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `AccountAccessAssignableRole` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `AccountAccessIdentity` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `AccountAccessImpact` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `AccountAccessLifecycleImpact` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `AccountAccessMutationInput` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `AccountAccessMutationResult` | type | **DELETE-BARREL-LINE** | origin used directly by 3 file(s); barrel line unused |
| `AccountAccessView` | type | **DELETE-BARREL-LINE** | origin used directly by 6 file(s); barrel line unused |
| `AccountAdminProtectedError` | value | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `AccountRevokeTargetError` | value | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `AccountSelfProtectedError` | value | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `AccountTargetIneligibleError` | value | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `BootstrapIdentity` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `BootstrapIdentitySummary` | type | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 2) |
| `CAPABILITY_CATALOG` | value | **DELETE-BARREL-LINE** | origin used directly by 12 file(s); barrel line unused |
| `Capability` | type | **DELETE-BARREL-LINE** | origin used directly by 14 file(s); barrel line unused |
| `CapabilityMetadata` | type | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `DisposableDatabaseInfo` | type | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `EffectiveAccessGrant` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `EffectiveAccessGroups` | type | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `PROTECTED_STABLE_KEYS` | value | **DELETE-BARREL-LINE** | origin used directly by 6 file(s); barrel line unused |
| `PreflightOutcome` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `ROLE_AUDIT_ACTION` | value | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 3) |
| `ROLE_CATEGORY_KEY` | value | **DELETE-BARREL-LINE** | origin used directly by 5 file(s); barrel line unused |
| `ROLE_HIERARCHY_ACTION` | value | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `ROLE_SCOPE_KIND` | value | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 3) |
| `RoleAssignmentActionAffordance` | type | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 3) |
| `RoleAssignmentRow` | type | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |
| `RoleAuditAction` | type | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |
| `RoleAuditEventRow` | type | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `RoleAuditOutcome` | type | **DELETE-BARREL-LINE** | origin used directly by 3 file(s); barrel line unused |
| `RoleCapabilityCatalogError` | value | **DELETE-BARREL-LINE** | origin used directly by 5 file(s); barrel line unused |
| `RoleCategoryKey` | type | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `RoleCategoryRow` | type | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |
| `RoleCreateInput` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `RoleDefinitionAssignedAccount` | type | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 3) |
| `RoleDefinitionGrantRow` | type | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |
| `RoleDefinitionLifecycleInput` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `RoleDefinitionLifecyclePreview` | type | **DELETE-BARREL-LINE** | origin used directly by 3 file(s); barrel line unused |
| `RoleDefinitionLifecycleResult` | type | **DELETE-BARREL-LINE** | origin used directly by 3 file(s); barrel line unused |
| `RoleDefinitionMutationResult` | type | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `RoleDefinitionRow` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `RoleDesiredChange` | type | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 2) |
| `RoleHierarchyAction` | type | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 2) |
| `RoleHierarchyActionAffordance` | type | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `RoleHierarchyCategory` | type | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 3) |
| `RoleHierarchyScopeOption` | type | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 6) |
| `RoleInvalidTargetError` | value | **DELETE-BARREL-LINE** | origin used directly by 5 file(s); barrel line unused |
| `RoleLifecycleActionAffordance` | type | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 3) |
| `RoleMutationDenialOptions` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `RoleMutationInput` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `RoleMutationOutcome` | type | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 2) |
| `RoleMutationResult` | type | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `RolePolicyMutationRecord` | type | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |
| `RolePolicyRevisionRow` | type | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |
| `RoleProtectedIdentityError` | value | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `RoleRenameInput` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `RoleReorderInput` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `RoleRescopeInput` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `RoleScopeKind` | type | **DELETE-BARREL-LINE** | origin used directly by 5 file(s); barrel line unused |
| `SeedResult` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `UpdateRoleDefinitionGrantsInput` | type | **DELETE-BARREL-LINE** | origin used directly by 1 file(s); barrel line unused |
| `__hierarchyTest` | value | **DELETE-BARREL-LINE** | barrel re-export; no importers via barrel |
| `__mutationsTest` | value | **DELETE-BARREL-LINE** | barrel re-export; no importers via barrel |
| `__seedsTest` | value | **DELETE-BARREL-LINE** | barrel re-export; no importers via barrel |
| `canonicalCreateFingerprint` | value | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 3) |
| `canonicalPermissionFingerprint` | value | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 2) |
| `canonicalReorderFingerprint` | value | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 3) |
| `capabilityMetadata` | value | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `getRoleDefinitionLifecyclePreview` | value | **DELETE-BARREL-LINE** | origin used directly by 7 file(s); barrel line unused |
| `isCapability` | value | **DELETE-BARREL-LINE** | origin used directly by 8 file(s); barrel line unused |
| `loadAccountAccess` | value | **DELETE-BARREL-LINE** | origin used directly by 4 file(s); barrel line unused |
| `loadActorRoles` | value | **DELETE-BARREL-LINE** | origin used directly by 4 file(s); barrel line unused |
| `mutateAccountAssignments` | value | **DELETE-BARREL-LINE** | origin used directly by 7 file(s); barrel line unused |
| `mutateRoleDefinitionLifecycle` | value | **DELETE-BARREL-LINE** | origin used directly by 4 file(s); barrel line unused |
| `normalizeName` | value | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `readCurrentRevision` | value | **DELETE-BARREL-LINE** | origin used directly by 4 file(s); barrel line unused |
| `recordRoleDenial` | value | **DELETE-BARREL-LINE** | origin used directly by 5 file(s); barrel line unused |
| `recordRoleDenialForCreate` | value | **UN-EXPORT** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 14) |
| `reserveRoleMutationConflict` | value | **DELETE-BARREL-LINE** | origin used directly by 3 file(s); barrel line unused |
| `reserveRoleMutationDenial` | value | **DELETE-BARREL-LINE** | origin used directly by 3 file(s); barrel line unused |
| `reserveRoleMutationNoop` | value | **DELETE-BARREL-LINE** | origin used directly by 2 file(s); barrel line unused |
| `resolveActorHighestPosition` | value | **DELETE-CODE** | origin and barrel re-export both unreferenced; DELETE barrel re-export line (origin internal uses: 1) |
| `revokeAccountAssignments` | value | **DELETE-BARREL-LINE** | origin used directly by 9 file(s); barrel line unused |
| `searchEligibleAccounts` | value | **DELETE-BARREL-LINE** | origin used directly by 8 file(s); barrel line unused |
| `updateRoleDefinitionGrants` | value | **DELETE-BARREL-LINE** | origin used directly by 5 file(s); barrel line unused |

### `apps/web/lib/identity/mutations.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `__test` | value | **DELETE-CODE** | dead test-hook objects; live hooks (account-access, preflight) untouched |

### `apps/web/lib/identity/role-hierarchy.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `RoleHierarchyAssignedAccount` | interface | **UN-EXPORT** | used 3x inside own file only |

### `apps/web/lib/notices-api.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `NoticeKind` | type | **UN-EXPORT** | external refs: ['apps/web/lib/approval-detail.tsx', 'apps/web/lib/approval-queue.tsx', 'apps/web/lib/programs/notices-worker.test.ts'] [reviewed: decided by internal-use count] |

### `apps/web/lib/programs/capabilities.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `DEPARTMENT_CAPABILITY` | value | **UN-EXPORT** | used 5x inside own file only |
| `PROGRAM_CAPABILITY` | value | **UN-EXPORT** | used 5x inside own file only |

### `apps/web/lib/programs/department-workspace.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `DepartmentCapabilities` | type | **UN-EXPORT** | external refs: ['apps/web/lib/programs/capabilities.ts'] [reviewed: decided by internal-use count] |
| `MANAGEMENT_ATTENTION_LIMIT` | value | **UN-EXPORT** | used 2x inside own file only |
| `MANAGEMENT_HUB_ENTRY_CARD` | value | **UN-EXPORT** | used 2x inside own file only |
| `MANAGEMENT_HUB_GROUPS` | value | **UN-EXPORT** | used 2x inside own file only |
| `MANAGEMENT_NOTIFICATION_LIMIT` | value | **UN-EXPORT** | used 2x inside own file only |
| `ManagementAttentionItem` | type | **UN-EXPORT** | external refs: ['apps/web/lib/programs/program-api.ts'] [reviewed: decided by internal-use count] |
| `ManagementAttentionProgramView` | interface | **UN-EXPORT** | used 2x inside own file only |
| `ManagementCockpitNextEvent` | interface | **UN-EXPORT** | external refs: ['apps/web/lib/programs/program-api.ts'] [reviewed: decided by internal-use count] |
| `ManagementDepartmentModuleView` | type | **UN-EXPORT** | used 2x inside own file only |
| `ManagementMemberIdentity` | interface | **UN-EXPORT** | used 3x inside own file only |
| `ManagementNotificationItem` | type | **UN-EXPORT** | external refs: ['apps/web/lib/programs/program-api.ts', 'apps/web/lib/programs/program-workspace.test.tsx', 'apps/web/lib/programs/programs-boundary.tsx', 'apps/web/lib/programs/programs-notifications.tsx'] [reviewed: decided by internal-use count] |
| `NOTICE_RETENTION_MS` | value | **UN-EXPORT** | used 3x inside own file only |
| `ParticipantCatalogViewerState` | type | **UN-EXPORT** | external refs: ['apps/web/lib/programs/participant-directory.tsx', 'apps/web/lib/programs/program-api.ts'] [reviewed: decided by internal-use count] |
| `ParticipantEnrollment` | interface | **UN-EXPORT** | external refs: ['apps/web/.storybook/programs-fixtures.ts', 'apps/web/lib/programs/participant-enrollment.test.tsx', 'apps/web/lib/programs/participant-enrollment.tsx', 'apps/web/lib/programs/participant-program-detail.tsx'] [reviewed: decided by internal-use count] |
| `ParticipantEnrollmentRequest` | interface | **UN-EXPORT** | external refs: ['apps/web/.storybook/programs-fixtures.ts', 'apps/web/lib/programs/participant-program-detail.tsx', 'apps/web/lib/programs/program-api.ts'] [reviewed: decided by internal-use count] |
| `ParticipantEventSummary` | interface | **UN-EXPORT** | external refs: ['apps/web/.storybook/programs-fixtures.ts', 'apps/web/lib/programs/participant-enrollment.tsx', 'apps/web/lib/programs/participant-program-detail.tsx', 'apps/web/lib/programs/program-api.ts'] [reviewed: decided by internal-use count] |
| `ParticipantNoticeKind` | type | **UN-EXPORT** | external refs: ['apps/web/lib/programs/workspace-store.ts'] [reviewed: decided by internal-use count] |
| `ParticipantScheduleRule` | interface | **UN-EXPORT** | external refs: ['apps/web/lib/programs/participant-enrollment.tsx', 'apps/web/lib/programs/program-api.ts'] [reviewed: decided by internal-use count] |

### `apps/web/lib/programs/enrollment-approval-run.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `reconcileEnrollmentApprovalItem` | function | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/programs/event-check-in-sheet.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `EventCheckInSheetEvent` | type | **UN-EXPORT** | used 4x inside own file only |

### `apps/web/lib/programs/event-detail.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `EventFactIcon` | value | **UN-EXPORT** | used 3x inside own file only |

### `apps/web/lib/programs/mutation-recovery.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `EventMutationExpected` | interface | **UN-EXPORT** | used 5x inside own file only |

### `apps/web/lib/programs/programs-intent.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `ProgramsMode` | type | **UN-EXPORT** | used 18x inside own file only |

### `apps/web/lib/programs/recurrence.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `Occurrence` | interface | **UN-EXPORT** | external refs: ['apps/web/lib/programs/d1-workspace-store.ts', 'apps/web/lib/programs/management-draft.ts', 'apps/web/lib/programs/workspace-events-task.tsx'] [reviewed: decided by internal-use count] |
| `hkWallDateOf` | function | **UN-EXPORT** | used 4x inside own file only |
| `isWallDate` | function | **UN-EXPORT** | used 2x inside own file only |
| `occurrencesForRule` | function | **DELETE-CODE** | definition-only; zero references repo-wide |

### `apps/web/lib/programs/workspace-context.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `refreshWorkspaceAfterMutation` | function | **DELETE-CODE** | definition-only; zero references repo-wide |

### `apps/web/lib/programs/workspace-store.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `EnrollmentStatus` | type | **UN-EXPORT** | used 2x inside own file only |
| `EventSource` | type | **UN-EXPORT** | used 3x inside own file only |
| `EventStatus` | type | **UN-EXPORT** | used 5x inside own file only |
| `GenerateSkippedOccurrence` | interface | **UN-EXPORT** | used 2x inside own file only |
| `GenerateUnresolvedOccurrence` | interface | **UN-EXPORT** | used 2x inside own file only |
| `GenerationRunItemOutcome` | type | **UN-EXPORT** | used 3x inside own file only |
| `GenerationRunStatus` | type | **UN-EXPORT** | used 3x inside own file only |
| `PreviewSkipReason` | type | **UN-EXPORT** | used 2x inside own file only |
| `RecurrenceTag` | type | **UN-EXPORT** | external refs: ['apps/web/lib/programs/program-api.ts', 'apps/web/lib/programs/recurrence.ts'] [reviewed: decided by internal-use count] |

### `apps/web/lib/registration-client.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `RegistrationQueueResponse` | interface | **UN-EXPORT** | used 2x inside own file only |
| `fetchPendingRegistrations` | function | **DELETE-CODE** | definition-only; zero references repo-wide |

### `apps/web/lib/screen-foundations.tsx`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `ScreenCardTone` | type | **DELETE-CODE** | definition-only; zero references repo-wide |
| `ScreenFilterChipProps` | type | **DELETE-CODE** | definition-only; zero references repo-wide |
| `ScreenHeaderLevel` | type | **UN-EXPORT** | used 2x inside own file only |
| `ScreenIconButtonProps` | type | **DELETE-CODE** | definition-only; zero references repo-wide |
| `ScreenIconButtonTone` | type | **DELETE-CODE** | definition-only; zero references repo-wide |
| `ScreenPageFrameWidth` | type | **UN-EXPORT** | used 2x inside own file only |
| `ScreenRowDensity` | type | **DELETE-CODE** | definition-only; zero references repo-wide |
| `ScreenRowTone` | type | **DELETE-CODE** | definition-only; zero references repo-wide |
| `ScreenStateKind` | type | **UN-EXPORT** | used 2x inside own file only |
| `ScreenStatusTone` | type | **DELETE-CODE** | definition-only; zero references repo-wide |
| `screenFilterChipVariants` | value | **DELETE-CODE** | definition-only; zero references repo-wide |
| `screenIconButtonVariants` | value | **UN-EXPORT** | used 2x inside own file only |

### `apps/web/lib/session.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `DEEP_LINK_KEY` | value | **UN-EXPORT** | used 5x inside own file only |

### `apps/web/lib/use-attendance-flow.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `AttendanceOutcome` | interface | **UN-EXPORT** | used 7x inside own file only |
| `AttendanceView` | type | **UN-EXPORT** | used 3x inside own file only |
| `StatusTone` | type | **UN-EXPORT** | external refs: ['apps/web/lib/assisted-scanner-panel.tsx', 'apps/web/lib/attendance-operator-panel.tsx', 'apps/web/lib/attendance-scanner-ui.tsx'] [reviewed: decided by internal-use count] |

### `tests/e2e/inspect-local-identity-schema.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `main` | function | **UN-EXPORT** | manual CLI (pnpm exec tsx per s4-phase-f trace); file kept + added as Knip entry |

### `tests/e2e/render-phase-f-evidence.ts`

| Export | Kind | Action | Evidence |
| --- | --- | --- | --- |
| `AggregatedEvidence` | interface | **UN-EXPORT** | used 4x inside own file only |
| `PlaywrightAnnotation` | interface | **UN-EXPORT** | used 2x inside own file only |
| `PlaywrightAttachment` | interface | **UN-EXPORT** | used 4x inside own file only |
| `PlaywrightProjectConfig` | interface | **UN-EXPORT** | used 5x inside own file only |
| `PlaywrightSpec` | interface | **UN-EXPORT** | used 3x inside own file only |
| `PlaywrightSuite` | interface | **UN-EXPORT** | used 4x inside own file only |
| `PlaywrightTest` | interface | **UN-EXPORT** | used 4x inside own file only |
| `PlaywrightTestResult` | interface | **UN-EXPORT** | used 4x inside own file only |
| `aggregateEvidence` | function | **UN-EXPORT** | used 4x inside own file only |
| `runEvidenceRenderer` | function | **UN-EXPORT** | used 2x inside own file only |
| `sortEvidenceItems` | function | **UN-EXPORT** | used 2x inside own file only |
| `validateAttachment` | function | **UN-EXPORT** | used 2x inside own file only |
| `validateLoopbackUrl` | function | **UN-EXPORT** | used 2x inside own file only |

## Corrections recorded during #652 execution (2026-09-25)

- `shadcn` dependency: ledger said DELETE-DEP; execution found the live
  CSS import in `apps/web/app/globals.css`. Dependency evidence missed
  `*.css` imports. Corrected to KEEP; the dep was restored. Lesson:
  dep-evidence must cover CSS imports alongside JS/TS imports.
- `apps/web/lib/screen-foundations.tsx`: ledger said DELETE-FILE on a
  stem-grep claiming zero file references, but the stem computation was
  wrong (empty match is not proof). Four live importers exist. File
  RESTORED; its 12 export rows were re-verdict individually. Lesson:
  never delete on an empty match; file-delete evidence requires a
  positively reviewed search.
- Barrel-mediated usage is a Knip blind spot in this repo: exports
  consumed only through `lib/identity/index.ts` re-exports (both
  `import type` via `@/` and value imports in tests) were flagged
  unused. Caught by `tsc` during execution; six exports restored with
  barrel lines. Lesson: `tsc` is the backstop for every deletion batch;
  a green Knip report never overrules a red compiler.
- Cascade rounds 2 and 3 became unused only after earlier deletions;
  triaged individually in the #652 commit.
- The `vitest.setup.ts` unresolved notice is a Knip cwd evaluation
  artifact; fixed at the source with an `import.meta.dirname` fallback.
  Knip default analysis is now clean (exit 0).
