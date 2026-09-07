# T08 / #513 caller census and disposition

## Census receipt

- Revision: `af4857e8e3a86f5979840c70f06999f569e9ed1a`
- Tool: supplied `audit/t08-control-census.mjs`; read-only, output outside the repository
- Parsed: 183 committed source files
- Excluded by tool scope: 135 files (tests, Stories, prototypes, generated/dependency paths)
- Static JSX occurrences: 586
- Families: Button 311; Input 91; Select 147; Textarea 8; native `<a>` 14; native input 7; native select 3; Checkbox 2; Switch 2; native textarea 1
- Manual review flags: 83 unresolved class expressions (81 Button, native Input/Textarea implementations), 2 implementation spreads, 15 ancestor-style candidates
- Interpretation: static occurrences are not rendered instances. The supplied 30-record register is a high-risk review register, not a 30-callsite total or a defect list.

## Disposition rules

- `MIGRATE_NOW`: primitive-owned size/padding/radius/focus/geometry or a directly equivalent caller patch that must move for the shared contract to be truthful.
- `BOUNDED_LATER_DEBT`: contextual visual/composition difference with exact owner/property/follow-up ticket; it is not a route-wide exemption.
- `VALID_CALLER_LAYOUT`: placement, grid/flex arrangement, full-width intent, or badge positioning remains caller-owned.
- `NATIVE_EXCEPTION`: existing documented platform/domain exception; verify its actual value/form/keyboard semantics without replacing it during T08.
- `NOT_T08`: noninteractive status/badge, domain behavior, or an independently scoped surface/overlay decision.

## Source-backed register dispositions

| ID | Source / symbol | Final disposition for this T08 pass | Action / proof boundary |
|---|---|---|---|
| CALL-01 | `web/app/page.tsx` LoginPage credential Inputs | `MIGRATE_NOW` | Remove shared-owned duplicate floor/style after Input contract is truthful; preserve type, IDs, validation, autocomplete, descriptions; auth component tests remain required. |
| CALL-02 | `web/app/page.tsx` sign-in Button submit/asChild links | `MIGRATE_NOW` | Move equivalent intent/target ownership to Button while preserving submit-once and anchor semantics; retain `w-full` placement. |
| CALL-03 | `web/lib/programs/program-form.tsx` Input/Textarea/Select/Button styles | `MIGRATE_NOW` | Use shared controls as compatibility tracer; preserve controlled values, options, validation, rows/resize, mutation callbacks. |
| CALL-04 | `web/lib/programs/program-form.tsx` `workspaceActions` / field layout | `VALID_CALLER_LAYOUT` | Keep form arrangement and width/placement classes. |
| CALL-05 | `web/app/management/permission-editor-panel.tsx` search/save/discard | `MIGRATE_NOW` | Remove redundant shared target patches only; preserve draft, conflict, server reason, and save workflow. |
| CALL-06 | `web/app/management/permission-editor-panel.tsx` permission Switch | `MIGRATE_NOW` | Move target ownership to Switch; preserve locked/disabled/busy state and server-derived reason. |
| CALL-07 | `web/app/management/permission-editor-panel.tsx` role/permission row variants | `BOUNDED_LATER_DEBT` | Keep row composition separate from Button semantics; exact property/symbol remains owned by #531. |
| CALL-08 | `web/app/management/management-action-framework.tsx` ActionSurface | `MIGRATE_NOW` | Protect shared close/control compatibility and focus behavior; do not move ActionSurface layout into Button. |
| CALL-09 | `web/app/management/management-action-framework.tsx` ManagementFilterSheet | `MIGRATE_NOW` | Shared close control follows primitive contract; keep sheet placement/dismissal ownership with overlay pattern. |
| CALL-10 | `web/app/management/directory-frame.tsx` pagination actions | `MIGRATE_NOW` | Remove equivalent target styling where shared Button covers it; preserve pagination state/callbacks and container spacing. |
| CALL-11 | `web/app/management/account-directory-panel.tsx` 48px Input/Select density | `BOUNDED_LATER_DEBT` | Do not force existing contextual 48px mapping down to 44px; record exact properties for #526 owner review. |
| CALL-12 | `web/app/management/account-access-panel.tsx` `actionClass` | `BOUNDED_LATER_DEBT` | Keep action-surface placement and lifecycle/domain state with #532; no route rewrite. |
| CALL-13 | `web/lib/shell-header.tsx` attention/bell trigger | `MIGRATE_NOW` | Shared icon target and focus/name behavior; keep badge position, expanded state, opener/ref, and shell ownership. |
| CALL-14 | `web/lib/approval-queue.tsx` select-all/row Checkbox | `MIGRATE_NOW` | Remove only redundant target geometry; preserve mixed state, disabled behavior, row placement, and selection state machine. |
| CALL-15 | `web/lib/approval-queue.tsx` row Link/status span | `NOT_T08` | Do not enlarge status badge or convert navigation link into an action control. |
| CALL-16 | `web/lib/attendance-scanner-ui.tsx` `attendanceButtonVariants` | `BOUNDED_LATER_DEBT` | Map generic action invariants only when safe; camera/tab arrangement stays with #533–#536. |
| CALL-17 | `web/lib/scanner-boundary.tsx` ScannerState/tab route | `BOUNDED_LATER_DEBT` | Keep mode-tab and route composition with #534/#535. |
| CALL-18 | `web/lib/assisted-scanner-panel.tsx` `assisted-event-context` | `NATIVE_EXCEPTION` | Retain native select option/form semantics and verify actual caller; no custom picker. |
| CALL-19 | `web/lib/assisted-scanner-panel.tsx` assisted member search/result rows | `BOUNDED_LATER_DEBT` | Preserve combobox/result-row keyboard and search ownership with #535. |
| CALL-20 | `web/lib/programs/event-detail.tsx` event type/recurrence native selects | `NATIVE_EXCEPTION` | Keep native option and form semantics; date/time parsing untouched. |
| CALL-21 | `web/lib/programs/event-detail.tsx` retry/action/form controls | `BOUNDED_LATER_DEBT` | Map generic equivalents only; no event lifecycle/cancellation rewrite. |
| CALL-22 | `web/lib/programs/member-picker.tsx` combobox Input/option Buttons | `BOUNDED_LATER_DEBT` | Preserve listbox, keyboard selection, and hidden form value; no generic picker framework. |
| CALL-23 | `web/lib/programs/member-picker.tsx` hidden selected-id input | `NATIVE_EXCEPTION` | Keep hidden input out of target-size checks; prove FormData value preservation. |
| CALL-24 | `web/components/ui/alert-dialog.tsx` Action/Cancel wrappers | `MIGRATE_NOW` | Let shared Button own target geometry while preserving Slot/ref/focus/action semantics. |
| CALL-25 | `web/components/ui/dialog.tsx` close/footer controls | `MIGRATE_NOW` | Keep absolute close placement with Dialog; shared Button owns icon target/focus; preserve Escape/focus return. |
| CALL-26 | `web/app/management/settings-ui.tsx` back link/row | `VALID_CALLER_LAYOUT` | Keep navigation link semantics, route placement, and keyboard behavior. |
| CALL-27 | `web/app/management/settings-ui.tsx` settings pill/detail row | `NOT_T08` | Noninteractive compact status/detail presentation is not a target-size violation. |
| CALL-28 | `web/lib/governance/registries.ts` CMS radio/datetime | `NATIVE_EXCEPTION` | Keep approved CMS native controls and verify actual DOM contract. |
| CALL-29 | `web/lib/governance/registries.ts` attendance radio chooser | `NATIVE_EXCEPTION` | Keep approved GOV.UK fieldset/radio semantics. |
| CALL-30 | `web/lib/governance/registries.ts` Programs notification dialog | `NOT_T08` | Existing owner-approved native dialog/route boundary remains with #514/#521. |

