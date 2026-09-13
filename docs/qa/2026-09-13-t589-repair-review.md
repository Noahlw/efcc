# #589 repair review — 2026-09-13

Status: **IMPLEMENTED CANDIDATE; INTEGRATION REPAIR IN PROGRESS**. Not production-ready, not owner-approved, not pushed/merged/released.

## Candidate

- Base: `98f3c61f3442f19d80ba0cf1e007e7dba1e00054`.
- Local repair commit: `4a78aa7d4af9eb36cf298782c045890184aed6f6`.
- Luna max implemented; parent independently reviewed actual source, component runs, Storybook interaction and browser artifacts.
- Preserved the four pre-existing tracked dirty docs. No reset, push, merge, issue closure or skill changes.
- One integration-only test stabilization in `approval-detail.test.tsx` waits for loaded public data instead of an already-visible loading header. Approval production code unchanged.

## Observed evidence

| Check | Result and scope |
| --- | --- |
| Focused Shell/Settings/Workspace | Parent 166/166 passed before commit formatting |
| Shell/Programs boundary tests | Parent 143/143 passed |
| Storybook interactions | Parent 94/94 passed after replacing old dirty-Back data-loss expectation |
| Storybook build/index | Passed; 94 Stories, 36 catalog obligations resolved |
| Full pre-commit gate | Passed at commit; components 1037/1037, Worker tests 606/606, identity 98/98, Programs contract 1/1, typechecks and governance passed |
| Manual synthetic Story | At 360px, dirty mode click retained draft and showed Save/Discard guidance; explicit discard then Back returned to hub. At 402px, DOM viewport/document widths both402. This is not real-device keyboard or native browser Back proof. |
| Canonical real browser | **1 passed / 1 failed**, retries0. Participant passed. Management dirty Back/tab/mode, discard/save/readback assertions passed; final clean mode navigation failed. |
| Visual harness | 2 output-contract tests passed, producing11 baseline pairs at two widths. This is **not**22 visual-fidelity assertions or focused-editor coverage. |
| W7 | Interrupted after observed stale outer dirty-Story expectation failures at402/414. Not passed; no aggregate JSON was produced before interruption. |

## Integration findings still open

1. Real clean Settings hub mode click did not commit `/programs` URL; browser stayed at management Program Settings. Correct href is present, dirty editor absent from failure snapshot. Root cause is under investigation; do not classify as an external500 or assume dirty interception.
2. `t11-storybook.test.ts` still expects the dirty Story to end with the original name; the updated material Story deliberately retains its unsaved draft. Luna is aligning the outer assertion with the accepted behavior, preserving Save/Discard and retained-draft checks.

## Durable artifacts

- `docs/qa/artifacts/t589-repair-4a78aa7d/browser/run.json`
- `docs/qa/artifacts/t589-repair-4a78aa7d/browser/browser-results.json`
- `docs/qa/artifacts/t589-repair-4a78aa7d/browser/browser-output/` (failure screenshot/context/trace)
- `docs/qa/artifacts/t589-repair-4a78aa7d/visual/` (baseline capture output)
- `docs/qa/artifacts/t589-repair-4a78aa7d/w7-interrupted/error-context-w402.md`
- `docs/qa/artifacts/t589-repair-4a78aa7d/w7-interrupted/error-context-w414.md`

These are local evidence locators, not uploaded tracker attachments. Browser traces use disposable local fixtures and must be reviewed before any external upload.

## Limits and next action

Existing Programs access API has a30-second in-memory success cache; this repair does not establish instantaneous revocation. UI eligibility is not backend authorization.

Repair clean mode navigation and W7 assertion; create an append-only candidate; rerun real browser, responsive and relevant fixed-point checks; publish/read back honest tracker evidence. Remaining #586 packages, final visual owner judgment, real-device camera/download/print and release remain separate. No full-workset green claim.

## Follow-up repair checkpoint

Parent instrumented the canonical browser test temporarily (diagnostic code removed afterwards). Two diagnostic runs reproduced the failure. `t589-parent-mode-diagnosis-2/browser.log` showed the anchor remained connected and the click was prevented by Next Link's compiled handler, not the Settings guard. No mode navigation committed. This identifies the failing navigation path; it does not claim every Next internal cause is proven.

Luna aligned the header mode action with Programs' existing native History API navigation pattern, retaining canonical hrefs and ordinary modified-click/new-tab/download semantics. Parent added actual destination-heading assertions to the browser journey, alongside exact URLs.

- Real browser pre-commit repair check passed at `docs/qa/artifacts/t589-mode-native-candidate/browser/`. This run used the working-tree follow-up patch over4a78aa7d; it must not be attributed to unmodified4a78aa7d.
- Parent's corrected R6 W7 matrix passed9/9 at `docs/qa/artifacts/t589-r6-matrix/result.json`. It checks retained dirty state, then explicit discard cleanup before navigating to another Story.
- A Luna diagnostic attempt used Node20 and failed at setup; its Node22 retry was interrupted before reaching browser diagnosis. Neither is acceptance evidence; artifacts remain separate under `t589-mode-diagnosis/`.
