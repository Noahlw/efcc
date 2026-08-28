# 092 — Whole-Product UI Architecture, 身份組, and Design-System Adoption

**Status:** Draft for owner review — planning only; no implementation authorized  
**Planning baseline:** `feat/s4-12-shadcn-migration` at `f1b77c0e`  
**Backend/domain authority:** Spec 091 and ADR-0042  
**Design-system authority:** ADR-0043, the approved Civic Minimal contract, and this specification after owner approval  
**Scope:** Every shipped product route; `/prototype`, historical evidence pages, and unimplemented surfaces are excluded  

> This specification defines a target. It does not claim the target is shipped. It does not authorize code, CSS, tests, schemas, migrations, fixtures, deployment, or data changes. A separate implementation plan may be written only after the owner approves this specification and its route/module, finding-disposition, phase, and verification matrices.

## Problem Statement

EFCC currently has a strong Worker/D1 authorization foundation, a working Shared Shell, a locally owned shadcn/Radix primitive layer, and a clear Civic Minimal visual identity. Those strengths are not consistently expressed across the shipped product.

Many screens still implement equivalent controls, layouts, asynchronous states, responsive action surfaces, focus behavior, and feedback independently. The result is visible and structural drift: raw controls remain beside local shadcn primitives; route-specific CSS repeats spacing and breakpoint recipes; related directories and feeds solve the same presentation problems differently; management action surfaces disagree about phone and desktop behavior; account settings has competing implementations; the Programs Workspace concentrates too many task implementations in one place; and several routes have audit-backed recovery, announcement, target-size, overflow, or stale-test defects.

Tony's rebased layout/WCAG work hardens important contracts, but it is not a wholesale modular rewrite. It adds or strengthens primitive hooks, target sizes, functional borders, spacing tokens, overflow behavior, management layout rules, and geometry tests. Most older route implementations still do not consume those contracts consistently. The declared spacing scale is effectively unused, literal geometry remains widespread, and some source/test assumptions disagree.

The existing permission surface is also built around a fixed-role model that cannot implement Spec 091. One eligible Active Account must be able to hold several useful 身份組; categories, hierarchy, scope, assignments, grants, effective access, revisions, idempotency, and audit must remain server-owned. The product must support both identity-first and account-first work without presenting identities as decorative badges or letting the browser become the authority.

The owner therefore needs one integrated, planning-only specification that:

- covers every shipped screen rather than only the permissions route;
- establishes where shared UI modules earn their keep and where domain behavior remains local;
- makes local shadcn/Radix the default whenever semantics and behavior are equivalent;
- moves production route/module styling to Tailwind without replacing EFCC's visual identity;
- preserves current non-permission workflows except for audit-backed defects;
- defines the coordinated stackable 身份組 experience from Spec 091;
- divides the eventual work into manageable, dependency-ordered phases; and
- prevents unintended UI drift through behavioral and CSS-pixel geometry tests rather than screenshots.

## Solution

Create one governed whole-product UI architecture with four layers:

1. **Domain and authorization truth.** Spec 091 remains the authority for Role Categories, Role Definitions, Role Assignments, grants, scopes, hierarchy, revisions, idempotency, audit, and the safe pre-production reset. The Worker recomputes every authority decision. The browser receives only affordance and explanation projections.
2. **Owned primitive foundation.** Local shadcn/Radix modules provide equivalent controls and interaction semantics. Missing official modules are added only when a shipped caller needs them. Native controls remain only for a documented semantic, platform, or domain reason.
3. **Deep EFCC task modules.** Repeated product behavior—shell, contextual task headers, async lifecycle, responsive mutation actions, directory frames, feed presentation, settings structure, announcement ownership, Programs Workspace task composition, identity management, permission editing, and account access—is concentrated behind small interfaces. Route composition retains domain queries, validation, rows, filters, permission decisions, and mutations.
4. **Local route composition.** Every shipped route adopts the shared contracts, uses Tailwind utilities, preserves its domain workflow, fixes its classified audit defects, and deletes the obsolete implementation it supersedes.

The visual target preserves Civic Minimal: Cantonese-first copy, cinnabar action emphasis, teal focus, light civic surfaces, functional borders, restrained elevation, and phone-first operation. Layout, spacing, density, content width, and responsive composition may be re-baselined after owner review because the current screens are not the target.

Equivalent custom controls are replaced through a clean cutover: migrate every caller, update tests at the highest useful seam, remove obsolete controls and CSS, and record only justified exceptions. The plan will not create generic schema-driven Form or DataTable engines, compatibility wrappers, or modules for one-off visual fragments.

The identity experience coordinates two views over the same server-owned model:

