# Programs Prototype-to-Route Fidelity Correction Implementation Plan

> **For agentic workers:** Steps use checkbox (- [ ]) syntax for tracking. <!-- Note: subagent-driven-development and executing-plans skills are not available -->

**Goal:** Repair the existing Programs Screen Foundations stack so the ten retained Storybook baselines exercise the real production route composition and the shipped Programs screens faithfully replay the frozen phone-first prototype without changing server-owned product contracts.

**Architecture:** Introduce one production-owned ProgramsRouteSurface containing the route frame, Suspense fallback, and ProgramsBoundary, then consume that same surface from Next.js and Storybook. Apply the frozen HTML as presentation and approved-workflow authority while retaining the existing Worker/D1, authorization, URL, history, enrollment, event, mutation, conflict, idempotency, and recovery contracts. Qualify the result through deterministic route fixtures, risk-based material-state Stories, focused component tests, Storybook/real-route browser gates, and an owner-L2 stop.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind/CVA Screen Foundations, Storybook 10 with @storybook/nextjs-vite, MSW 2, Vitest/Testing Library, Playwright, Cloudflare Worker/D1, pnpm 11, Node.js 22.18.0.

## Global Constraints

- Execute only after re-reading live branch, PR, issue, CI, and dirty-worktree state. The observed planning baseline on 2026-09-11 is branch codex/programs-screen-foundations/wave-3 at 9ad90d253bfd50bf2bbcea85f39c18c1587b1f88, PR #607 based on wave-2 at e5a05a8, and origin/main at e46cf616fc690f3d191fa435232ba73609b24f79. Treat these SHAs as observations, not permanent authority. Immediately after this planning turn, the only expected worktree change is this untracked plan file.
- Repair open PR #607 in place with append-only logical commits. Do not rebase, force-push, squash, amend an existing commit, create a child repair PR, or change PRs #603, #604, or #606.
- Start from and retain the truthful status CHANGES_REQUIRED / NOT_ROUTE_GREEN. Machine completion may advance only to WAITING_OWNER_L2.
- PR #607 must use non-closing issue references for #590 through #601. Do not merge a PR, close an issue, or claim owner approval as part of this plan.
- The frozen HTML in docs/design/programs-screen-foundations-v1 controls visual hierarchy, composition, information architecture, and the product workflows explicitly represented there.
- The current Worker/D1 transport, server capability filtering, authorization, URL/query/hash schema, browser-history behavior, enrollment and event lifecycle, mutation validation, audit/idempotency, conflict handling, and retry/recovery semantics remain authoritative unless an explicit governing ticket says otherwise.
- Storybook and /programs must render the same production presentation composition. Storybook may supply only deterministic navigation state, time, and MSW-backed server-shaped fixtures; production modules must never import Storybook code.
- Retain the ten existing exported Programs baseline Story names, generated Story IDs, Screen IDs, and PSNs. Their implementation becomes route-composition based. Preserve leaf examples in a separate component-only Story file.
- Do not use gap: null while route composition, material states, responsive evidence, or owner comparison remains incomplete. All ten Programs obligations and baselines stay linked to ISSUE-#601 until genuine owner-L2 closeout.
- Primary visual fidelity viewports are 402x874 and 360x800. Preserve W7 coverage at 320, 390, 600, 799, 800, 1024, and 1440 pixels, with no horizontal overflow, clipped primary action, dock/rail collision, or sub-44px required target. Desktop must remain usable and coherent; desktop pixel polish is deferred.
- Baseline fixtures use realistic Cantonese names, dates, departments, counts, status mixtures, and row density. Do not use a one-row English or year-2099 happy path as the visual baseline.
- Material-state coverage is risk-based, not a full backend cross-product. Do not multiply Stories for combinations that component or contract tests already prove.
- Preserve current accessibility contracts: one main route frame, logical heading order, semantic status text, aria-current navigation, named icon buttons, visible focus, live announcements, focus restoration, and minimum 44x44 interactive targets.
- Use fnm exec --using 22.18.0 for repository commands that load the application or tests.
- Every behavior change begins with a regression assertion that fails against the pre-change code for the intended reason. Run the focused red assertion before production edits, make the smallest production change, then run focused green and the task-level gate.
- Reuse ScreenPageFrame, ScreenHeader, ScreenSection, ScreenRow, ScreenState, ScreenStatus, ScreenEditor, ProgramsBoundary, WorkspaceRouteProvider, existing API clients, and current error-copy mapping. Do not introduce a second design system, route state machine, authorization projection, or notification feed.
- Any unexpected API need, URL change, capability widening, domain-state invention, or database change is a stop condition. Record it as a gap rather than smuggling it into this presentation repair.

## File Structure & Changes

### New files

| File | Responsibility |
| --- | --- |
| web/lib/programs/programs-route-surface.tsx | Production-owned ScreenPageFrame + Suspense + ProgramsBoundary composition used by both /programs and Storybook |
| web/lib/programs/programs-route-surface.test.tsx | Pins route frame, fallback, boundary ownership, and the absence of Storybook dependencies |
| web/.storybook/programs-story-harness.tsx | Test-only AppShell wrapper around ProgramsRouteSurface; accepts no domain records |
| web/.storybook/programs-components.stories.tsx | Preserves direct leaf-component examples as explicitly component-only development Stories |
| web/.storybook/programs-material-states.stories.tsx | Risk-based supporting Stories driven through ProgramsRouteSurface and deterministic MSW scenarios |
| web/lib/programs/workspace-events-task.test.tsx | Focused Events/Schedule presentation and preview/generate lifecycle regressions |
| docs/qa/2026-09-11-programs-route-fidelity-correction.md | Command, Story, viewport, route, fixed-point review, limitation, and status evidence for the corrected candidate |

### Existing files with planned edits

