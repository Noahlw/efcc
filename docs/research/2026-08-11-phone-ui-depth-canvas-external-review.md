# EFCC phone UI depth canvas: external review

**Date:** 2026-08-11  
**Scope:** Review the current phone canvas from interaction/software-design principles and first-party church-management product documentation. This note evaluates patterns; it does not recommend copying another product's layout.

## Verdict

There is no credible evidence for a universal rule that a phone screen must contain at most five element groups. The current `<= 5 groups` rule should become a diagnostic warning, not an acceptance criterion.

The stronger constraint is:

> One screen should support one coherent user task and one clear state context. Additional sections are acceptable when they help that task, remain visually subordinate, and do not introduce competing decisions.

Keep the canvas's limits of one primary action and two header actions as useful design hypotheses, then validate them in task-based usability tests. Preserve a stable bottom navigation of five or fewer destinations, because platform guidance specifically supports a small top-level navigation set; that evidence does **not** extend to all content sections on a page.

## Perspective 1: software and interaction-design principles

### The number five is being applied to the wrong unit

Nelson Cowan's primary review argues for a working-memory focus of roughly four chunks under constrained conditions. It studies memory capacity, not visible page regions, and therefore cannot justify hiding the sixth coherent section of a scrollable phone screen ([Cowan, 2001](https://pubmed.ncbi.nlm.nih.gov/11515286/)). Hick's experiments connect choice reaction time to information uncertainty among response alternatives; they support reducing simultaneous competing choices, not imposing a fixed count on informational groups ([Hick, 1952](https://journals.sagepub.com/doi/10.1080/17470215208416600)).

Apple recommends fewer top-level tabs and, for customizable tab bars, a default of five or fewer to preserve continuity across compact and regular layouts. This is navigation guidance, not a page-section limit ([Apple HIG: Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)). Apple separately recommends putting commonly used options high in a disclosure hierarchy and hiding advanced details until relevant ([Apple HIG: Disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)).

**Canvas consequence:** retain `<= 5 stable top-level destinations`; replace `<= 5 groups per screen` with a task-complexity review.

### Progressive disclosure should follow relevance, not arbitrary depth

W3C cognitive-accessibility guidance asks for logical sections, clear hierarchy, visible relationships, consistent placement, and separation of content that is not directly relevant to the page's main purpose ([W3C: Clear and understandable page structure](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o2p03-page-structure/)). It also recommends surfacing important tasks near the top ([W3C: Important tasks and features](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o2p01-site-important/)). For multi-step work, W3C recommends exposing current, completed, and pending steps so that users can recover after interruption ([W3C: Make each step clear](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p04-clear-steps/)).

Progressive disclosure is therefore useful for advanced configuration, destructive consequences, and branches that are irrelevant in the current state. It is harmful when it hides orientation, completed choices, or information needed to decide the next step.

**Canvas consequence:** overlays do not need a new navigation depth, but a wizard step is a real task state and must show orientation. A long Program or Event detail screen may exceed five semantic sections if all sections explain the same object and task.

### Information hiding is a boundary principle, not a small-module rule

Parnas argues that decomposition should isolate design decisions likely to change and allow a system to be understood one module at a time ([Parnas, 1972](https://citeseerx.ist.psu.edu/document?doi=5d752e29e29b42cc509417699a98d9dca8212c83&repid=rep1&type=pdf)). Applied to EFCC, Account settings, Program settings, Event settings, and Scanner configuration should belong to their owning scopes. A single global Settings page would expose unrelated decisions together and create coupling in both code and UI.

**Canvas consequence:** the current scope-owned settings decision is strong. Global gear means account/device preferences only; Program and Event controls live with those objects. Do not turn every individual setting into a deeper screen: inline controls are suitable when the state, impact, and authority are local and obvious.

### State machines clarify behavior better than adding more panels

Harel's Statecharts extend simple state diagrams with hierarchy and concurrency so complex reactive behavior can remain compact and compositional ([Harel, 1987](https://www.state-machine.com/doc/Harel87.pdf)). EFCC has independent state axes: Program lifecycle, Program availability, Event lifecycle, check-in window, registration state, attendance result, and scanner mode. Collapsing these into one status or one linear wizard creates impossible combinations and unclear transitions.

**Canvas consequence:** represent state transitions in the canvas separately from navigation depth. For example, `Active <-> Inactive` can be an inline Event control, while `Cancel event` is a consequential lifecycle transition. Scanner `Self | Assisted` is a mode transition, not another navigation level.

### Capability-based UI must preserve both security and orientation

Saltzer and Schroeder's principles include least privilege, fail-safe defaults, complete mediation, and psychological acceptability: people should receive only the authority needed, every access must be checked, and the interface should make correct secure use natural ([Saltzer and Schroeder, 1975](https://www.mit.edu/~Saltzer/publications/pubs.html)). Apple also warns that conditionally hiding top-level tab buttons makes navigation unstable ([Apple HIG: Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)).

**Canvas consequence:** keep stable top-level destinations for signed-in users; capability-filter actions and scoped management entry points inside them. Derive UI from server-provided effective capabilities and object scope, not client-side role names. Hidden UI is not authorization; the API must enforce the same capability on every mutation.

## Perspective 2: comparable church-management products

### Reusable patterns

| Observed first-party behavior | Reusable EFCC pattern |
| --- | --- |
| Planning Center positions Church Center as the congregation-facing web/mobile space, while staff administration remains in purpose-specific products. Church Center covers profiles, registered events, groups, calendar, directory, and forms; its mobile app adds check-in ([Planning Center: Set up Church Center](https://pcoaccounts.zendesk.com/hc/en-us/articles/360010614793-Set-up-Church-Center)). | Participant experience should remain the default surface. Management is a capability-aware entry, not the first screen for every leader. Operational tools can share identity and design language without sharing one crowded home screen. |
| Planning Center lets churches remove pages from navigation while preserving direct-link access ([Planning Center: Set up Church Center](https://pcoaccounts.zendesk.com/hc/en-us/articles/360010614793-Set-up-Church-Center)). | Navigation visibility and route reachability are separate decisions. EFCC registration links and QR destinations must remain deep-linkable even when not present in primary navigation. |
| ChurchSuite's member-facing My Events is searchable and shows event details and signup. Designated event overseers gain signup-list and check-in actions only on events they oversee ([ChurchSuite: My Events](https://support.churchsuite.com/article/671-my-churchsuite-my-events)). | Add scoped management capability at the relevant Program/Event instead of forcing a global role switch for every small leadership task. The Management mode remains useful for directory-wide work. |
| ChurchSuite opens event check-in as an event-specific register, supports camera QR scanning, and filters long lists by search/ticket. Its operational settings alter that check-in session ([ChurchSuite: Event check-in](https://support.churchsuite.com/article/379-event-check-in)). | Assisted scanning must pin the selected Program **and Event**. Scanner settings that affect the current scanning session belong in Scanner/Event context, not Account settings. |
| ChurchSuite distinguishes one-off events from linked sequences and lets signup apply to one occurrence or the whole sequence ([ChurchSuite: Calendar module](https://support.churchsuite.com/article/532-getting-started-with-the-calendar-module)). | Keep Program recurrence and Event occurrence explicit. Registration scope must say whether the person joins one Event or the Program/series; do not infer it from visual nesting. |
| ChurchTrac supports separate Quick Entry, Live, Check-In, roll-sheet, and leader/mobile attendance modes ([ChurchTrac: Entering Attendance](https://www.churchtrac.com/support/attendance/entering-attendance)). Its check-in station also separates staff and self modes ([ChurchTrac: Check-In on a computer](https://www.churchtrac.com/support/check_in/using-check-in-on-a-computer)). | Attendance is one domain with distinct task modes. EFCC's Self-first camera, capability-gated Assisted tab, and guest public journey are justified; forcing all modes into one universal chooser would add friction. |
| ChurchTrac allows registration for authenticated users or anyone, and recommends lower-friction public registration for camps and concerts ([ChurchTrac: Who can register](https://www.churchtrac.com/support/events/who-can-register-for-events)). | Preserve public direct registration/check-in paths for one-off outreach events while keeping member context when available. Do not require account creation merely to enter a public event flow. |
| Planning Center and ChurchTrac both expose settings and permissions within products, calendars, events, stations, or signups rather than treating all configuration as personal account settings ([Planning Center: Account permissions](https://pcoaccounts.zendesk.com/hc/en-us/articles/204462420-Permissions-in-account-settings), [ChurchTrac: Events overview](https://www.churchtrac.com/support/events/events-screen-overview)). | Keep settings scope-owned and explain the affected scope before mutation. A global account gear should not become an administrative junk drawer. |

### Counterexamples and risks

1. **Do not reproduce a product-suite split inside one phone app.** Planning Center's separate products create strong responsibility boundaries, but EFCC would pay a high switching cost if every domain became a separate mini-app. Reuse the boundary, not the packaging.
2. **Do not copy desktop admin hubs to phone.** ChurchTrac's Events & Attendance hub combines calendar, attendance, registrations, reports, calendars, and options. That breadth is valid for management, but on phone it should become task-specific routes and modes rather than one dense tabbed screen.
3. **Do not overuse a Participant/Management gateway.** ChurchSuite demonstrates that a member-facing event can reveal overseer operations in context. EFCC should default to Participant, provide a compact Management entry for broad work, and still allow contextual management actions on an owned Program/Event.
4. **Do not confuse a Program QR with a check-in result.** A Program QR can resolve to several currently eligible Events. The canvas correctly needs an Event picker in that state; the picker must show date, time, and location and then return to the scanning task.
5. **Do not make capability-driven navigation feel unstable.** Keep the app's main places predictable. Change actions, badges, and scoped entries based on capability; do not reshuffle the whole shell for each role.

## Review of the current canvas

### Keep

- Separate `navigation depth`, `scope`, and `mode`; this prevents sheets and scanner modes from becoming fake page levels.
- Participant default plus compact Management entry.
- Stable Scanner destination with Self as the default and Assisted as a capability-gated mode.
- Event picker for ambiguous Program QR resolution.
- Scope-owned settings and inline `Active / Inactive` where impact is local and reversible.
- One primary action and at most two header actions as initial phone-design constraints.

### Change

1. **Normalize depth numbering.** `D0` should always be the shell/public entry. A Scanner tab is a `D1` top-level destination, not `D0`; QR resolution and Event selection follow beneath it as task states.
2. **Collapse the participant landing/directory duplication.** If participants default to Programs, search, personal Programs, upcoming Events, and discovery filters can coexist on one `D1` landing with progressive sections. A separate directory depth is justified only when the user explicitly chooses Browse All.
3. **Split Management D4 by task family.** The current `Focused operation` groups create/edit, approvals, roster, settings, and audit feedback. They may share depth but must be separate screen families with separate state models.
4. **Replace the hard group count.** A five-group display badge encourages gaming the count by merging unrelated content. Use the review rubric below.
5. **Add contextual elevation.** A Program Leader should be able to open management actions from a Program/Event they own without always returning through the Management gateway.
6. **Model long and exceptional states.** Add variants for no eligible Event, multiple eligible Events, permission lost, offline/camera denied, duplicate attendance, stale update, and destructive transition consequences.

## Replacement complexity budget

Evaluate every phone screen using these questions instead of a fixed section count:

1. **Dominant job:** Can the screen's purpose be stated with one verb-object phrase?
2. **Decision competition:** How many unrelated choices demand attention at once? Reduce these before reducing passive information.
3. **State coherence:** Do all visible controls act on the same object, task, or temporary mode?
4. **Action hierarchy:** Is there at most one visually dominant action, with secondary actions visibly subordinate?
5. **First viewport:** Are identity, current state, and the most likely task visible without scrolling?
6. **Progressive disclosure:** Is hidden content genuinely advanced or currently irrelevant, rather than required for orientation or a safe decision?
7. **Capability clarity:** Can the user understand why an action is available or unavailable, and does the server enforce the same rule?
8. **Recovery:** Can the user recover from interruption, denial, ambiguity, duplicate action, or failure without restarting?

Use `> 5 groups` as a review trigger. Permit it when the groups support one coherent task and scan well; reject even a three-group screen when the groups represent competing jobs.

## Recommended canvas revision

The next canvas should show four overlays on the same map:

- **Place:** Shell -> top-level destination -> object workspace -> focused task.
- **Scope:** Global -> Department -> Program -> Event -> Attendance/Enrollment record.
- **Mode:** Participant / Management and Self / Assisted / Guest.
- **State:** lifecycle, availability, eligibility, check-in window, permission, and result/recovery.

For every screen node, record `dominant job`, `first-viewport contract`, `primary action`, `secondary sections`, `capability gate`, and `state variants`. Record the number of groups only as an observation, not a pass/fail limit.