- **Identity-first:** 身份組列表 → 身份組詳情 → 權限編輯 / 已指派帳戶 / permitted definition actions.
- **Account-first:** Account detail → stacked 身份組 assignments → atomic add/revoke review → effective access grouped by scope with grant provenance.

The eventual delivery is a gated phase stack: planning approval; backend/domain cutover and role-blind UI foundation in parallel; shared behavior modules; 身份組 integration; domain route-family polish waves; whole-product cleanup and evidence. Intermediate phases remain testable but are not partially released to users.

## User Stories

### Planning, authority, and scope

1. As a product owner, I want one specification for the whole shipped UI and the stackable 身份組 change, so that agents do not optimize isolated screens against conflicting assumptions.
2. As a product owner, I want current implementation truth separated from target behavior, so that proposed functionality is never described as shipped.
3. As a product owner, I want Spec 091 to remain the backend/domain authority, so that UI architecture does not duplicate or weaken authorization truth.
4. As a product owner, I want this specification to own whole-product UI architecture and adoption, so that component, styling, identity-journey, and verification decisions live together.
5. As a product owner, I want every shipped route included, so that the result does not leave visually or structurally obsolete screens behind.
6. As a product owner, I want `/prototype` excluded from product completion, so that historical evidence is not polished as a second application.
7. As a product owner, I want every shipped audit finding classified, so that no known defect disappears between audit and implementation planning.
8. As a product owner, I want P0/P1 findings resolved before release, so that severity is not traded for schedule invisibly.
9. As a product owner, I want lower-severity visual findings included when a route is already being polished, so that touched screens finish coherently.
10. As a future maintainer, I want historical evidence retained with truthful provenance, so that old decisions remain understandable without becoming active instructions.
11. As a product owner, I want implementation blocked until I approve this specification and its planning matrices, so that code is not written from an unreviewed design.
12. As a product owner, I want a separate implementation plan after specification approval, so that sequencing is reviewed independently of product intent.

### Civic Minimal and whole-product polish

13. As a Member, I want every shipped screen to feel like one church system, so that I do not need to relearn controls between tasks.
14. As a Staff operator, I want dense operational screens to remain calm and scannable, so that I can work quickly during church operations.
15. As an Admin, I want desktop layouts to expand the same task model rather than become a different product, so that phone and PC context remain transferable.
16. As a Cantonese-speaking user, I want primary product copy in clear Traditional Chinese, so that technical capability vocabulary does not block my work.
17. As a product owner, I want the full church identity and Civic Minimal visual language preserved, so that shadcn adoption does not turn EFCC into generic SaaS.
18. As a product owner, I want cinnabar reserved for primary action and active emphasis, so that it retains visual authority.
19. As a keyboard user, I want the teal focus system preserved across every migrated control, so that focus remains visible and predictable.
20. As a phone user, I want layouts that fit at 320px without horizontal overflow, so that the product works on the narrowest supported screen.
21. As a tablet user, I want the 799px phone-shell behavior preserved, so that the dock does not disappear before the established transition.
22. As a desktop user, I want the rail transition at 800px preserved, so that existing navigation and evidence remain valid.
23. As a user with long CJK or Latin content, I want text to wrap and remain contained, so that real church names and messages do not break layouts.
24. As a user with browser zoom or increased text spacing, I want content to reflow without losing actions, so that accessibility settings remain usable.
25. As a user, I want layout changes to improve hierarchy, spacing, density, and responsive composition without silently changing domain outcomes, so that polish does not alter church operations.
26. As a product owner, I want only audit-backed workflow defects fixed outside permissions, so that this broad UI program remains bounded.

### Shadcn/Radix adoption

27. As a product owner, I want local shadcn/Radix used whenever semantics and behavior are equivalent, so that shared controls become the default rather than optional examples.
28. As an accessibility reviewer, I want equivalence judged by role, state, keyboard, focus, disabled, error, and responsive behavior, so that a matching component name is not mistaken for a correct replacement.
29. As a contributor, I want missing official shadcn modules added only when a shipped caller needs them, so that the repository does not vendor unused catalog surface.
30. As a maintainer, I want obsolete custom controls removed after migration, so that two component systems cannot drift.
31. As a maintainer, I want obsolete exports, wrappers, CSS, and implementation-shaped tests removed with their callers, so that clean cutover is complete.
32. As an accessibility reviewer, I want native controls retained only with a documented semantic, platform, or domain reason, so that native shape is not used as an unexamined exception.
33. As a scanner user, I want camera, video, device, and other required platform surfaces to retain correct native behavior, so that component adoption does not break hardware interactions.
34. As an operator, I want approval selection to use the local Checkbox with correct mixed, checked, disabled, keyboard, and accessible-name behavior, so that batch work is consistent and usable.
35. As an operator, I want permission toggles to use native Radix Switch semantics, so that assistive technology announces `switch` and checked state correctly.
36. As a contributor, I want base primitives minimally customized through EFCC tokens and proven variants, so that route-specific behavior does not leak into global controls.
37. As a contributor, I want durable slot and state hooks preserved where useful, so that tests and styling can observe contracts without relying on source class strings.
38. As a product owner, I want no compatibility wrappers after all callers migrate, so that old interfaces cannot be reintroduced accidentally.
39. As a maintainer, I want no generic schema-driven Form engine, so that domain validation remains local and understandable.
40. As a maintainer, I want no generic schema-driven DataTable engine, so that domain rows, filters, permissions, and mutations do not become configuration conditionals.