| Area | Files | Responsibility |
| --- | --- | --- |
| Route composition | web/app/programs/page.tsx; web/vitest.components.config.ts | Make the page a thin AppShell consumer and include new component tests |
| Story governance | web/.storybook/programs.stories.tsx; web/.storybook/programs-fixtures.ts; web/.storybook/programs-presentation-contract.ts; web/.storybook/programs-presentation-contract.test.ts; web/.storybook/programs-presentation-contract.test.tsx; web/.storybook/programs.story-manifest.ts; web/.storybook/presentation-catalog.ts; web/.storybook/presentation-catalog.test.ts; web/lib/governance/presentation-screen-catalog.ts | Keep the ten identities, require truthful route composition, support explicit open-gap references, and supply deterministic scenarios |
| Shared shell | web/app/globals.css; web/lib/shell/shell-breakpoint.test.tsx; web/lib/shell/shell-tokens.test.tsx; web/lib/shell/authenticated-shell.test.tsx; tests/e2e/shell-geometry.test.ts | Replace the phone solid active tile with the frozen indicator treatment without changing nav semantics or the desktop rail |
| Route orchestration | web/lib/programs/programs-boundary.tsx; web/lib/programs/programs-boundary.test.tsx; web/lib/programs/programs-management-boundary.test.tsx; web/lib/programs/workspace-context.tsx | Put the contextual notification trigger in ScreenHeader.action and preserve routing/history/resource ownership |
| Participant screens | web/lib/programs/participant-directory.tsx; web/lib/programs/participant-directory.test.tsx; web/lib/programs/participant-program-detail.tsx; web/lib/programs/participant-program-detail.test.tsx; web/lib/programs/participant-enrollment.tsx; web/lib/programs/participant-enrollment.test.tsx; web/lib/programs/participant-event-detail-page.tsx; web/lib/programs/participant-event-detail-page.test.tsx | Replay member/capable directory, compact state-aware enrollment action region, and closed/open/ineligible Event Detail |
| Management screens | web/lib/programs/management-directory.tsx; web/lib/programs/management-directory.test.tsx; web/lib/programs/program-workspace.tsx; web/lib/programs/program-workspace.test.tsx; web/lib/programs/workspace-events-task.tsx; web/lib/programs/event-detail.tsx; web/lib/programs/event-detail.test.tsx | Aggregate authorized Programs, remove the Overview edit bypass, make Events operations-first, and converge focused detail headers |
| Participants/Settings/Notifications | web/lib/programs/workspace-participants-task.tsx; web/lib/programs/workspace-settings-task.tsx; web/lib/programs/program-settings.tsx; web/lib/programs/program-settings.test.tsx; web/lib/programs/programs-notifications.tsx; web/lib/programs/programs-notifications.test.tsx | Pending-first participant operations, Settings-only editing, shared focused Back/header grammar, and contextual/full notification states |
| Schedule | web/lib/programs/workspace-schedule-task.tsx; web/lib/programs/workspace-events-task.tsx; web/lib/programs/program-settings.tsx; their focused tests | Keep an overview by default and replace it with a focused rule editor while preserving preview/generate/stale/partial/resume semantics |
| Copy and acceptance | web/lib/copy.ts; tests/e2e/t11-storybook.test.ts; tests/e2e/programs-responsive-matrix.test.ts; tests/e2e/programs-device-proof.test.ts | Add only missing approved Cantonese labels and pin route/state/viewport behavior |

Files in the tables are an ownership map, not permission for broad rewrites. If a listed file needs no change after its failing assertion is added, leave it untouched and record that result.

## What Already Exists

- web/app/programs/page.tsx already composes AppShell, ScreenPageFrame, Suspense, and ProgramsBoundary; the correction moves the inner three into a reusable production module rather than inventing a parallel route.
- ProgramsBoundary already parses ProgramsIntent, loads participant/management access, handles auth redirects, owns directory query/focus restoration, and selects participant directory/detail/event or the management workspace.
- WorkspaceRouteProvider and WorkspaceTaskProvider already carry department/hash/task navigation and module capability context.
- Screen Foundations already provide the page frame, shared route header with action/status/Back seams, rows, cards, sections, state surfaces, loading rows, and editors required by the prototype.
- @storybook/nextjs-vite and MSW are already configured. Existing Programs Stories already have ten stable exported Story objects and deterministic handler entry points.
- The Screen Catalog, Story manifest discovery, and Programs presentation contract already exist; they need stricter composition truth and honest gap state, not replacement.
- projectManagementPrograms already projects only server-returned manageable Programs and preserves explicit department filtering. The route must aggregate this authorized result, not query or infer broader scope.
- ProgramSettings and RecurringSchedulePanel already implement schedule-rule CRUD, exception handling, preview plans, generation, stale-plan refusal, partial failure, and resumable generation.
- Participant enrollment and Event Detail already receive server-shaped states/capabilities. Presentation logic must consume those fields instead of re-deriving eligibility or authorization.
- ProgramsNotifications already owns one management notification resource and supports compact and full render modes.
- Existing Programs component, Worker/D1, real-browser, responsive, shell, Storybook, T08, T09, and T11 suites provide the qualification layers this repair extends.

## Not In Scope

- New Worker routes, D1 schema or migrations, API payload fields, capability names, policy widening, audit semantics, recurrence semantics, enrollment states, event states, or check-in-window derivation.
- A new public route, a rewritten Programs URL schema, URL-backed Settings subsection state, or changed browser-history semantics.
- Replacing AppShell, the desktop rail, Feed Presentation, Screen Foundations, the Program API client, or the Programs route state machine.
- A global notification provider or shell-wide notification redesign; this repair passes the existing ProgramsNotifications trigger into the local Programs ScreenHeader.action seam.
- Pixel-perfect desktop redesign. Desktop receives regression and no-overflow protection only.
- New Screen Catalog baseline identities or PSNs for material-state/component-only Stories.
- Full combinatorial Story coverage of backend states already proven by domain/component tests.
- Rewriting earlier stacked commits, modifying lower PR bodies, merging any PR, closing #590-#601, or asserting owner approval.
- A new ADR or domain glossary change. This work implements the already-governing #586/ADR-0046 selective presentation replay and does not add domain vocabulary.

## ASCII Diagrams

### One production presentation path

~~~text
Production /programs                    Storybook baseline/supporting Story
        |                                           |
     AppShell                              ProgramsStoryHarness
        |                                           |
        +--------------------+----------------------+
                             |
                   ProgramsRouteSurface
                 /           |           \
        ScreenPageFrame   Suspense     ProgramsBoundary
                                             |
                       real intent + production components
                                             |
                    Worker/D1 or deterministic MSW seam
~~~

The harness may choose navigation, time, and handlers. It may not choose a leaf component or bypass ProgramsBoundary.

### Participant action region

~~~text
server-shaped enrollment/capabilities
                 |
                 v
      one bottom action region
       |       |       |       |
    eligible active  pending  rejected/withdrawn
     enroll   joined  status   result + only
              + exit  + cancel server-permitted next action
~~~

### Event Detail action gate

~~~text
load/auth result
  |-- forbidden/ineligible --> existing truthful error state, no CTA
  '-- event detail
        |-- window closed/not open --> status + explanatory copy, no scanner link
        '-- window open -----------> scanner/check-in CTA using existing intent
~~~

### Focused Schedule state

~~~text
Schedule route
   |
   +-- overview ----------------------------------------------+
   |     rules + exception rows -> preview -> generate        |
   |        |                                                  |
   |        +-- New/Edit --------------------------------+     |
   |                                                    |     |
   '-- focused editor <--- Back/Cancel or successful save     |
          (overview content hidden; same API contracts) ------+
~~~

### Evidence/status ladder

