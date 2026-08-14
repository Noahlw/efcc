---
target: remote main Programs Section
total_score: 20
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
timestamp: 2026-08-08T12-28-53Z
slug: web-app-programs
---

# Programs Section critique

Method: dual-agent (A: ProgramsDesignReview; B: ProgramsDetectorReview)

## Evidence boundary

The parent checkout's local `main` is stale: its Programs route is still a placeholder. GitHub `main` and the `efcc-dev-testing` deployment contain the implemented ProgramsManager surface reviewed here. The missing feature worktree was recovered read-only from its committed branch tip; no application files were changed.

The live URL was opened without credentials. It serves the app shell and then client-side routes to login, so no authenticated live screenshot is claimed. To answer the visual question, the implemented surface was built locally from the reviewed branch and exercised with a fixture at 1280x800 and 375x812. Screenshots were inspected directly at both sizes, including collapsed/expanded department, module, program, and task states. Visual observations below are therefore screenshot evidence for the implemented build, not claims about a live authenticated account.

## Design-specificity verdict

Genuinely bespoke in language and domain behavior: Traditional Chinese church vocabulary, Hong Kong time rendering, capability-projected actions, request/enrollment separation, soft cancellation, scoped Program Leader permissions, a restrained civic palette, 44px controls, focus-visible states, live-region announcements, and reduced-motion support.

The structural model is not yet bespoke enough. It is an admin-console tree — Section → Department → Program → task panel — wearing the clothes of a member catalog. A Member's job is browse → understand → enroll, but the lead copy and first screen require “先選部門” and expose staff configuration hierarchy first.

## Heuristic scorecard

Scores are 0–4; all heuristics apply. Total: **20/40**. This is a redesign case, not a polish pass.

| Heuristic | Score | Finding |
| --- | --: | --- |
| Visibility of system status | 2 | Loading and polite announcements exist, but no counts or pending-work summary; one global busy state freezes unrelated actions; create-language appears during edits. |
| Match to the real world | 3 | Church terms, HK time, recurrence, status, and enrollment states are credible. `課程與活動` conflates the catalog with its events, and technical labels such as bare monthly day values require interpretation. |
| User control and freedom | 2 | Collapse, withdraw, soft-cancel, and destructive confirmations exist. Refresh loses expansion state; there is no deep-link/back state; destructive confirmation patterns are inconsistent. |
| Consistency and standards | 2 | Shared forms, buttons, focus treatment, and touch sizing are strong. Task navigation behaves as buttons rather than a true tablist; module controls and confirmation patterns are inconsistent. |
| Error prevention | 2 | Required fields, idempotency, bounded day values, and reason-required cancellations help. Recurrence controls expose irrelevant choices; lifecycle and event-conflict guidance are weak. |
| Recognition over recall | 2 | Program status tags help. Meaningful work, especially pending approvals, is hidden behind Department → Program → task expansion; no search or aggregate counts. |
| Flexibility and efficiency | 1 | No search/filter/sort/pagination/bulk actions or dense desktop triage. A Member's enrollment path is several expansions and network waits. |
| Aesthetic/minimalist design | 3 | Restrained civic visual system; no gradient/marketing clutter. Expanded states become a large card-inside-card accordion, especially on mobile. |
| Error recovery | 2 | Initial load and some panels provide retry. Enrollment/leader failure states can read as empty data alongside an error and lack equivalent recovery affordances. |
| Help and documentation | 1 | Some useful microcopy exists, but modules, listed/unlisted behavior, immutable behavior type, and event generation are under-explained. |

## Screenshot evidence

- **Desktop collapsed:** the active Section has a large centered card with substantial unused space; Department is the dominant first decision, and the active navigation state is quiet.
- **Desktop expanded:** Department → 模組 → repeated module actions → 課程與活動 → program card → program detail produces multiple competing headings and action groups in one surface.
- **Mobile module state:** the outer card, Department frame, divider, and module rows create card-in-card nesting; labels wrap; full-width controls lengthen the page; bottom navigation competes for vertical attention.
- **Mobile task state:** `報名` appears at both module and program-task scopes; `聚會` and `聚會與時間表` are adjacent concepts; `出席` and `掃描簽到` similarly overlap; `課程與活動` is both Section context and navigation language. The task stack is readable, but not easy to orient within.

## Cognitive-load failures

- **Working memory:** users must remember Department → Program → task location; no breadcrumb or stable URL state.
- **Recognition:** pending requests and upcoming operational work are not visible until several levels are opened.
- **Visual hierarchy:** page → card → Department → Program → task nav → panel → rule/event list reaches six nested layers.
- **Language:** `報名`, `聚會`, and `出席` repeat at different scopes; recurrence and generation language is operational rather than user-shaped.
- **Decision load:** module toggles do not consistently reveal an attached surface; irrelevant recurrence fields and no conflict advisory increase uncertainty.
- **Consistency:** global busy/error behavior and confirmation patterns differ across panels.
- **Scale:** multiple open Departments/Programs can produce an arbitrarily long document; no search-first path exists.

## Emotional journey and primary jobs

