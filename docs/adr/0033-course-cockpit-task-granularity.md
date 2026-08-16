# Course Cockpit and Management Hub Task Granularity

**Status:** accepted

ADR-0032 named the `design_handoff_efcc_redesign` prototypes authoritative, consolidating "55 logical screens." That figure was read literally in follow-up work as a route-count target, which conflicted with the already-shipped Course Cockpit shape (`CONTEXT.md`'s Course Cockpit entry, and Spec 083's explicit "quiet secondary rows" grouping of M-03/M-04/M-14/M-15). Grilled to resolve the conflict before continuing the remaining reskin work.

## Decision

The 55 prototype screens are a **design-reference count**, not a route-count mandate (the prototype README calls the files "design references, not source to copy directly"). Whether a given prototype screen becomes its own routable **Task** (`ProgramsTask` in code — a URL-addressable sub-view inside the Course Cockpit or Management Hub, one level below a Section) is governed by two independent axes:

1. **Frequency** decides *placement*: daily-use work gets a primary tile; rare, deliberate admin work gets a quiet low-frequency row (or stays off primary navigation entirely).
2. **Independent multi-step state** decides *whether it becomes a Task at all*: a flow the user can get lost in mid-way (search-then-commit, a multi-field editor with its own validation) earns its own URL regardless of how often it's used, so back/forward/reload behave correctly. A single-record yes/no decision (approve/reject) does not — it stays inline even where it is used often.

Applying this rule:

- **New Tasks**: Schedule Rule editor (event preview/generate folds into the same Task), Assisted Enrollment search, Department Manager picker, Attendance Roster (moved off the pre-Cockpit legacy `/events?eventId=` route into the Cockpit's own URL space).
- **Stay inline / unchanged**: Course Facts, Course Edit, course-scoped Settings, course-scoped Notifications (already the accepted Cockpit quiet-row shape — verified text-exact against the prototype), Enrollment Request detail, Registration Approval detail (the prototype's own rule for the Approval Queue additionally forbids a direct URL), Department Detail (once the DM picker is extracted, what remains is a simple settings form with no independent flow), Member Directory (search-then-view, no commit step), Home Content CMS (already one editor page, accepted as-is).
- The legacy `/events?eventId=` route is **removed outright, no redirect**, once Attendance Roster moves — the system is pre-production, so there are no real bookmarks or printed materials to protect.

## Consequences

Future prototype screens should be evaluated against this same two-axis rule rather than re-litigated individually. `CONTEXT.md`'s `Task` entry records the term.