~~~text
CHANGES_REQUIRED / NOT_ROUTE_GREEN
        |
five append-only commits + focused green checks
        |
Storybook + real-route + W7 + fixed-point review
        |
WAITING_OWNER_L2
        |
owner comparison/approval in a separate closeout
        |
only then may Programs gaps become null
~~~

## Failure Modes & Gaps

- A direct leaf Story can look correct while the route frame, Suspense, intent parser, providers, and management resource placement remain wrong. Baseline and material Stories therefore must render ProgramsRouteSurface.
- Next navigation hooks can fail in Storybook if pathname/search parameters are incomplete. Use the configured Next.js Storybook navigation parameters; do not add a second router mock inside production.
- A fixture can make a screen look sparse or falsely green. Every baseline uses realistic Cantonese density, while empty/loading/error/permission states stay explicit supporting scenarios.
- Client aggregation can accidentally widen management scope. Management Directory may only flatten Programs already present in the server-authorized projection; an explicit department deep link may narrow that set.
- Moving the bell can duplicate fetching, announcements, or triggers. Reuse the single notificationSurface instance and place it either as a contextual header action or as the full Notifications task, never both.
- Removing the Overview Edit button while leaving CourseFacts/CourseEdit reachable would preserve an undocumented bypass. Delete or make unreachable the entire workspace edit state and prove Course Data editing remains under Settings.
- A visual enrollment reducer can accidentally invent eligibility. Every label/action maps to existing enrollment state and server-projected action capability; unknown or forbidden states render no optimistic action.
- A closed Event Detail must not expose a scanner deep link. The CTA is gated only by the existing checkInWindowIsOpen contract and successful authorized detail load.
- Event/Settings nested focus can create duplicate root headings. Use one root workspace header plus at most one level=child focused ScreenHeader; suppress the old bespoke h1/h2/back control in that branch.
- Schedule refactoring can reset drafts or lose preview plan identity. Editor targets own only rule/exception drafts; overview owns preview/generation state, which survives a partial generate and is invalidated only by the existing stale-plan path or an authoritative rule mutation.
- Existing exception APIs do not authorize an invented update endpoint. Preserve supported create/delete behavior; if the UI needs “edit”, use only a flow expressible by current APIs and tests, otherwise leave it as an explicit gap.
- gap: null is not a machine-green marker. ISSUE-#601 remains until owner-L2 comparison is recorded; do not manufacture an APV identifier.
- Storybook browser success is not live-provider proof. The final evidence must separately include the real /programs Worker/D1/browser gates.
- Shared shell CSS can regress non-Programs routes. Keep selectors below 800px, retain aria-current semantics and the >=800px rail declarations, then run shell and role-hierarchy geometry suites.
- PR/branch state may drift before execution. Any changed base, closed PR, unexpected commits, dirty overlap, or failed lower stack is a stop-and-report condition before writing.

## Parallelization / Worktree Strategy

Use the existing PR #607 worktree and execute Tasks 1-5 sequentially. The tasks overlap programs.stories.tsx, programs-fixtures.ts, ProgramsBoundary, ProgramWorkspace, ProgramSettings, and acceptance tests; parallel worktrees would create competing route/governance truth and make append-only review harder.

If the user chooses subagent-driven execution, dispatch one fresh implementation agent per task only after the previous task has a reviewed append-only commit. Each agent receives the current HEAD, the fixed comparison SHA, exact owned files, the prior task evidence, and an instruction not to revert unrelated/user changes. Run a two-stage review after each task: first acceptance/spec conformance, then code quality/regression risk. No agent may push, edit PR/issue state, or begin the next task until the parent reviews its diff.

## Runtime and Evidence Contract

### Execution preflight

- [ ] Re-read PR #607 JSON (state, baseRefName/baseRefOid, headRefName/headRefOid, reviewDecision, mergeStateStatus, checks, body) and issues #586 and #590-#601.
- [ ] Fetch remote refs and compare local HEAD, upstream HEAD, PR head, PR base, and origin/main.
- [ ] Run git status --short --branch and git diff --check; preserve unrelated dirty changes and stop on overlap.
- [ ] Record an immutable execution-start SHA. Use it as the fixed point for final two-axis review; if execution begins from the observed baseline unchanged, that SHA is 9ad90d253bfd50bf2bbcea85f39c18c1587b1f88.
- [ ] Confirm Node 22.18.0 and pnpm install state before interpreting any node:sqlite or missing-dependency failure.
- [ ] Update PR #607’s body to say CHANGES_REQUIRED / NOT_ROUTE_GREEN, state that prior #590-#601 completion claims are superseded, use Relates to references, and list the five planned correction commits. Do not use closing keywords.

Suggested read-only preflight:

~~~sh
git fetch origin --prune
git status --short --branch
git rev-parse HEAD
git rev-parse '@{upstream}'
git rev-parse origin/main
gh pr view 607 --json state,baseRefName,baseRefOid,headRefName,headRefOid,reviewDecision,mergeStateStatus,statusCheckRollup,body,url
for n in 586 {590..601}; do gh issue view "$n" --json number,title,state,body,url; done
fnm exec --using 22.18.0 node --version
fnm exec --using 22.18.0 pnpm --version
~~~

### Required material-state matrix

| Family | Required scenario | Primary proof |
| --- | --- | --- |
| Participant Directory | enrolled/member density; management-capable mode switch; separate empty/loading/error | route Story + component semantics |
| Participant Program Detail | eligible; Active member; Pending; Rejected/Withdrawn | route Story + enrollment component tests |
| Participant Event Detail | closed/not-open baseline; open CTA; ineligible/forbidden | route Story + detail gate tests |
| Management Directory | multiple departments, mixed Draft/Active/Archived lifecycle; explicit department deep link | route Story + projection tests |
| Workspace Overview | populated operational counts; truthful zero counts | route Story + workspace tests |
| Workspace Events | mixed active/cancelled/upcoming rows; operations-first layout; Schedule entry | route Story + task tests |
| Workspace Participants | pending-first approvals; active/history reachable; assisted enrollment | route Story + workspace tests |
| Workspace Settings | hub; focused dirty draft; conflict/retry | route Story + settings tests |
| Workspace Schedule | overview; focused New/Edit; preview empty/ready/stale; partial failure; resume | route Story/play + schedule tests |
| Notifications | unread; empty; recoverable failure; compact versus full ownership | route Story + notification/boundary tests |

### Machine-candidate acceptance