### Tailwind and token governance

41. As a contributor, I want production route and module styling expressed with Tailwind utilities, so that repeated authored CSS recipes are reduced.
42. As a maintainer, I want migrated CSS Modules deleted, so that Tailwind and old page CSS do not remain parallel styling systems.
43. As a platform maintainer, I want global authored CSS limited to tokens, base/document behavior, safe-area/platform rules, and behavior Tailwind cannot express cleanly, so that exceptions remain visible.
44. As a design-system maintainer, I want one complete token contract for color, spacing, typography, radius, borders, elevation, control size, width, layering, motion, and breakpoints, so that visual values cannot drift independently.
45. As a product owner, I want Civic Minimal colors preserved while geometry may be re-baselined, so that polish improves the product without replacing its identity.
46. As a contributor, I want shadcn primitives and EFCC task modules to consume the same tokens, so that foundation and product modules cannot diverge.
47. As a contributor, I want a named Tailwind breakpoint at 800px for the shell, so that utility classes encode the actual product transition.
48. As a contributor, I want evidence viewports kept separate from breakpoint tokens, so that the stylesheet does not gain a breakpoint for every tested width.
49. As a reviewer, I want token values approved before they become exact regression expectations, so that current inconsistent values are not frozen accidentally.
50. As a user with reduced-motion preferences, I want motion behavior governed centrally and suppressed when requested, so that migrated overlays and state changes remain comfortable.

### Shared module architecture

51. As a maintainer, I want the Authenticated Shell to remain one deep module, so that session restore, server-projected navigation, phone dock, desktop rail, shell scrolling, skip links, and safe-area reserve stay coordinated.
52. As a security reviewer, I want navigation projection kept separate from authorization, so that hiding a route is never treated as permission enforcement.
53. As an authenticated user, I want focused task and detail screens to share a contextual header with Back, title, lead, status, action, and focus behavior, so that navigation remains predictable.
54. As a product owner, I want Home, sign-in, scanner, guest entry, and not-found composition to remain purpose-specific, so that a universal header does not flatten distinct contexts.
55. As a user waiting for data, I want repeated loading, retry, focus, and announcement behavior owned by a shared async lifecycle, so that every route recovers consistently.
56. As an authenticated user whose session expires, I want a narrow shared deep-link and redirect behavior, so that I can sign in and return without each route implementing recovery differently.
57. As a route maintainer, I want domain requests, copy, result models, and authorization decisions to remain in local adapters, so that the shared lifecycle does not become a global data layer.
58. As an operator with unsaved or selected work, I want one responsive action-surface policy, so that dirty, review, selection, save, busy, failure, and conflict actions never cover content or the phone dock.
59. As a phone user, I want complex action surfaces in document flow with safe-area clearance, so that the final content and action remain reachable.
60. As a desktop operator, I want action placement optimized for management density without changing semantics, so that the same task remains efficient on PC.
61. As a directory user, I want shared search/filter/list/detail geometry, focus restoration, pagination or virtualization hooks, and state slots, so that Account, Member, and Program directories behave consistently.
62. As a domain maintainer, I want each directory to retain its own queries, filters, rows, URL vocabulary, authorization, and mutations, so that the shared directory interface remains small.
63. As a feed user, I want notices, messages, Home announcements, and program notifications to share list/detail/loading/error/empty presentation, so that communication surfaces feel related.
64. As a domain maintainer, I want read state, fetching, routing, and domain actions to remain local, so that a shared feed does not conflate different products.
65. As an account holder, I want one richer shipped settings module with success, authentication, forbidden, retry, focus, and announcement behavior, so that `/profile/settings` is not a weaker parallel implementation.
66. As a maintainer, I want the dead parallel account-settings implementation removed, so that fixes have one owner.
67. As a Programs maintainer, I want Events, Participants, Notifications, and Settings split into focused internal modules behind one workspace interface, so that changes remain local without changing routes or task intent.
68. As an attendance maintainer, I want the proven guest, self, assisted, and operator seams preserved, so that control migration does not produce a generic scanner framework.
69. As a screen-reader user, I want one announcement owner per transition, so that visible status and the global live region do not announce the same event twice.
70. As a maintainer, I want fallback, forbidden, recovery, and inline resource states kept distinct when their user actions differ, so that a generic state component does not hide meaning.

