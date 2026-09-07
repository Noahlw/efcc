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

## Remaining local manual census

- The 81 unresolved Button class expressions are concentrated in Home CMS, Permission Editor, Role Hierarchy, AlertDialog, Approval Queue, Attendance, scanner routes, and Programs callers. They remain source-review inputs; unresolved dynamic class expressions are not silently treated as valid or invalid.
- The two spread flags are the production Input/Textarea implementations forwarding native props. This is required API forwarding, not a caller escape.
- The 15 ancestor candidates remain manual ownership review. `absolute` placement, full-width/grid/flex composition, status spans, and route arrangement are not primitive-owned by name alone.
- No new allowlist, waiver, baseline, or blanket `UNCLASSIFIED` exemption is created by this record. Any new equivalent caller override must fail the incremental governance ratchet once implemented.