- All ten retained baseline Stories render AppShell -> ProgramsRouteSurface -> ProgramsBoundary and have exactly one primary Screen Catalog declaration.
- No Programs baseline or obligation has gap: null; each references ISSUE-#601.
- Direct leaf examples are labeled component-only and are absent from the baseline manifest/catalog.
- 402x874 and 360x800 visual comparisons match frozen HTML hierarchy, density, action placement, and navigation treatment for all ten baseline screens.
- W7 has no overflow/collision/target regression, including the 799/800 shell transition; desktop remains usable.
- Storybook, component, Worker/D1, real-route browser, responsive, and fixed-point review evidence are all recorded with exact commands and results.
- The candidate status is WAITING_OWNER_L2, not ROUTE_GREEN, STACK_GREEN, merged, released, or complete.

---

## Task 1: Restore Truthful Route Composition and Story Governance

**Issues:** #600 route-family presentation ownership; #601 qualification truth; prerequisite for revalidating #590-#599.

**Files:**

- Create: web/lib/programs/programs-route-surface.tsx
- Create: web/lib/programs/programs-route-surface.test.tsx
- Create: web/.storybook/programs-story-harness.tsx
- Create: web/.storybook/programs-components.stories.tsx
- Add the saved plan: docs/superpowers/plans/2026-09-11-programs-prototype-route-fidelity-correction.md
- Modify: web/app/programs/page.tsx
- Modify: web/.storybook/programs.stories.tsx
- Modify: web/.storybook/programs-fixtures.ts
- Modify: web/.storybook/programs-presentation-contract.ts
- Modify: web/.storybook/programs-presentation-contract.test.ts
- Modify: web/.storybook/programs-presentation-contract.test.tsx
- Verify and modify only if required: web/.storybook/programs.story-manifest.ts
- Modify: web/.storybook/presentation-catalog.ts
- Modify: web/.storybook/presentation-catalog.test.ts
- Modify: web/lib/governance/presentation-screen-catalog.ts
- Modify: web/vitest.components.config.ts

**Interfaces:**

~~~ts
export function ProgramsRouteSurface(): JSX.Element

export function ProgramsStoryHarness(): JSX.Element

export type ProgramsScenarioName =
  | "participant-directory-member"
  | "participant-program-detail-active"
  | "participant-event-detail-closed"
  | "management-directory-mixed"
  | "workspace-overview-populated"
  | "workspace-events-mixed"
  | "workspace-participants-pending"
  | "workspace-settings-hub"
  | "workspace-schedule-overview"
  | "workspace-notifications-unread"
  // Task 5 extends only with named risk scenarios.

export interface ProgramsStoryScenario {
  readonly pathname: "/programs"
  readonly query: Readonly<Record<string, string>>
  readonly handlers: readonly RequestHandler[]
}

export function getProgramsStoryScenario(
  name: ProgramsScenarioName
): ProgramsStoryScenario

export function isPresentationGapReference(value: string): boolean
~~~

The scenario API is Storybook-only. ProgramsRouteSurface accepts no fixture or routing props: production and Storybook must both exercise ProgramsBoundary.

- [ ] **Step 1: Pin the old false-positive behavior with failing tests.** Add a route-surface test that expects data-screen-route="programs", data-screen-width="compact", the existing accessible Suspense fallback, and ProgramsBoundary beneath one page frame. Extend the presentation contract so a direct leaf wrapped only in AppShell fails, while a ProgramsRouteSurface render passes.
- [ ] **Step 2: Pin catalog and identity truth.** Change the Programs declaration expectation from nine to ten and the aggregate screen-declaration expectation from 39 to 40; assert the exact existing export names/PSNs remain stable; assert component-only Stories are absent from programsStoryDeclarations; assert all ten Programs obligations and baselines carry ISSUE-#601. Add validator tests accepting APV-* and ISSUE-#<positive integer>, while rejecting arbitrary strings and gap: null for the still-open Programs correction fixture.
- [ ] **Step 3: Run the focused red slice.** Confirm failures specifically report the missing route surface, direct-leaf composition, nine-versus-ten declaration mismatch, and unsupported open-gap reference. Do not edit production code until these assertions fail for those reasons.

~~~sh
fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/programs-route-surface.test.tsx
fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.t07.config .storybook/programs-presentation-contract.test.ts .storybook/programs-presentation-contract.test.tsx .storybook/presentation-catalog.test.ts
~~~

- [ ] **Step 4: Extract the production route surface.** Move ScreenPageFrame, width="compact", data-screen-route, Suspense, fallback output/Skeleton/copy, and ProgramsBoundary from page.tsx into ProgramsRouteSurface. Leave page.tsx as AppShell -> ProgramsRouteSurface. Do not move AppShell or introduce props.
- [ ] **Step 5: Build a route-only Story harness.** ProgramsStoryHarness renders AppShell -> ProgramsRouteSurface and nothing screen-specific. Navigation remains in each Story’s configured Next.js parameters; data remains in its named MSW scenario.
- [ ] **Step 6: Convert all ten retained baselines.** Keep ParticipantDirectory, ParticipantProgramDetail, ParticipantEventDetail, ManagementDirectory, WorkspaceOverview, WorkspaceEvents, WorkspaceParticipants, WorkspaceSettings, WorkspaceSchedule, and WorkspaceNotifications exports and metadata identities. Replace their direct leaf renders with ProgramsStoryHarness plus the matching route intent and handler set.
- [ ] **Step 7: Preserve leaf examples without parity claims.** Move the prior direct-component examples into programs-components.stories.tsx under an explicit “Programs/Components” title. Do not add them to programs.story-manifest.ts or assign Screen Catalog PSNs/gap:null.
- [ ] **Step 8: Establish deterministic baseline scenarios.** Replace the single English/year-2099 fixture with named, server-shaped Cantonese scenarios. Freeze the clock only at Story/test boundaries; preserve ISO/Hong Kong-time contracts and reset handlers/time after each Story.
- [ ] **Step 9: Make gap state truthful.** Set all ten Programs presentation obligations and baseline Story metadata to ISSUE-#601. Update validation through one narrow isPresentationGapReference helper; retain the existing APV rule for approved packages and reject malformed issue references.
- [ ] **Step 10: Strengthen composition readiness.** ProgramsScreenReadiness must prove page frame, route marker, non-loading settled content, and a route-owned boundary/screen marker. It must not bless arbitrary main markup or a leaf component.
- [ ] **Step 11: Run focused and task-level green checks.**

~~~sh
fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/programs-route-surface.test.tsx lib/programs/programs-boundary.test.tsx
fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation
fnm exec --using 22.18.0 pnpm --dir web test:storybook
fnm exec --using 22.18.0 pnpm --dir web typecheck
~~~

- [ ] **Step 12: Review the diff for one-path ownership.** Search production for .storybook imports and Storybook for direct baseline leaf imports. The ten baseline renders must reach ProgramsBoundary; only programs-components.stories.tsx may intentionally render leaves.
- [ ] **Step 13: Commit one append-only unit.**