### Stackable 身份組 hierarchy

71. As an Admin, I want Admin pinned at the top of the 身份組 hierarchy, so that the protected authority anchor is obvious.
72. As an Admin, I want Admin permissions visible, enabled, and locked, so that the invariant is transparent.
73. As an operator, I want `會友基礎` visible at the bottom, so that every Active Account's automatic participant baseline is clear.
74. As an operator, I want Role Categories shown as non-assignable structural headings, so that organization does not inflate an account's identity set.
75. As an operator, I want each Department to own its own Program identity category, so that identities from different Departments remain unambiguous.
76. As an operator, I want each scoped identity to show its Department or Program scope, so that similar names remain distinguishable.
77. As an operator, I want the hierarchy initially concise with child counts, so that a large organization remains scannable.
78. As an operator, I want expanded state local to my current screen, so that another user or device is not affected.
79. As an authorized operator, I want to drag a movable Role Definition among siblings in its fixed category, so that reordering is efficient.
80. As a keyboard or non-drag pointer user, I want complete `上移` and `下移` alternatives, so that ordering never depends on drag.
81. As an operator, I want Role Categories fixed and read-only, so that structural church organization cannot be changed accidentally through identity management.
82. As an operator with a stale order draft, I want to compare authoritative and local order and choose `保留我的排序` or `採用最新排序`, so that concurrent changes are explicit.
83. As an authorized Admin, I want to create global or scoped identities through an explicit guided choice, so that scope is never inferred.
84. As an authorized Staff operator, I want only permitted scoped creation shown, so that unavailable global authority is not offered.
85. As an operator, I want new identities to begin with zero grants, so that authority is deliberate.
86. As an authorized operator, I want to rename an identity without changing its stable ID or assignments, so that corrections preserve history.
87. As an operator, I want archived identities excluded from new assignment while their history remains explainable, so that lifecycle does not erase accountability.
88. As a security reviewer, I want server projections to determine visible actions while the Worker still rejects tampering, so that UI affordance is never authority.
89. As an operator, I want selected identity and view encoded safely in the URL, so that refresh, Back, and shared links preserve context.
90. As an operator following malformed identity or view parameters, I want a safe fallback, so that bad links cannot expose or mutate unintended data.

### Permission editing

91. As an operator, I want the flow `身份組列表 → 身份組詳情 → 權限編輯`, so that one task does not compete with the whole hierarchy.
92. As an operator, I want one selected identity per permission task, so that I always know what I am changing.
93. As an operator, I want a visible permission search field, so that I can find a capability quickly.
94. As an operator, I want permission categories visible as headings in one continuous list, so that traversal and search remain predictable.
95. As a screen-reader user, I want every editable permission exposed as a Radix switch with checked state, so that it uses expected semantics.
96. As a keyboard user, I want expected switch keyboard interaction, so that every permission is operable without a pointer.
97. As an operator, I want locked permission rows visible with a reason, so that a non-editable control does not look broken.
98. As a Staff operator, I want my highest identity protected from self-editing, so that I cannot widen my own authority.
99. As an authorized operator, I want a revision-bound atomic draft, so that partial permission writes cannot occur.
100. As an operator, I want permission controls locked while saving, so that a second edit cannot disappear.
101. As an operator, I want a non-conflict save failure to preserve my draft and offer recovery, so that transient failure does not erase work.
102. As an operator, I want a revision conflict to restart from authoritative server state, so that stale grants are never silently merged.
103. As an operator with a small change set, I want a capped review Sheet, so that review is quick without covering the editor.
104. As an operator with a large or high-risk change set, I want a dedicated review view, so that consequences remain readable.
105. As a phone user, I want review and save actions that never block the viewport or dock, so that the final permission and action remain reachable.
106. As an operator, I want a successful save to return and display the authoritative revision, so that I know which policy I am viewing.

### Account-first assignment and effective access