**Member:** discover listed programs, inspect schedule/description, request enrollment, track pending/active/withdrawn state, and cancel when needed. Current path feels like staff tooling on first touch: expand Department → expand Program → details → 報名 → request. Relief arrives only after success.

**Admin/Teacher/Staff operator:** create or publish a Program, configure enabled capabilities, manage requests, assisted-enroll, assign/revoke leaders, and resolve upcoming events. The current page has the data but no operational heartbeat: no pending-request inbox, counts, or triage view.

**Program Leader:** manage an assigned Program's schedule/events and scoped enrollment/leader work. The controls are credible but buried; on a phone, a weather or schedule exception requires navigating through the same long hierarchy before the relevant event action appears. Current remote main does include per-occurrence event controls; the issue is reachability and context, not absence of that capability.

## Strengths to preserve

1. Honest domain states: request versus enrollment, decision notes, soft cancellation, lifecycle, discoverability, and scoped leadership.
2. Capability projection: users do not receive controls they cannot perform.
3. Accessibility and restraint: touch targets, visible focus, live announcements, reduced motion, HK time formatting, and civic visual language.
4. Good local patterns: reusable create/edit form, explicit empty states, idempotent requests, and confirmation for important destructive actions.

## Priority redesign issues

### P1 — Member and operator information architectures are the same tree

**Why:** the first interaction is Department selection even when the Member's job is find one available Program. This buries the primary CTA and makes the page feel like administration software.

**Direction:** role-adaptive landing views. Members get a flat listed `課程目錄`, with Department as a filter and enrollment state/next event visible in each result. Operators get operational triage and management. Keep capability checks server-authoritative.

### P1 — Program is not a first-class place

**Why:** Department accordion → Program accordion → five task controls → panel gives no durable wayfinding, URL/back semantics, or aggregate context.

**Direction:** make Program detail a first-class route/view with top-level jobs such as 概覽, 基本資料, 聚會, 報名, and 事工負責人. Keep Department/module configuration in a separate manager-only surface or a clearly bounded settings route. Add Department/Program counts, especially pending requests and upcoming events.

### P2 — Operational heartbeat is invisible

**Why:** an operator who needs to clear ten requests must open every Department and Program before learning what needs attention.

**Direction:** a small `待處理` summary or inbox, plus pending counts on relevant rows/navigation. Design for the first 60 seconds of Saturday-night approval work, not only for record editing.

### P2 — Scope and vocabulary collide

**Why:** screenshot labels repeat `報名`, `聚會`, `出席`, and `課程與活動` at page/module/program scopes. `attendance` and `custom_forms` toggles also need a visible destination or should not be presented as active choices here.

**Direction:** reserve each label for one scope; use explicit Program-detail sections; move capability configuration out of the catalog. Resolve canonical Chinese terms before code.

### P2 — Mobile is structurally long, not merely responsive

**Why:** full-width buttons and nested bordered containers are individually accessible but compound into a long, low-orientation phone workflow.

**Direction:** one primary object per view, one open context, sticky local context/header, direct task navigation, and a compact status/action summary. Scope busy and error states to the operation being performed.

### P3 — No scale path

**Why:** no search, filters, counts, sorting, or bulk actions. The accordion's cost grows with the number of Departments and Programs.

**Direction:** begin with a text filter and counts; add server-backed search/pagination only if the real catalog requires it. Avoid building a dashboard of decorative metrics.

## Domain-language risks to resolve

- Canonical repository language is **Section**, not “tab/page/screen”; user-facing `課程與活動` remains a product decision.
- `Program Leader` is currently `事工負責人` as a proposed translation, not a settled term.
- Repository glossary calls production roles Admin/Teacher/Member, while current UI logic also names `Staff`; this must be resolved before role-adaptive IA is encoded.
- Decide what `公開/不公開` means for directly linked Members and whether Members should see `部門` at all.

## Questions for the design tree

1. Should the Programs Section adapt by role: flat member catalog first for Members, operational triage for Admin/Teacher/Staff, and assigned-program work for Program Leaders?
2. Should Program become a first-class route/view, with Department/module configuration moved to manager-only settings?
3. What must an operator see first: pending enrollment requests, upcoming events, or catalog configuration? What is the 60-second Sunday/Saturday workflow?
4. Do we keep `課程與活動` as the user-facing Section label, and is `事工負責人` acceptable for Program Leader? Is `部門` member-facing or an operator filter only?
5. Is `產生聚會` a user-facing workflow, or should a calendar/event view make schedule materialization and per-date exceptions the primary interaction?

## Detector and run notes

- `impeccable detect.mjs --json` ran successfully on the Programs source surface with project configuration and `--no-config`: **0 findings**. A deliberately bad control stylesheet produced findings, confirming the detector was active.
- No detector ignore list or inline disable comments were present.
- Source-verified strengths include focus-visible rules, reduced-motion handling, 44px controls, tokenized colors, and ARIA labels.
- No authenticated live browser overlay/injection was possible; no credentials were requested or exposed. Local screenshots were the visual evidence used for this critique.