~~~sh
git add docs/superpowers/plans/2026-09-11-programs-prototype-route-fidelity-correction.md web/app/programs/page.tsx web/lib/programs/programs-route-surface.tsx web/lib/programs/programs-route-surface.test.tsx web/vitest.components.config.ts web/.storybook/programs-story-harness.tsx web/.storybook/programs-components.stories.tsx web/.storybook/programs.stories.tsx web/.storybook/programs-fixtures.ts web/.storybook/programs-presentation-contract.ts web/.storybook/programs-presentation-contract.test.ts web/.storybook/programs-presentation-contract.test.tsx web/.storybook/programs.story-manifest.ts web/.storybook/presentation-catalog.ts web/.storybook/presentation-catalog.test.ts web/lib/governance/presentation-screen-catalog.ts
git diff --cached --check
git commit -m "fix(programs): share truthful route presentation"
~~~

## Task 2: Align the Shared Shell and Near-Match Baseline Screens

**Issues:** #589 shell; #590 directory; #594 overview; #597 participants; #598 settings; #599 notifications.

**Files:**

- Modify: web/app/globals.css
- Modify: web/lib/shell/shell-breakpoint.test.tsx
- Modify: web/lib/shell/shell-tokens.test.tsx
- Modify: web/lib/shell/authenticated-shell.test.tsx
- Modify: web/lib/programs/programs-boundary.tsx
- Modify: web/lib/programs/programs-boundary.test.tsx
- Modify: web/lib/programs/programs-management-boundary.test.tsx
- Modify: web/lib/programs/workspace-context.tsx
- Modify: web/lib/programs/participant-directory.tsx
- Modify: web/lib/programs/participant-directory.test.tsx
- Modify: web/lib/programs/management-directory.tsx
- Modify: web/lib/programs/management-directory.test.tsx
- Modify: web/lib/programs/program-workspace.tsx
- Modify: web/lib/programs/program-workspace.test.tsx
- Modify: web/lib/programs/workspace-participants-task.tsx
- Modify: web/lib/programs/workspace-settings-task.tsx
- Modify: web/lib/programs/program-settings.tsx
- Modify: web/lib/programs/program-settings.test.tsx
- Modify: web/lib/programs/programs-notifications.tsx
- Modify: web/lib/programs/programs-notifications.test.tsx
- Modify only for missing approved labels: web/lib/copy.ts
- Modify: web/.storybook/programs-fixtures.ts

**Interfaces:**

~~~ts
export interface ManagementDirectoryProps {
  // existing props unchanged
  headerAction?: React.ReactNode
}

export interface ProgramWorkspaceProps {
  // existing props unchanged
  headerAction?: React.ReactNode
}

export interface WorkspaceTaskContextValue {
  // existing fields unchanged
  headerAction?: React.ReactNode
}
~~~

headerAction is presentation composition only. It does not own loading, marking read, navigation, or authorization.

- [ ] **Step 1: Add shell regressions before CSS edits.** Pin the existing single 800px transition, one navigation landmark, aria-current ownership, 44px target geometry, and desktop rail styles. Add an assertion that below 800px the active item uses accent text plus the frozen thin indicator and does not use a filled red tile; prove the scanner slot follows the same active grammar.
- [ ] **Step 2: Add screen regressions for the chosen replay.** Assert realistic Directory sections/row density; no Overview “Edit Course” header action or reachable CourseFacts/CourseEdit bypass; Course Data remains in Settings; pending enrollments render before active/history controls; compact notification mode appears exactly once in a management header; full Notifications renders without a duplicate bell.
- [ ] **Step 3: Run the focused red slice.** Failures should expose the current solid mobile tile, Overview edit bypass, standalone bell row, sparse fixture assumptions, or duplicate header ownership—not a test setup problem.

~~~sh
fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/shell/shell-breakpoint.test.tsx lib/shell/shell-tokens.test.tsx lib/shell/authenticated-shell.test.tsx lib/programs/participant-directory.test.tsx lib/programs/program-workspace.test.tsx lib/programs/programs-notifications.test.tsx lib/programs/programs-boundary.test.tsx lib/programs/programs-management-boundary.test.tsx
~~~

- [ ] **Step 4: Correct only the phone active-nav presentation.** Below 800px, use the prototype’s thin accent indicator, accent icon/text, and neutral/transparent item background. Preserve hover/focus, safe-area dock, scan position, one nav landmark, active semantics, and every >=800px rail rule.
- [ ] **Step 5: Replay the participant directory baseline.** Use prototype-like Cantonese names, member-status mix, upcoming metadata, and enough rows to expose spacing/wrapping. Preserve participant-default intent and the management-mode control only when the existing access projection permits it.
- [ ] **Step 6: Remove the workspace edit bypass completely.** Delete the large red Overview header action and the ProgramWorkspace-owned CourseFacts/CourseEdit state path. Keep read-only operational Overview facts/counts. Route all editing through Settings -> Course Data using the existing ProgramSettings mutation/retry/conflict path.
- [ ] **Step 7: Align Overview, Participants, and Settings composition.** Render populated and zero counts truthfully; make pending approvals the first operational participant content; keep active/history and assisted enrollment available; preserve grouped Settings Hub rows and focused dirty/conflict behavior.
- [ ] **Step 8: Move the one existing compact notification surface into the header action seam.** ManagementPanel still owns and loads one ProgramsNotifications instance. Pass it as headerAction to ManagementDirectory or ProgramWorkspace when task is not notifications. For task=notifications render only the full surface; do not mount a compact twin.
- [ ] **Step 9: Preserve notification behavior.** Mark-read, unread count, retry, auth redirect, department/hash links, live announcements, refresh after mutations, popover focus, and full-task navigation remain unchanged.
- [ ] **Step 10: Run focused green and shared-shell safety.**

~~~sh
fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/shell/shell-breakpoint.test.tsx lib/shell/shell-tokens.test.tsx lib/shell/authenticated-shell.test.tsx lib/programs/participant-directory.test.tsx lib/programs/management-directory.test.tsx lib/programs/program-workspace.test.tsx lib/programs/program-settings.test.tsx lib/programs/programs-notifications.test.tsx lib/programs/programs-boundary.test.tsx lib/programs/programs-management-boundary.test.tsx
fnm exec --using 22.18.0 pnpm verify:fast
~~~

- [ ] **Step 11: Inspect feature accounting.** Search for the removed Overview label, CourseFacts/CourseEdit entry state, and standalone notification wrapper. The only remaining Course Data mutation entry must be Settings; the only management notification resource owner must be ManagementPanel.
- [ ] **Step 12: Commit one append-only unit.**