## Complete pinned census closure

The supplied census reports 83 `unresolvedClassExpression` flags: 81 Button
expressions and the two native primitive implementations below. The line
numbers are from the pinned `af4857e8e3a86f5979840c70f06999f569e9ed1a`
revision; current implementation edits may move them. Every flagged occurrence
has an explicit disposition. A bounded disposition is a named later
owner/property boundary, not a route-wide exemption.

### Button expressions (81 total)

| Census group | Pinned source lines | Count | Final disposition | Exact owner / resolution |
|---|---:|---:|---|---|
| CEN-B01 | `web/app/management/home-cms-editor.tsx:602,617,967,981` | 4 | `MIGRATE_NOW` | #529 Home Content; current HEAD removes duplicate target, padding, radius, and focus classes while preserving template/viewport behavior. |
| CEN-B02 | `web/app/management/permission-editor-panel.tsx:597` | 1 | `MIGRATE_NOW` | #531 Permission Editor role-link surface; Button owns target and the link keeps href, label, and selection behavior. |
| CEN-B03 | `web/app/management/role-hierarchy-panel.tsx:1158,1182,1212,1245,1266,1372,1387,1403,1422,1519,1528,1637,1646,1730,1740,1875,1884` | 17 | `BOUNDED_LATER_DEBT` | #530 Role hierarchy; `categoryToggleVariants`, `roleButtonVariants`, `orderButtonVariants`, and `actionButtonVariants` are the exact later helper/property boundary. `size="lg"` already supplies the Button floor. |
| CEN-B04 | `web/components/ui/alert-dialog.tsx:172,191` | 2 | `MIGRATE_NOW` | Shared AlertDialog primitive; current HEAD removes duplicate `min-h-11` wrapper styling and preserves Slot/ref/focus/action/cancel semantics. |
| CEN-B05 | `web/lib/approval-queue.tsx:525,552` | 2 | `MIGRATE_NOW` | #528 Approval Queue tab triggers; current HEAD removes duplicate `min-h-11` and keeps tab selection, active styling, and `aria-selected`. |
| CEN-B06 | `web/lib/assisted-scanner-panel.tsx:281,297,352` | 3 | `BOUNDED_LATER_DEBT` | #535/#536 scanner journeys; `attendanceButtonVariants` remains the later owner while camera/search/form state stays local. |
| CEN-B07 | `web/lib/attendance-operator-panel.tsx:104,309,356,367,434,450,505,515,601,610,971,985,1026` | 13 | `BOUNDED_LATER_DEBT` | #536 attendance operations/print; `attendanceButtonVariants` is the exact later owner without moving print/domain behavior. |
| CEN-B08 | `web/lib/attendance-panel.tsx:92,251,350,370` | 4 | `BOUNDED_LATER_DEBT` | #533 Guest Check-In; `attendanceButtonVariants` is the exact later owner; credential, validation, submit, and navigation semantics remain. |
| CEN-B09 | `web/lib/attendance-scanner-ui.tsx:144,154,215,309,345,456,523,534,544,599,605,729,736` | 13 | `BOUNDED_LATER_DEBT` | #534/#535 scanner journeys; `attendanceButtonVariants` is the later owner. The camera-stop `absolute` placement is caller layout. |
| CEN-B10 | `web/lib/nav-bar.tsx:105` | 1 | `BOUNDED_LATER_DEBT` | #516 authenticated shell; `.nav-item` is the existing navigation boundary, not a new T08 route patch. |
| CEN-B11 | `web/lib/programs/event-detail.tsx:665` | 1 | `BOUNDED_LATER_DEBT` | #520 Programs Events task; action-bar styles remain the later owner, with event check-in href/state unchanged. |
| CEN-B12 | `web/lib/programs/participant-enrollment.tsx:178,200,228,249,274,293` | 6 | `BOUNDED_LATER_DEBT` | #518 participant enrollment; `enrollmentActionVariants` is the later owner, with request/cancel/re-enroll state unchanged. |
| CEN-B13 | `web/lib/programs/programs-manager.tsx:681` | 1 | `BOUNDED_LATER_DEBT` | #519/#521 Programs management/settings; `styles.toggle` remains the exact owner for module-toggle presentation and mutation flow. |
| CEN-B14 | `web/lib/programs/workspace-task.tsx:263,305,330,380,398` | 5 | `BOUNDED_LATER_DEBT` | #520 Programs workspace; `styles.button`, `styles.directoryCard`, and `styles.workspaceTaskRow` remain exact later properties. |
| CEN-B15 | `web/lib/scanner-boundary.tsx:59,261,274,296,314` | 5 | `BOUNDED_LATER_DEBT` | #534/#535 scanner boundary; mode-tab, retry, and recovery composition stay with the scanner owner. |
| CEN-B16 | `web/lib/self-check-in-panel.tsx:420,430,564` | 3 | `BOUNDED_LATER_DEBT` | #534 authenticated Self scanner; `attendanceButtonVariants` is the later owner, with busy/camera/return behavior unchanged. |