107. As a church operator, I want one eligible Active Account to hold several non-Admin identities, so that real responsibilities can coexist.
108. As an operator, I want assignment available from both identity detail and Account detail, so that I can work from either mental model.
109. As an operator, I want a searchable eligible-account picker, so that Pending, Suspended, and Inactive accounts do not clutter assignment work.
110. As a security reviewer, I want ineligible accounts rejected server-side even if a request is tampered with, so that UI filtering is not authority.
111. As an operator, I want several identity additions and revocations for one account committed atomically, so that access cannot become half-updated.
112. As an operator, I want one invalid identity to reject the whole account-level operation, so that failure is unambiguous.
113. As an operator revoking an identity, I want lost and retained access explained before confirmation, so that I understand the impact.
114. As an operator, I want effective access grouped by global, Department, and Program scope, so that stacked identities read as useful access rather than medals.
115. As an operator, I want to see which identity supplies an effective permission, so that access can be diagnosed without reading technical keys.
116. As a security reviewer, I want grants combined additively within explicit scope, so that one assignment cannot silently subtract another grant.
117. As a security reviewer, I want receiving another identity never to widen an existing scope, so that scope remains local and explicit.
118. As a product owner, I want multi-account bulk assignment excluded from the first cutover, so that the atomic one-account contract remains manageable.

### Audit-backed workflow repair

119. As a registering user, I want field-level validation, focus, and heading structure corrected, so that I can recover from invalid input.
120. As a Home user, I want valid announcement actions and history behavior, so that links do not disappear silently or trap Back navigation.
121. As an Account Directory operator, I want correct descriptions and recoverable detail/load-more failures, so that partial data errors do not strand me.
122. As an approval operator, I want reliable detail retry, state styling, and dialog behavior, so that an approval can recover from failure.
123. As an attendance operator whose session expires, I want the same deep-link recovery as other authenticated tasks, so that I am not stranded.
124. As a scanner operator whose session expires, I want a safe redirect and return path, so that assisted attendance can resume correctly.
125. As a Programs operator, I want event exception state to have one authoritative source, so that the detail and editor cannot disagree after mutation.
126. As a user, I want status changes announced once, so that duplicate live regions do not repeat feedback.
127. As a user, I want every app-facing target to meet the approved minimum, so that Back and close actions remain usable on phone.
128. As a user, I want raw controls replaced where an equivalent local primitive exists, so that focus and visual behavior remain consistent.
129. As a maintainer, I want stale live UI contracts refreshed to current observable copy and behavior, so that green tests mean the product is correct.
130. As a product owner, I want intentional route-specific behavior marked Preserve, so that modularization does not erase useful differences.

### Phasing, evidence, and release

131. As a product owner, I want the eventual work divided by dependency, so that each phase is manageable and reviewable.
132. As an engineer, I want backend/domain cutover and role-blind UI foundation allowed to proceed in separate owned lanes after planning approval, so that safe parallelism shortens delivery.
133. As an engineer, I want shared module interfaces frozen before route-family fan-out, so that parallel routes do not recreate duplicated patterns.
134. As a reviewer, I want explicit merge gates between phases, so that defects do not accumulate into a final big-bang review.
135. As a reviewer, I want every phase to complete its contract, focused tests, affected journeys, responsive evidence, and obsolete-code removal, so that compiling is never mistaken for done.
136. As a product owner, I want route polish grouped by domain family, so that ownership is clear without creating one phase per route.
137. As a release owner, I want no partial production release, so that users never see mixed old and new systems.
138. As a test maintainer, I want existing high seams preferred over new ones, so that behavior is proven with the fewest durable contracts.
139. As a test maintainer, I want pinned local Chromium to own numeric UI geometry, so that CSS-pixel references are reproducible.
140. As a reviewer, I want every shipped route's canonical ready state tested at 320, 390, 600, 799, 800, 1024, and 1440 CSS px, so that the supported responsive range is explicit.
141. As a reviewer, I want material risk states tested at the widths where composition changes, so that the suite avoids an unmanageable full Cartesian product.
142. As a reviewer, I want both 799px and 800px exercised for shell-sensitive states, so that the product transition cannot drift.
143. As a test maintainer, I want critical anchors per screen rather than every DOM node, so that geometry tests protect the layout without becoming data snapshots.
144. As a reviewer, I want tokens, breakpoints, semantic state, minimum targets, containment, overflow, and no-overlap rules exact, so that core contracts cannot drift.
145. As a test maintainer, I want approved rectangles, gaps, widths, and sizes compared with small documented tolerances, so that font rendering does not create noise.
146. As a content user, I want text tested for wrapping and containment rather than exact height, so that realistic copy changes do not cause brittle failures.
147. As a product owner, I want geometry baselines recorded only after reviewing the polished live target, so that current poor layouts are not frozen.
148. As a product owner, I want no screenshot capture or image comparison, so that approval and regression evidence remain numeric and behavioral.
149. As an accessibility reviewer, I want keyboard, VoiceOver/NVDA, reduced-motion, forced-colors, reflow, text-spacing, and real-device evidence retained as human gates, so that automation does not claim WCAG conformance.
150. As a release owner, I want any unresolved P0/P1, WCAG AA failure, missing required human evidence, stale provenance, or mixed implementation to block release, so that readiness remains truthful.