~~~sh
git add web/app/globals.css web/lib/shell/shell-breakpoint.test.tsx web/lib/shell/shell-tokens.test.tsx web/lib/shell/authenticated-shell.test.tsx web/lib/programs/programs-boundary.tsx web/lib/programs/programs-boundary.test.tsx web/lib/programs/programs-management-boundary.test.tsx web/lib/programs/workspace-context.tsx web/lib/programs/participant-directory.tsx web/lib/programs/participant-directory.test.tsx web/lib/programs/management-directory.tsx web/lib/programs/management-directory.test.tsx web/lib/programs/program-workspace.tsx web/lib/programs/program-workspace.test.tsx web/lib/programs/workspace-participants-task.tsx web/lib/programs/workspace-settings-task.tsx web/lib/programs/program-settings.tsx web/lib/programs/program-settings.test.tsx web/lib/programs/programs-notifications.tsx web/lib/programs/programs-notifications.test.tsx web/lib/copy.ts web/.storybook/programs-fixtures.ts
git diff --cached --check
git commit -m "fix(programs): align shell and baseline screens"
~~~

## Task 3: Replay Participant, Directory, Event, and Focused Header Workflows

**Issues:** #591 Program Detail; #592 participant Event Detail; #593 management directory; #595 Events; #600 ownership convergence.

**Files:**

- Modify: web/lib/programs/participant-program-detail.tsx
- Modify: web/lib/programs/participant-program-detail.test.tsx
- Modify: web/lib/programs/participant-enrollment.tsx
- Modify: web/lib/programs/participant-enrollment.test.tsx
- Modify: web/lib/programs/participant-event-detail-page.tsx
- Modify: web/lib/programs/participant-event-detail-page.test.tsx
- Modify: web/lib/programs/management-directory.tsx
- Modify: web/lib/programs/management-directory.test.tsx
- Modify: web/lib/programs/workspace-events-task.tsx
- Create/modify: web/lib/programs/workspace-events-task.test.tsx
- Modify: web/lib/programs/event-detail.tsx
- Modify: web/lib/programs/event-detail.test.tsx
- Modify: web/lib/programs/program-workspace.tsx
- Modify: web/lib/programs/program-workspace.test.tsx
- Modify: web/lib/programs/workspace-settings-task.tsx
- Modify: web/lib/programs/program-settings.tsx
- Modify: web/lib/programs/program-settings.test.tsx
- Modify: web/lib/programs/programs-boundary.test.tsx
- Modify only for missing approved labels: web/lib/copy.ts
- Modify: web/.storybook/programs-fixtures.ts
- Modify: web/vitest.components.config.ts

**Presentation contracts:**

~~~ts
type ParticipantActionRegion =
  | { kind: "eligible"; action: "enroll" }
  | { kind: "active"; action: "withdraw" | null }
  | { kind: "pending"; action: "cancel" | null }
  | { kind: "result"; status: "Rejected" | "Withdrawn"; nextAction: "enroll" | null }
  | { kind: "none" }

// Derived only from existing server-shaped enrollment and action capability.
function participantActionRegion(...existingInputs): ParticipantActionRegion
~~~

Do not export the helper unless multiple production consumers genuinely need it.

- [ ] **Step 1: Write enrollment-action regressions.** For eligible, Active, Pending, Rejected, and Withdrawn projections, assert exactly one bottom action region, no legacy large enrollment card, and only the server-permitted action. Assert the schedule/advisory/detail content remains reachable and no status is color-only.
- [ ] **Step 2: Write participant Event Detail regressions.** Closed/not-open detail has status and explanatory text but no scanner/check-in link. Open detail has exactly one existing scanner-intent CTA. Ineligible/forbidden load uses the existing error surface and exposes no CTA. Pin backHref/onBack behavior.
- [ ] **Step 3: Write management projection/layout regressions.** Without an explicit department intent, the directory flattens every Program in the server-authorized projection and includes department metadata per row. With an explicit department intent, it narrows to that authorized department. The first viewport has no large scope chooser/explainer; a compact Department Settings action remains.
- [ ] **Step 4: Write Events/header regressions.** Events render the operational list and New Event affordance before one low-frequency Schedule row; no rule editor/preview is embedded in Events. Loaded management Event Detail and focused Settings use ScreenHeader level=child and shared Back semantics instead of bespoke text buttons/headings.
- [ ] **Step 5: Run the focused red slice.**

~~~sh
fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/participant-program-detail.test.tsx lib/programs/participant-enrollment.test.tsx lib/programs/participant-event-detail-page.test.tsx lib/programs/management-directory.test.tsx lib/programs/workspace-events-task.test.tsx lib/programs/event-detail.test.tsx lib/programs/program-workspace.test.tsx lib/programs/program-settings.test.tsx
~~~

- [ ] **Step 6: Collapse Program Detail enrollment into one action region.** Keep the frozen header, description, grouped schedule, upcoming Event, and advisory hierarchy. Map existing state/capability to the one bottom region: eligible/enroll, Active/joined plus exit when allowed, Pending/status plus cancel when allowed, Rejected/Withdrawn/result plus a server-permitted next action.
- [ ] **Step 7: Make participant Event Detail stateful without inventing domain.** Use the prototype closed state as baseline. Render the scanner/check-in CTA only when the authorized detail loaded and the existing checkInWindowIsOpen predicate is true. Do not infer eligibility from time or enrollment client-side.
- [ ] **Step 8: Make Management Directory aggregate authorized results.** Remove the large default scopedDepartments chooser/explainer. Keep projectManagementPrograms as the source and retain explicit departmentId filtering. Put department name/code in each row. Retain departmentOnly compatibility for any verified embedded caller, but never pass it from the normal route.
- [ ] **Step 9: Keep Department Settings compact.** Zero/one scope opens the existing DepartmentSettingsPanel directly; multiple authorized scopes may open a focused picker/sheet after the operator chooses the small action. The picker is not persistent first-viewport content and may not broaden the server result.
- [ ] **Step 10: Make Events operations-first.** Order compact mixed-lifecycle Event rows and their existing permitted operations first. Keep New Event. Move recurrence rules, exceptions, preview, and generation behind the single Schedule destination row.
- [ ] **Step 11: Converge focused Back/header grammar.** Replace EventDetail’s loaded bespoke back/title block and SettingsTask’s plain back button/root heading with ScreenHeader level=child. Preserve backHref, backReplace, click interception, focus restoration, hash/department intent, and the contextual headerAction. Keep a logical root workspace heading and avoid duplicate focused h1 ownership.
- [ ] **Step 12: Run focused green and Programs contracts.**

~~~sh
fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/participant-program-detail.test.tsx lib/programs/participant-enrollment.test.tsx lib/programs/participant-event-detail-page.test.tsx lib/programs/management-directory.test.tsx lib/programs/workspace-events-task.test.tsx lib/programs/event-detail.test.tsx lib/programs/program-workspace.test.tsx lib/programs/program-settings.test.tsx lib/programs/programs-boundary.test.tsx
fnm exec --using 22.18.0 pnpm test:programs:contract
fnm exec --using 22.18.0 pnpm verify:fast
~~~

