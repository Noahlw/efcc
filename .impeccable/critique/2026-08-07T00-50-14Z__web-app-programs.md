---
target: web/app/programs + web/lib/programs
total_score: 18
p0_count: 0
p1_count: 4
timestamp: 2026-08-07T00-50-14Z
slug: web-app-programs
---

#### Design Health Score

| # | Heuristic | Score | Key Issue |
| --- | --- | --: | --- |
| 1 | Visibility of System Status | 2/4 | Loading and action states exist but are not consistently scoped or announced. |
| 2 | Match System / Real World | 2/4 | Scheduling exposes technical recurrence and UTC concepts to church operators. |
| 3 | User Control and Freedom | 2/4 | Deeply nested details make it difficult to inspect or exit one operational task. |
| 4 | Consistency and Standards | 2/4 | Token drift and repeated custom panel patterns weaken the product vocabulary. |
| 5 | Error Prevention | 2/4 | Picker ambiguity, destructive event actions, and dense forms invite mistakes. |
| 6 | Recognition Rather Than Recall | 2/4 | Important actions are buried inside expanded program details. |
| 7 | Flexibility and Efficiency | 1/4 | Admins have no search, filtering, or fast desktop scan path. |
| 8 | Aesthetic and Minimalist Design | 2/4 | Restrained civic styling is sound, but the expanded surface becomes a mega-panel. |
| 9 | Error Recovery | 2/4 | Retry exists, but picker failures and some panel failures lose useful context. |
| 10 | Help and Documentation | 1/4 | Few task-level explanations help users understand modules, recurrence, or permissions. |
| **Total** |  | **18/40** | **Poor** |

#### Anti-Patterns Verdict

Conditional fail. The surface avoids gradients, glassmorphism, hero metrics, side stripes, and generic marketing scaffolding. It still shows product slop signals through repeated tracked section labels, nested card/panel containment, and a dense all-in-one operational surface. The detector's 36 findings are mostly design-system drift rather than visual anti-patterns.

#### Overall Impression

The civic palette and Cantonese-first copy make the surface credible for church operations, but the Programs page currently asks one screen to be a department directory, configuration console, editor, event planner, enrollment queue, and leader manager. The single biggest opportunity is to make the next operational decision obvious without removing capability.

#### What's Working

- Restrained cinnabar, charcoal, and hairline surfaces fit an internal operations tool and avoid SaaS decoration.
- Server-projected capabilities are reflected in visible controls, reducing role confusion.
- Mobile reflow, focus rings, and 44px controls show good phone-first intent.

#### Priority Issues

- **[P1] Mega-surface overload**: `web/lib/programs/programs-manager.tsx:574-739`. Expanding a department can expose module controls, program editing, events, enrollment, and leaders together. Split the detail into one staged operational view at a time; keep the current context visible.
- **[P1] Member picker is not a complete combobox**: `web/lib/programs/member-picker.tsx:27-114`. There is no `aria-expanded`, keyboard result navigation, result count announcement, or visible empty/error state. Search failures silently become an empty list.
- **[P1] Technical scheduling language**: `web/lib/programs/programs-events-panel.tsx:234-310`, `web/lib/copy.ts:146-157`. Numeric weekday and UTC/ISO terminology increase cognitive load for Cantonese church operators. Use local Hong Kong date/time controls and task language.
- **[P1] Weak task feedback**: `web/lib/programs/programs-manager.tsx:273-310`, `web/lib/programs/programs-events-panel.tsx:169-177`. Add scoped skeletons, `aria-busy`, preserved panel context after errors, and confirmation for destructive event cancellation.
- **[P2] Design-system drift**: `web/app/programs/programs.module.css:30-479`. The detector found 26 off-ramp font sizes, 8 undocumented colors, and 2 undocumented pill radii. Consolidate semantic state tokens and the product type scale.

#### Persona Red Flags

- **Member**: Enrollment is buried inside program details; the member must expand multiple layers to find the primary action.
- **Program Leader**: Event setup presents several technical fields simultaneously on a phone during a gathering.
- **Admin**: There is no search, filtering, or bulk workflow for scanning many departments/programs on desktop.

#### Minor Observations

- `cancelEdit` exists in copy but no cancel-edit control is rendered.
- Status is often conveyed through text and color without a consistent semantic state component.
- The detector found no horizontal overflow in the loading shell at 375px or 1280px, but the actual Programs content was not rendered for browser verification.

#### Questions to Consider

- Should a program detail reveal one operational job at a time, or is the dense admin console intentional?
- Which matters first: member/leader interaction accessibility, admin information hierarchy, or design-token cleanup?
- What should the 60-second Admin workflow be when managing a department with many programs?
