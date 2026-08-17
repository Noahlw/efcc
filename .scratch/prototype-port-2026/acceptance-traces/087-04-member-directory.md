# 087-04 Member Directory acceptance trace

Authority: issue #321, `docs/specs/087-management-hub-approvals-home-cms.md` (US 13-15), and the canonical management prototype.

Run against local `wrangler dev`/local D1 with authenticated fixtures. Assert each step through visible DOM or response state; no fabricated data.

1. Admin/Staff account searches the Member Directory.
   - Observe church-wide results across Active accounts — not scoped to any single department.
2. Department Manager searches.
   - Observe results scoped to members enrolled in programs under their assigned department(s) only — explicit assertion that a member outside that scope is excluded.
3. Select a search result.
   - Observe member detail (contact, role, department memberships) rendered inline — no separate commit step.

Focused proof: worker tests for the search endpoint's scope boundary (Admin/Staff church-wide vs DM scoped + explicit exclusion) + component tests (search → select → inline detail) + e2e; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.