Tally: `MIGRATE_NOW` 9; `BOUNDED_LATER_DEBT` 72; total Button flags 81.
The current implementation completed every T08-authorized `MIGRATE_NOW` row.
The 72 bounded rows retain named ticket/property ownership and are not
silently classified as compliant or waived.

### Primitive spread flags (2 total)

| Census case | Pinned source | Final disposition | Proof |
|---|---|---|---|
| CEN-S01 | `web/components/ui/input.tsx:7` | `PROVEN_FALSE_POSITIVE` | `...props` forwards the native Input public API after the primitive-owned class; it is not a caller styling escape. |
| CEN-S02 | `web/components/ui/textarea.tsx:7` | `PROVEN_FALSE_POSITIVE` | `...props` forwards native Textarea attributes/ref semantics after the primitive-owned class; it is not a caller styling escape. |

### Ancestor-style candidates (15 total)

| Census group | Pinned source lines | Count | Final disposition | Ownership proof |
|---|---:|---:|---|---|
| CEN-A01 | `web/app/guest-check-in/page.tsx:50` | 1 | `VALID_CALLER_LAYOUT` | Native navigation anchor; target/focus/placement belongs to the guest surface, not the Button primitive. |
| CEN-A02 | `web/app/management/management-action-framework.tsx:25,27` | 2 | `PROVEN_FALSE_POSITIVE` | Current selectors target descendant anchors only; Button/Input/Select/Textarea focus is not overridden by the ancestor. |
| CEN-A03 | `web/app/profile/page.tsx:124` | 1 | `NOT_T08` | QR rendering container and descendant SVG/text layout; noninteractive profile presentation. |
| CEN-A04 | `web/components/ui/badge.tsx:8` | 1 | `NOT_T08` | Badge icon geometry belongs to the noninteractive Badge primitive outside the T08 family. |
| CEN-A05 | `web/components/ui/button.tsx:8,26,27,31` | 4 | `PRIMITIVE_OWNER` | Button-owned visual icon sizing; the interactive root remains at least 44px and no caller override is created. |
| CEN-A06 | `web/components/ui/checkbox.tsx:41` | 1 | `PRIMITIVE_OWNER` | Checkbox indicator SVG geometry inside the existing 44×44 root; Radix state semantics remain unchanged. |
| CEN-A07 | `web/components/ui/select.tsx:11,134,172,190` | 4 | `PRIMITIVE_OWNER` | Select trigger/item/scroll-control icon geometry inside the Radix primitive; trigger, selected-value, and option contracts are tested separately. |
| CEN-A08 | `web/components/ui/tabs.tsx:66` | 1 | `NOT_T08` | Tabs is an adjacent primitive, not a T08 Button/control subject. |