## Implementation Decisions

- Spec 091 remains the backend/domain authority. This specification owns whole-product UI architecture, shadcn/Tailwind adoption, coordinated 身份組 journeys, audit dispositions, phased delivery, and UI verification.
- The planning scope covers every shipped route and implemented material state. `/prototype`, historical evidence pages, and future unimplemented surfaces are excluded.
- Civic Minimal remains the visual authority. Cantonese-first copy, cinnabar action emphasis, teal focus, light civic surfaces, and phone-first operation are preserved. Layout geometry may be re-baselined after owner review.
- Existing non-permission workflows remain stable except for audit-backed correctness, recovery, feedback, accessibility, overflow, obstruction, stale-contract, and dead-end defects.
- Local shadcn/Radix is the default when semantic and behavioral equivalence is proven. Equivalence includes accessible role/state, keyboard behavior, focus, responsive behavior, loading/disabled/error behavior, and the required product interaction.
- Missing official shadcn modules are added only when a shipped caller requires them. Only required dependencies are accepted.
- Native controls require a documented semantic, platform, or domain exception. Device and document semantics remain native where that is the correct product behavior.
- Primitive source is locally owned but minimally customized. EFCC theming and proven accessibility/product variants belong in the primitive; route-specific layout and domain behavior do not.
- Every approved replacement is a clean cutover. All callers migrate, obsolete controls and styling are deleted, and no permanent compatibility wrapper remains.
- Production route and module styling moves to Tailwind utilities. Authored global CSS remains only for tokens/theme bridges, base/document behavior, safe-area/platform selectors, and behavior Tailwind cannot express cleanly.
- The token contract is reconciled as one system covering color, spacing, typography, target/control size, radius, border, elevation, content width, layering, motion, and responsive breakpoints.
- A named Tailwind shell breakpoint is fixed at 800px. Evidence widths are not automatically breakpoint tokens. Routes add another breakpoint only for a documented domain transition.
- No generic schema-driven Form or DataTable engine is introduced. Domain validation, queries, rows, filters, permission decisions, and mutations remain local.
- The Authenticated Shell remains a deep EFCC module that owns restore surfaces, server-projected navigation, phone dock, desktop rail, shell scroll, skip link, safe-area reserve, and the 800px transition.
- A shared Contextual Task Header owns Back, title, lead, status/action slots, focus target, and responsive spacing for authenticated task/detail screens. Home, sign-in, scanner, guest entry, and not-found remain purpose-specific.
- The existing async lifecycle is deepened to own repeated loading, request generation, retry, focus transfer, announcement discipline, and a narrow authentication-required deep-link/redirect behavior. Route adapters retain domain requests, copy, result models, and authority decisions.
- One responsive Action Surface owns dirty, review, selection, save, busy, failure, and conflict presentation. It remains in flow on phone, respects dock/safe-area clearance, supports capped expansion, and may use a denser desktop placement without changing semantics.
- A Directory Frame shares responsive search/filter/list/detail composition, state slots, focus restoration, and pagination/virtualization hooks. Each directory retains its own row, filters, query, URL vocabulary, permissions, and mutations.
- A Feed Presentation module shares list/detail/loading/error/empty composition and announcement discipline. Read state, fetching, routing, and domain actions remain in route adapters.
- Settings use one shared structure. The richer account-settings behavior becomes the sole shipped implementation; the weaker parallel implementation is removed.
- Programs Workspace remains one external task interface but is implemented through focused Events, Participants, Notifications, and Settings modules sharing workspace context and common state modules.
- Existing attendance and scanner seams are preserved. Control and token adoption must not create a generic scanner framework or merge guest, self, assisted, and operator policy.
- Fallback, forbidden, recovery, and inline resource states remain distinct when their actions differ.
- One announcement owner is selected per transition. A visible status and the global polite region may not announce the same transition twice.
- Identity management supports coordinated identity-first and account-first entry points over the same server-owned projections.
- Admin is protected highest, visible, all-on, locked, seeded/operational only, and exclusive of lower product Role Assignments. `會友基礎` is automatic lowest, visible, and locked. Role Categories are fixed, read-only, non-assignable, and grant no authority.
- Department and Program identities carry exactly one explicit scope. Effective permissions combine additively within scope.
- Identity hierarchy supports local expansion, sibling-only Role Definition drag reorder, full non-drag move alternatives, and explicit order-conflict recovery. Categories never move in the app.
- Identity creation is guided: global/scoped choice, existing allowed category and scope, position/limit preview, unique name, empty identity, then separate permission configuration. Staff never sees unavailable global creation and may rename/rescope lower identities only inside its authority.
- Permission editing handles one selected identity, visible search, continuously rendered permission groups, Radix Switch semantics, locked explanations, an atomic revision-bound draft, save lock, failure preservation, and authoritative conflict restart.
- Small permission change sets use a capped Sheet. Large or high-risk sets use a dedicated review view. Review never becomes a viewport-blocking sticky panel.
- Account detail supports atomic multi-identity changes for one eligible Active Account, explains lost/retained access, groups effective access by scope, and identifies grant provenance. Multi-account bulk assignment remains excluded.
- Every audit finding on a shipped route receives `Must Fix`, `Covered by Shared Migration`, `Preserve`, or `Defer` with a reason. All shipped P0/P1 findings resolve before release.
- The eventual work is divided into: planning approval; backend/domain cutover and role-blind UI foundation in parallel; shared behavior modules; 身份組 integration; domain route-family polish waves; whole-product cleanup and evidence.
- Shared module interfaces freeze before route-family parallelism. Shared files have one integration owner. Phase handoff requires contract completion, focused tests, affected journeys, responsive evidence, and obsolete-path removal.
- No intermediate phase is promoted to production. The complete product passes final gates before production promotion is considered separately.
- This planning phase ends with owner approval of this specification and its planning matrices. A separate implementation plan then requires its own approval. No implementation follows automatically.

