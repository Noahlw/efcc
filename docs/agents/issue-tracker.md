# Issue tracker: GitHub

EFCC issues, specs, and Wayfinder maps live in GitHub Issues for Noahlw/efcc. Pull requests are for code review, not request intake. Use gh from the repository root.

## Issue work

- Before a write, run gh auth status and confirm the target issue and repository.
- Read an issue and its discussion with gh issue view <number> --repo Noahlw/efcc --comments.
- Create, edit, comment on, or close issues with gh issue; read the result back after each write.
- If GitHub access is unavailable, report the blocked operation. Never claim an unverified write succeeded.

## Wayfinder

- A map is one issue labelled wayfinder:map. Keep its Destination, Notes, Decisions so far, Not yet specified, and Out of scope sections current. The map is an index; the ticket owns each decision's detail.
- Make each decision ticket a GitHub sub-issue of its map and give it one wayfinder:<type> label: research, prototype, grilling, or task. Use GitHub's native issue-dependency relationship for blockers; use a clear Part of #<map> or Blocked by: #<issue> body line only if the native relationship is unavailable.
- Claim a ticket by assigning it to yourself before work. Resolve it with a decision comment, close it, then add a short linked entry to the map's Decisions so far.
- Resolve at most one non-research Wayfinder ticket per session. Labels, assignment, and issue status do not replace the user's implementation authorization.

## GitHub references

- [Creating issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)
- [Browsing sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/browsing-sub-issues)
- [Managing labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)