Tally: `VALID_CALLER_LAYOUT` 1; `PROVEN_FALSE_POSITIVE` 2;
`NOT_T08` 3; `PRIMITIVE_OWNER` 9; total ancestor candidates 15.

No open or `UNCLASSIFIED` census case, blanket allowlist, waiver, route
exemption, or new baseline is used to close this census. Future equivalent styling added
after the supplied/current comparison base is evaluated by the incremental
ratchet and fails closed when it cannot be classified safely.

## Additional caller review after D1–D3 approval

These shared-control callsites were reviewed after the pinned census and are
listed explicitly because their static classes were already resolvable rather
than part of the 83 unresolved flags.

| ID | Source / scope | Final disposition | Evidence / boundary |
|---|---|---|---|
| CEN-I01 | `web/app/management/home-cms-editor.tsx:664,709,754,768,785,800` `Input` fields | `MIGRATE_NOW` | Removed caller-owned min-height, padding, radius, focus, disabled-geometry, and duplicate width classes; retained field palette and text meaning. Native form values and busy disable behavior remain caller-controlled. |
| CEN-T01 | `web/app/management/home-cms-editor.tsx:723,738` `Textarea` fields | `MIGRATE_NOW` | Removed caller-owned min-height, padding, radius, focus, disabled-geometry, and duplicate width classes; retained `rows={3}`/`rows={7}` multiline intent and field palette. The primitive continues to own its useful `min-h-16` minimum and resize semantics. |
| CEN-SL01 | `SelectTrigger` primitive base in `web/components/ui/select.tsx` | `PRIMITIVE_OWNER` with `VALID_CALLER_LAYOUT` override allowed | `w-full min-w-0 max-w-full overflow-hidden` is the bounded closed-value contract; explicit caller width intent such as `w-fit` remains layout-owned and may override width without redefining target, padding, radius, or focus. |
| CEN-N01 | `web/app/management/home-cms-editor.tsx:859,878` native `datetime-local` inputs | `NATIVE_EXCEPTION` | Existing CMS native controls remain native; their value, form, keyboard, and platform picker behavior is outside the Radix/Input migration. |

The additional review leaves no `UNKNOWN`, `UNCLASSIFIED`, or silently retained
Home CMS shared-owned override in the current T08 scope.

## Pre-existing route-CVA findings in the implementation diff

The fixed implementation diff still reports three route-level CVA findings that
predate T08. They are covered by the exact active waiver
`WVR-HISTORICAL-MANAGEMENT-PANEL-CVA`; they are not new T08 caller overrides,
and the waiver does not authorize adding equivalent findings:

| Finding | Existing source line | Disposition | Waiver boundary |
|---|---|---|---|
| `RULE-NO-ROUTE-CVA` | `web/app/management/directory-frame.tsx:3` | `WVR-HISTORICAL-MANAGEMENT-PANEL-CVA` | Existing management pattern CVA; T08 changed Button caller geometry/API exposure only. |
| `RULE-NO-ROUTE-CVA` | `web/app/management/management-action-framework.tsx:2` | `WVR-HISTORICAL-MANAGEMENT-PANEL-CVA` | Existing management pattern CVA; T08 preserves its ActionSurface/overlay ownership. |
| `RULE-NO-ROUTE-CVA` | `web/app/management/permission-editor-panel.tsx:3` | `WVR-HISTORICAL-MANAGEMENT-PANEL-CVA` | Existing management pattern CVA; T08 removes shared-owned Button geometry while preserving permission workflow. |

The registry also contains the same historical waiver entries for unchanged
management files; those are not part of this three-finding T08 diff disposition.
