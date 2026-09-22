# #589 repair review — 2026-09-13

Status: **SCOPED FUNCTIONAL REPAIRS VERIFIED; VISUAL/OWNER ACCEPTANCE OPEN**. This is not full Programs production-readiness, owner approval, push, merge or release.

## Candidate

- Base: `98f3c61f3442f19d80ba0cf1e007e7dba1e00054`.
- Local repair commit: `4a78aa7d4af9eb36cf298782c045890184aed6f6`.
- Final code fixed point: `1bbb8f82618c548d2de4e7381c836a93a85fef4c` (append-only follow-up).
- Luna max implemented; parent independently reviewed actual source, component runs, Storybook interaction and browser artifacts.
- Preserved the four pre-existing tracked dirty docs. No reset, push, merge, issue closure or skill changes.
- One integration-only test stabilization in `approval-detail.test.tsx` waits for loaded public data instead of an already-visible loading header. Approval production code unchanged.

## Historical first-candidate evidence (4a78aa7d)

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

## Historical integration findings (resolved by follow-up)

1. Real clean Settings hub mode click did not commit `/programs` URL; browser stayed at management Program Settings. Follow-up aligned the header's same-route action with the existing Programs History API pattern; final browser checks prove both canonical URLs and rendered destination directories.
2. `t11-storybook.test.ts` expected the dirty Story to end with the original name. Follow-up verifies the retained draft and visible actions, then explicitly discards before leaving the Story. Final R6 checks passed across all nine W7 widths.

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

The reviewed functional defects are repaired and verified below. Remaining #586 packages, final visual owner judgment, real-device keyboard/native browser Back/camera/download/print and release remain separate. The full126-case W7 suite was not rerun to completion; the relevant36 cases were. No standalone live canary was rerun. No full-workset green claim.

## Follow-up repair checkpoint

Parent instrumented the canonical browser test temporarily (diagnostic code removed afterwards). Two diagnostic runs reproduced the failure. `t589-parent-mode-diagnosis-2/browser.log` showed the anchor remained connected and the click was prevented by Next Link's compiled handler, not the Settings guard. No mode navigation committed. This identifies the failing navigation path; it does not claim every Next internal cause is proven.

Luna aligned the header mode action with Programs' existing native History API navigation pattern, retaining canonical hrefs and ordinary modified-click/new-tab/download semantics. Parent added actual destination-heading assertions to the browser journey, alongside exact URLs.

- Real browser pre-commit repair check passed at `docs/qa/artifacts/t589-mode-native-candidate/browser/`. This run used the working-tree follow-up patch over4a78aa7d; it must not be attributed to unmodified4a78aa7d.
- Parent's corrected R6 W7 matrix passed9/9 at `docs/qa/artifacts/t589-r6-matrix/result.json`. It checks retained dirty state, then explicit discard cleanup before navigating to another Story.
- A Luna diagnostic attempt used Node20 and failed at setup; its Node22 retry was interrupted before reaching browser diagnosis. Neither is acceptance evidence; artifacts remain separate under `t589-mode-diagnosis/`.

## Final verification at 1bbb8f82

Production and test sources remained clean throughout the final runs; only the four pre-existing unrelated documentation edits remained. Any later commit for this review is documentation-only and does not change this code fixed point.

| Check | Result | Durable locator or provenance |
| --- | --- | --- |
| Canonical real browser | 2/2 passed; retries0, no skipped/flaky tests | `docs/qa/artifacts/t589-repair-1bbb8f82/browser/run.json` and `browser-results.json`; both URL and destination-heading assertions included |
| Canonical responsive | 6/6 passed; retries0, no skipped/flaky tests | `docs/qa/artifacts/t589-repair-1bbb8f82/responsive/run.json` and `responsive-results.json` |
| Relevant W7 | 36/36 passed; retries0, no skipped/flaky tests; nine widths320–1440 | `docs/qa/artifacts/t589-repair-1bbb8f82/w7/result.json`; participant shell, management mode control, detail Back and R6 Settings/Notifications |
| Storybook interactions | 94/94 passed on final code | Parent final command `fnm exec --using 22.18.0 pnpm --dir web test:storybook`, exit0 |
| Full pre-commit gate | Passed | Components1038/1038; Worker606/606; identity98/98; Programs contract1/1; typechecks and governance0 active violations; final code commit hook exit0 |
| Focused regression integration | 167/167 passed before final commit formatting | Parent Shell/Settings/Workspace run; final hook reran the complete component suite after formatting |

The two canonical run manifests explicitly record the full final SHA. Raw reports were reopened and their counts/retries checked, not inferred from HTTP200 or a worker summary. W7 ran against the same clean code fixed point.

Visual captures at4a78aa7d remain historical references. Parent directly inspected actual/frozen Management Directory402px and Settings360px pairs and observed density/spacing/title-wrap differences; these captures do not grant frozen-fidelity approval. The follow-up changes navigation and tests, not visual styles. Remaining user-facing internal wording and broader screen polish must be handled through the applicable #586 packages, not hidden by this repair verdict.

Remote #607 was rechecked: OPEN at `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`, unchanged by this session. Tracker publication records local-only delivery; no raw trace upload, push, merge or issue close.