- [ ] **Step 13: Review negative space.** Confirm there is no client-created management scope, no second enrollment card, no closed-window scanner link, no recurring editor in Events, and no bespoke focused Back control.
- [ ] **Step 14: Commit one append-only unit.**

~~~sh
git add web/lib/programs/participant-program-detail.tsx web/lib/programs/participant-program-detail.test.tsx web/lib/programs/participant-enrollment.tsx web/lib/programs/participant-enrollment.test.tsx web/lib/programs/participant-event-detail-page.tsx web/lib/programs/participant-event-detail-page.test.tsx web/lib/programs/management-directory.tsx web/lib/programs/management-directory.test.tsx web/lib/programs/workspace-events-task.tsx web/lib/programs/workspace-events-task.test.tsx web/lib/programs/event-detail.tsx web/lib/programs/event-detail.test.tsx web/lib/programs/program-workspace.tsx web/lib/programs/program-workspace.test.tsx web/lib/programs/workspace-settings-task.tsx web/lib/programs/program-settings.tsx web/lib/programs/program-settings.test.tsx web/lib/programs/programs-boundary.test.tsx web/lib/copy.ts web/.storybook/programs-fixtures.ts web/vitest.components.config.ts
git diff --cached --check
git commit -m "fix(programs): replay participant and event workflows"
~~~

## Task 4: Make Schedule an Overview with a Focused Editor

**Issue:** #596 focused Schedule destination.

**Files:**

- Modify: web/lib/programs/workspace-schedule-task.tsx
- Modify: web/lib/programs/workspace-events-task.tsx
- Modify: web/lib/programs/workspace-events-task.test.tsx
- Modify: web/lib/programs/program-settings.tsx
- Modify: web/lib/programs/program-settings.test.tsx
- Modify only for missing approved labels: web/lib/copy.ts
- Modify: web/.storybook/programs-fixtures.ts

**Interfaces:**

~~~ts
type ScheduleEditorTarget =
  | { readonly kind: "new-rule" }
  | { readonly kind: "edit-rule"; readonly ruleId: string }
  | { readonly kind: "new-exception"; readonly ruleId: string }
  | null
~~~

This is local presentation state. It does not enter the URL, Worker payload, persisted Program, or preview-plan contract.

- [ ] **Step 1: Pin overview versus editor behavior.** The default Schedule render shows a compact rule/exception collection, Preview range/action, and a separate Generate card; no full rule form is mounted. New Rule and a rule row switch to a focused editor that hides overview content. Back/Cancel restores the overview and focus without navigation.
- [ ] **Step 2: Pin rule and exception contract preservation.** New/edit rule submits the current create/update APIs and validation; supported exception create/delete stays intact; load failure remains unresolved with retry rather than becoming an empty list. A successful mutation refetches authoritative rules/exceptions before returning to overview.
- [ ] **Step 3: Pin preview/generate lifecycle.** Cover idle, loading, empty, ready, stale plan, full success, partial failure, and resumed generation. Partial failure is an alert, retains the same plan for retry, calls onGenerated for created progress, and never reports full success. STALE_PLAN invalidates the preview and requires a new preview.
- [ ] **Step 4: Run the focused red slice.**

~~~sh
fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/program-settings.test.tsx lib/programs/workspace-events-task.test.tsx
~~~

- [ ] **Step 5: Introduce one local editor target.** Replace editingRuleId plus the always-mounted new-rule form with ScheduleEditorTarget. Keep drafts scoped to the target and clear them only on explicit cancel/back, successful save, or authoritative reload.
- [ ] **Step 6: Render the prototype overview by default.** Use ScreenSection/ScreenRowList for “自動聚會規則”; show rule rows and supported exception rows with status/meta; place a compact New Rule action in the section header. Follow with Preview and Generate in the prototype order.
- [ ] **Step 7: Render focused New/Edit content exclusively.** While a target is active, hide the overview, preview, and generate surfaces. Use ScreenHeader level=child (or the existing route-owned equivalent) with shared Back interception; reuse ScreenEditor/ScreenField and current save/delete confirmations.
- [ ] **Step 8: Keep low-frequency Schedule ownership out of Events.** ScheduleTask composes the rule manager and RecurringSchedulePanel. EventsTask contains only its compact Schedule destination row; no second preview or editor instance is mounted.
- [ ] **Step 9: Preserve async/recovery ownership.** Keep one rule load, one exception load per authoritative rule, one preview plan, and one generate action. Continue AUTH_REQUIRED redirect, RpcError copy, mounted guards, announcements, retry semantics, and HK wall-time conversion.
- [ ] **Step 10: Run focused green and regression gates.**

~~~sh
fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/program-settings.test.tsx lib/programs/workspace-events-task.test.tsx lib/programs/program-workspace.test.tsx
fnm exec --using 22.18.0 pnpm test:programs:contract
fnm exec --using 22.18.0 pnpm verify:fast
~~~

- [ ] **Step 11: Inspect lifecycle invariants.** Verify no always-expanded new-rule form, no inline full edit form in the overview, no duplicate preview/generate owner, no invented exception-update API, and no loss of plan identity on partial resume.
- [ ] **Step 12: Commit one append-only unit.**

~~~sh
git add web/lib/programs/workspace-schedule-task.tsx web/lib/programs/workspace-events-task.tsx web/lib/programs/workspace-events-task.test.tsx web/lib/programs/program-settings.tsx web/lib/programs/program-settings.test.tsx web/lib/copy.ts web/.storybook/programs-fixtures.ts
git diff --cached --check
git commit -m "fix(programs): focus schedule lifecycle presentation"
~~~

## Task 5: Add the Risk Matrix and Qualify the Real Route

**Issue:** #601 full route-family regression and owner-L2 candidate; final revalidation of #589-#600.

**Files:**

- Create: web/.storybook/programs-material-states.stories.tsx
- Modify: web/.storybook/programs-fixtures.ts
- Modify: web/.storybook/programs.stories.tsx
- Modify: web/.storybook/programs-presentation-contract.test.ts
- Modify: web/.storybook/programs-presentation-contract.test.tsx
- Modify: web/.storybook/presentation-catalog.test.ts
- Modify: tests/e2e/t11-storybook.test.ts
- Modify only for a missing route-state assertion: tests/e2e/programs-responsive-matrix.test.ts
- Modify only for a missing primary-device assertion: tests/e2e/programs-device-proof.test.ts
- Create: docs/qa/2026-09-11-programs-route-fidelity-correction.md

**Story contract:**