## Testing Decisions

- Good tests assert external behavior and user outcomes, not source class strings, implementation names, or whether an equivalent control happens to be native.
- Tests use the highest seam that can prove the contract. Lower-seam duplication is added only for a distinct failure mode.
- The preferred seams are:
  1. Worker HTTP/D1 for normalized constraints, authority, atomicity, revisions, idempotency, audit, and reset safety.
  2. Shared module interfaces for finite-state behavior, focus, announcements, responsive composition, and control semantics.
  3. Authenticated Playwright route journeys for URL state, server-shaped affordances, mutation outcomes, and CSS-pixel geometry.
  4. Human accessibility for keyboard, screen reader, reduced motion, forced colors, reflow/text spacing, and real-device behavior.
- No screenshot capture, screenshot assertion, image snapshot, or pixel-diff test is part of this contract.
- Pinned local Playwright Chromium owns numeric geometry. System browsers do not establish baselines.
- Every shipped route's canonical ready state runs at 320, 390, 600, 799, 800, 1024, and 1440 CSS px.
- Material loading, empty, error, forbidden, authentication-expired, dirty, saving, conflict, Sheet/Dialog/AlertDialog, long-copy, and maximum-content states run at the widths where their layout changes. Both 799 and 800 are mandatory for shell-sensitive states.
- Shared modules exhaustively test their finite states once at their interface. Routes repeat a state only when route composition changes the risk.
- Each screen records critical anchors: shell outlet/chrome, page or task heading, primary content, primary controls, contextual Back/action region, mutation/review surface, final scrollable anchor, and any domain-specific collision point.
- Geometry baselines are recorded only after the owner reviews the polished live target. The current UI is not the baseline oracle.
- Token values, named breakpoints, semantic roles/states, target-size minimums, containment, no horizontal overflow, no overlap, focus-not-obscured, dock/rail clearance, URL outcomes, and mutation outcomes are exact.
- Approved rectangles, gaps, widths, alignments, and rendered sizes use small documented tolerances. A tolerance that permits a materially different screen is invalid.
- Text asserts wrapping, containment, and readable order rather than brittle exact height.
- Every privileged mutation covers success, invalid or empty input, duplicate/replay, changed-payload idempotency-key reuse, unauthorized actor, wrong scope, stale revision, concurrent change, timeout or response loss, and named upstream failure where applicable.
- The backend cutover runs only against disposable local D1 fixtures. Automated tests never mutate Apps Script, Google Sheets, Cloudflare production, or a non-disposable database.
- Primitive tests cover role/state, keyboard behavior, focus, disabled/error behavior, and exact approved token/variant contracts.
- Shared module tests cover async recovery, authentication-required handoff, action-surface finite states, directory focus and state slots, feed presentation, settings feedback, workspace task composition, and announcement ownership.
- Identity tests cover seeded/exclusive Admin, `會友基礎`, fixed category semantics, one global total order plus separate scope checks, scope labels, expansion, sibling-only reorder and non-drag movement, creation affordances, Staff rename/rescope limits, URL state, and server-shaped restrictions.
- Permission tests cover one-identity navigation, continuous search, Switch semantics, locked reasons, dirty draft, review threshold, saving, non-conflict failure, authoritative conflict restart, and returned revision.
- Account-access tests cover eligible search, atomic multi-identity change for one account, invalid-selection rollback, lost/retained impact, scope-grouped effective access, and grant provenance.
- Route tests cover every classified Must Fix and every caller claimed as Covered by Shared Migration.
- Prior art to reuse includes the existing Worker/D1 permission and idempotency contracts; existing shell, component, permissions, directory, approval, Programs Workspace, attendance, and CMS tests; the authenticated management hardening matrix; Programs geometry measurements; and current scanner/safe-area gates.
- Existing tests that protect stale copy, raw element shape, or source classes are replaced with observable contracts during the owning phase.
- Every phase must leave its focused tests green and remove the obsolete implementation it supersedes. Full-suite verification is not postponed entirely to the end.
- Final readiness is blocked by any unresolved shipped P0/P1, WCAG AA failure, missing required human evidence, focus-obscured action, stale provenance, obsolete caller, compatibility shim, or mixed styling system in completed scope.

