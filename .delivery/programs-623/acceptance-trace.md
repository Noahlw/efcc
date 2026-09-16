# Issue #623 acceptance trace

Candidate base: `49bdbce0244ded445b1e3d4f3f9836c58d2580f4` Authority: GitHub #623, #586 accepted R40–R52 amendment, direct R43 and AC43. Scope: Schedule Reviewed Plan identity/fingerprint, stale invalidation, Generate safety, durable generation semantics, UI states, and focused tests.

## Acceptance inventory

| ID | Actor / action | Observable result | Required seam | Planned check |
| --- | --- | --- | --- | --- |
| R43.1 | Leader previews an exact visible range | Durable Reviewed Schedule Plan binds range, authoritative Rule versions, saved-exception versions, and fingerprint | Worker/D1 | focused Programs contract test |
| R43.2 | Leader changes range, Rule, saved exception, or drafts an exception | Existing Preview remains visible but is stale; Generate is unavailable; Cantonese guidance and Review Again are primary | component | focused Schedule task test |
| R43.3 | Leader has pending/failed exception persistence | Generate remains unavailable until save settles successfully | component + API | focused Schedule task/handler tests |
| R43.4 | Client bypasses a stale Plan | Server rejects stale/mismatched Plan before Event writes | Worker/D1 | focused Programs contract test |
| R43.5 | Leader reviews again then generates | Fresh matching Plan generates bounded Events with provenance and truthful created/skipped/unfinished outcomes | Worker/D1 + real route | contract + browser acceptance |
| R43.6 | Leader retries/resumes generation | Durable retry is idempotent and does not duplicate Events | Worker/D1 | focused Programs contract test |
| R43.7 | Leader previews finite and ongoing Rules | Per-rule inclusive bounds remain; ongoing default is next three calendar months with explicit range | Worker/D1 + component | recurrence/Programs tests |
| R52.1 | Reviewer inspects candidate | Evidence is pinned to the production candidate; independent Spec and Acceptance review are separate | review | fresh verifier reports |

## Boundary evidence

- Component evidence is not used as persistence or real-route evidence.
- Worker/D1 evidence must assert durable plan/version/fingerprint and no-write stale rejection.
- Browser evidence must exercise Preview A → mutate input → stale state → Review Again → Generate against local Wrangler/D1 with zero retries.
- Physical device, Owner L2, merge, deployment, release, and issue closure are separate gates and remain outside this worker package.