- The ten retained programs.stories.tsx exports remain the only Programs Screen Catalog baselines and keep their existing IDs/PSNs.
- programs-material-states.stories.tsx contains only the named risk scenarios in the matrix. It renders ProgramsStoryHarness, uses route intent + MSW, and receives no new baseline PSNs.
- programs-components.stories.tsx remains leaf-only and is not valid route-parity evidence.

- [ ] **Step 1: Add failing Story inventory tests.** Require all ten baselines, every matrix row, a route-composition marker on every baseline/material Story, and no material/component-only Story in the Programs Screen Catalog manifest. Require exact route intent for each retained baseline.
- [ ] **Step 2: Add failing T11 assertions.** For all ten baseline Story IDs, assert one AppShell, one page frame, data-screen-route="programs", settled route content, and no horizontal overflow. Add targeted 360x800 and 402x874 checks for the material states most likely to change action placement or density.
- [ ] **Step 3: Run the Story/test red slice.**

~~~sh
fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation
fnm exec --using 22.18.0 pnpm --dir web test:storybook
fnm exec --using 22.18.0 pnpm test:t11:storybook
~~~

- [ ] **Step 4: Implement only the required supporting Stories.** Add member/capable Directory; enrollment eligible/Active/Pending/Rejected-or-Withdrawn; Event closed/open/ineligible; mixed management lifecycle; Overview populated/zero; pending-first Participants; Schedule focused/stale/partial/resume; Settings dirty/conflict; Notifications unread/empty/failure. Reuse a scenario when one Story can prove multiple adjacent non-conflicting facts.
- [ ] **Step 5: Add Story play assertions at behavior seams.** Exercise Back, mode switch, enroll/cancel/withdraw visibility, closed/open CTA gate, Department Settings picker, Events->Schedule entry, Schedule editor Back, stale preview recovery, partial resume, Settings dirty/conflict alert, and notification retry/mark-read. Do not duplicate Worker business-rule tests.
- [ ] **Step 6: Build and validate Storybook governance.**

~~~sh
fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation
fnm exec --using 22.18.0 pnpm --dir web test:storybook
fnm exec --using 22.18.0 pnpm --dir web storybook:build
fnm exec --using 22.18.0 pnpm --dir web storybook:verify-index
fnm exec --using 22.18.0 pnpm test:t08:controls
fnm exec --using 22.18.0 pnpm test:t09:foundations
fnm exec --using 22.18.0 pnpm test:t11:storybook
~~~

- [ ] **Step 7: Run component and contract layers.**

~~~sh
fnm exec --using 22.18.0 pnpm --dir web test:components
fnm exec --using 22.18.0 pnpm test:programs:contract
fnm exec --using 22.18.0 pnpm verify:fast
~~~

- [ ] **Step 8: Run real-route Worker/D1/browser acceptance.** These gates are separate from MSW/Storybook evidence and must use their existing isolated runner/bootstrap behavior.

~~~sh
fnm exec --using 22.18.0 pnpm test:programs:browser
fnm exec --using 22.18.0 pnpm test:programs:responsive
fnm exec --using 22.18.0 pnpm verify:programs
~~~

- [ ] **Step 9: Run shared-shell blast-radius and full precommit gates.**

~~~sh
fnm exec --using 22.18.0 pnpm test:shell-responsive
fnm exec --using 22.18.0 pnpm test:shell-geometry
fnm exec --using 22.18.0 pnpm test:role-hierarchy-geometry
fnm exec --using 22.18.0 pnpm verify:precommit
~~~

- [ ] **Step 10: Perform the visual comparison.** At 402x874 and 360x800, capture/compare each of the ten baseline route Stories against its frozen HTML screen. Confirm hierarchy, row density, title/metadata, button placement, bottom-dock indicator, contextual bell/mode action, and no clipped content. At W7, record overflow, required target size, sticky/fixed collisions, and 799/800 reflow. Machine comparison does not substitute for owner L2.
- [ ] **Step 11: Run fixed-point review.** Review execution-start-SHA...HEAD along two axes: acceptance/spec conformance and code quality/regression risk. Resolve every actionable finding, rerun the affected focused tests, and repeat until a pass finds no actionable issue. Preserve unrelated pre-existing failures with base reproduction; never label them green.
- [ ] **Step 12: Write the QA evidence file.** Record immutable base/head SHAs, branch/PR, exact command and result for every gate, Story IDs/scenarios, viewport table, real-route versus Storybook distinction, screenshots/artifact locations, fixed-point review rounds, known limitations, and the remaining owner-L2 requirement. Do not write READY/complete for a gate that did not run or passed only in a mock layer.
- [ ] **Step 13: Recheck catalog truth.** All ten Programs obligations and baseline Stories still reference ISSUE-#601. No task in this plan changes them to gap: null or fabricates an APV.
- [ ] **Step 14: Commit qualification evidence.**

~~~sh
git add web/.storybook/programs-material-states.stories.tsx web/.storybook/programs-fixtures.ts web/.storybook/programs.stories.tsx web/.storybook/programs-presentation-contract.test.ts web/.storybook/programs-presentation-contract.test.tsx web/.storybook/presentation-catalog.test.ts tests/e2e/t11-storybook.test.ts tests/e2e/programs-responsive-matrix.test.ts tests/e2e/programs-device-proof.test.ts docs/qa/2026-09-11-programs-route-fidelity-correction.md
git diff --cached --check
git commit -m "test(programs): qualify route fidelity correction"
~~~

- [ ] **Step 15: Re-run the final diff/status guard.**

~~~sh
git status --short --branch
git diff --check execution-start-SHA...HEAD
git log --oneline --decorate execution-start-SHA..HEAD
gh pr view 607 --json state,baseRefName,baseRefOid,headRefName,headRefOid,reviewDecision,mergeStateStatus,statusCheckRollup,body,url
~~~

- [ ] **Step 16: Update PR #607 without claiming approval.** Push normally only after local evidence and explicit execution authority. Set the body/status to WAITING_OWNER_L2, list the five append-only commits and evidence file, keep Relates to #590-#601, explain that gaps remain ISSUE-#601, and request owner comparison at 402x874 and 360x800. Do not merge, close issues, set gap:null, or call the stack green.

## Final Stop Rule

Stop at WAITING_OWNER_L2 when and only when every machine-candidate acceptance item is evidenced. Report any failing or unrun gate exactly and keep CHANGES_REQUIRED / NOT_ROUTE_GREEN if the machine candidate is incomplete.

After a real owner-L2 comparison is received, treat closeout as a separate append-only action: verify the approval artifact/provenance, update the ten obligation/Story gaps only as that approval directs, rerun catalog/Storybook/route gates, and request explicit merge/closure authority. This implementation plan itself grants none of those actions.