## Out of Scope

- Production code, CSS, tests, schemas, migrations, fixtures, deployment, or data changes during this specification phase.
- Automatic transition from specification approval to implementation.
- `/prototype`, prototype-only defects, historical comparison pages, and historical screenshots as product surfaces.
- Screenshot capture, screenshot comparison, visual image snapshots, or pixel-diff regression testing.
- Discord colors, assets, gaming vocabulary, server/channel concepts, or branding.
- Replacing Civic Minimal with upstream shadcn defaults or another theme runtime.
- A second component library or a global migration to another UI framework.
- Vendoring the complete shadcn catalog before there is a shipped caller.
- Generic schema-driven Form, DataTable, CRUD, task, plugin, or authorization frameworks.
- New non-permission product workflows or domain outcomes not tied to an audit-backed defect.
- Multi-account bulk 身份組 assignment in the first cutover.
- Explicit deny grants in the first stackable 身份組 model.
- Production physical deletion of identities, assignments, grants, or audit history.
- Silent reset of an unknown or future production database.
- Apps Script or Google Sheets mutation through automated UI tests.
- Household check-in, unrelated care/roster expansion, or unrelated domain migrations.
- In-app text-size presets; browser/system zoom, reflow, and text spacing remain accessibility gates.
- Partial production release of completed route families.
- Repo-wide documentation cleanup unrelated to 身份組, UI architecture, design-system governance, responsive behavior, accessibility, or the audited shipped routes.

## Further Notes

- Tony's `280bb2c5` work is now an ancestor of the planning baseline. It is verified contract hardening, not an external candidate and not a complete modular rewrite.
- The strongest retained Tony-era mechanisms are the Tailwind base-layer reset, functional boundary contrast, default target sizes, Dialog/Sheet overflow and close behavior, semantic primitive hooks, selected layout containment, and geometry-test precedent.
- The planning audit found that the shared primitive layer is real but not yet the default. The spacing scale is declared but effectively unused; literal geometry and custom control recipes remain widespread.
- High-confidence module seams are the Authenticated Shell, settings structure, existing async lifecycle, management action behavior, proven Member Picker interaction, attendance flow/scanner UI, directory frame, feed presentation, Programs Workspace task composition, identity management, permission editing, and account access.
- Intentional local implementations include Home composition, CMS domain rows, camera/device state, Program settings domain forms, route-specific not-found content, and domain-specific table rows and validation.
- The shipped account-settings split must be resolved before route polish fans out. The richer behavior becomes canonical; the dead parallel path is deleted.
- The current fixed-role permissions interface is replaced by the Spec 091 projection. It is not wrapped or generalized as a permanent compatibility layer.
- Route-family polish waves are public/auth/account; Home/communications; Programs/workspace; attendance/scanner; management operations; and identity/permissions.
- A numeric geometry report replaces screenshot evidence. It records approved anchors, computed tokens/styles, rectangles, gaps, containment, overflow, and dock/rail clearance for the required matrix.
- Human accessibility evidence remains mandatory because numeric geometry and DOM behavior do not prove screen-reader comprehension, real-device behavior, forced-colors quality, or complete WCAG conformance.
- The temporary grilling ledger remains decision provenance until feature-level documentation consolidation is reviewed.
- After owner approval of this specification and its planning matrices, the next deliverable is a separate dependency-ordered implementation plan. No implementation is authorized by publication of this issue.
