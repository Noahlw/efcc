# S4 Phase F — Audit Dispositions

**Date:** 2026-09-01  
**Scope:** shipped-route findings from the active S4 polish and responsive
sticky-overlay audits  
**Sources:**
`docs/qa/2026-08-26-s4-polish-audit.html` and
`docs/qa/2026-08-27-responsive-sticky-overlays-audit.md`  
**Evidence:** `docs/specs/s4-phase-f-acceptance-trace.md`,
`docs/qa/2026-09-01-s4-phase-f-contraction-evidence.md`,
`docs/qa/2026-09-01-s4-phase-f-release-gate.md`, and
`docs/qa/2026-09-01-s4-phase-f-release-evidence.{json,html}`

## Disposition rule

`Fixed` means the shipped implementation was changed or verified at the
owning seam and the exact observable evidence is linked. It does not claim
that the aggregate Phase F release gate is green. The aggregate remains
`BLOCKED` because the single-process Programs D1 run loses its local arm64
Worker, as recorded in the release-gate document. Human-only outcomes remain
`UNCLAIMED` and are never inferred from the automated rows below.

## P0 findings

The 2026-08-26 shipped-route audit records **no P0 findings**. No P0 was
silently reclassified; the absence is preserved from the source audit.

## Shipped P1 findings

| Finding | Source surface / contract | Disposition | Exact implementation evidence |
| --- | --- | --- | --- |
| S4-P1-01 | H-01, H-02, H-17 — permissions and management navigation | **Fixed** | Context-aware Back ownership and safe return state are covered by `tests/e2e/s4-management-hardening.test.ts` Back/canonical-route assertions and trace row F-495-01. |
| S4-P1-02 | H-01 — approval authentication, forbidden state, and deep links | **Fixed** | Capability/auth-required versus forbidden behavior and safe return are covered by approval/auth component tests plus the live management route matrix; trace rows F-494-01, F-494-02, and F-495-01. |
| S4-P1-03 | H-12 — Account Detail round-trip restoration | **Fixed** | `web/lib/account-directory-panel.test.tsx` and the management hardening round-trip assertions cover query, filters, loaded pages, selected account, and return state; trace row F-495-01. |
| S4-P1-04 | H-37, H-40 — Account Directory geometry at the 800px band | **Fixed** | Account Directory geometry and management hardening cover the one-pane 800–1023px band, department-filter containment, target sizes, and no overflow; numeric report and trace row F-495-02. |
| S4-P1-05 | H-03, H-40 — dock/action obstruction and safe-area clearance | **Fixed** | `s4-management-hardening.test.ts` asserts mobile in-page action surfaces stay in flow; shell/public/management/attendance geometry reports assert dock clearance and no obstruction; trace rows F-494-03 and F-495-02. |
| S4-P1-06 | H-11, H-40 — readable Account/member rows and detail affordance | **Fixed** | Account/member directory component and management hardening tests cover full identifiers, status/domain context, readable wrapping, and detail action geometry; trace rows F-494-03 and F-495-02. |
| S4-P1-07 | H-04, H-20 — filter-sheet modal semantics | **Fixed** | The local Radix Sheet path is covered by `web/app/management/management-action-framework.test.tsx` and management hardening focus/close assertions; trace row F-495-01. |
| S4-P1-08 | H-20, H-40 — permission policy review/action obstruction | **Fixed** | `tests/e2e/permission-editor-geometry.test.ts` covers action-surface/dock clearance and the review Sheet containment; the rendered numeric report includes `permission-editor-geometry.test.ts`; trace row F-495-02. |
| M-01 | Responsive audit §4.3 — approval selection tray was fixed and unbounded on phone | **Fixed** | `ManagementStickyActionBar` now uses the shared CVA `ActionSurface`: phone placement is in flow, with `max-height:min(48dvh,420px)` and `overflow-y:auto`; `s4-management-hardening.test.ts` asserts the action surface remains in flow. |
| M-05 | Responsive audit §4.3/§7 — permission review panel fused to the dock and could grow without bound | **Fixed** | Permission review uses the bounded Radix Sheet/action-surface path; `permission-editor-geometry.test.ts` asserts the review surface remains inside the viewport and its action/final anchors remain reachable. |

No row above is marked `Deferred` or `Preserve`: every shipped P1/blocker
listed by the active audits has an implementation disposition and an evidence
seam. A required release journey can still be blocked even when its defect
fix is present.

## Lower-severity findings on touched routes

| Finding / source | Disposition | Reason and evidence |
| --- | --- | --- |
| S4-P2-01 — legacy approval `返回首頁` escape | **Fixed** | Removed in favor of one origin-aware contextual action; approval component and management hardening assertions cover the visible action set. |
| S4-P2-02 — standalone `會友基礎` card | **Fixed** | Replaced with the compact protected-baseline explanation; identity hierarchy and component tests cover the automatic baseline. |
| S4-P2-03 — decorative role glyphs | **Fixed** | Removed; identity hierarchy tests cover meaningful identity labels and scope rather than decorative markers. |
| S4-P2-04 — stale loading announcement/focus seam | **Fixed** | Loading state clears and the header-aware focus seam is tested by shell/management component and geometry suites. |
| S4-NC-01 / H-35 — single registration decisions lacked audit proof | **Fixed** | Single approve/reject now writes one credential-free audit outcome; the focused auth/registration and Worker D1 suites cover success, duplicate/conflict, and capability denial. |
| S4-POLISH-01 — unified navigation/auth return | **Fixed** | Safe origin-aware return and AUTH_REQUIRED/FORBIDDEN separation are covered by F-494-02 and F-495-01. |
| S4-POLISH-02 — responsive geometry | **Fixed** | Shell, public, attendance, management, identity, Account Access, and permission geometry artifacts are rendered in F-495-02. |
| S4-POLISH-03 — Account row/detail restoration | **Fixed** | Account Directory component and authenticated management round-trip tests cover the state snapshot. |
| S4-POLISH-04 — modal/focus semantics | **Fixed** | Local Sheet/Dialog semantics, Escape, focus return, and live-state behavior are covered at component and management seams. Human AT behavior remains unclaimed. |
| S4-POLISH-05 — role-policy visual cleanup | **Fixed** | Identity hierarchy now uses normalized identity summaries and the protected baseline note; hierarchy/permission tests cover the observable result. |
| S4-POLISH-06 — single-decision audit proof | **Fixed** | Covered by the same F-494-01 auth/registration evidence and immutable audit assertions. |
| Prototype horizontal overflow in the responsive audit | **Preserve** | `/prototype` is historical/non-shipped scope by the Phase F contract; it is not represented as product readiness or silently counted as fixed. |
| Screenshot/image comparison evidence in the source audits | **Preserve** | Historical screenshots and audit observations remain provenance. Phase F release evidence is numeric DOM/API evidence and does not replace the historical record. |
| Native camera, print, radio, select, navigation, and live-region exceptions | **Preserve** | These are documented platform/semantic exceptions in `DESIGN.md` and `web/COMPONENT_INVENTORY.md`; human hardware/print/AT outcomes remain `UNCLAIMED`. |

## Release relationship

The dispositions above close the implementation side of the active P0/P1 and
lower-severity touched-route findings. They do not waive the required release
gates:

- F-494-01 through F-494-04 are recorded `READY` in the contraction evidence.
- The rendered numeric report is internally consistent at 367 total, 282
  passed, 85 intentional skips, and 0 failed.
- The committed numeric report remains historical evidence only for the
  current gate: the fresh required Programs geometry rerun failed when the
  loopback Worker died, so F-495-02 is `BLOCKED` rather than `READY`.
- F-495-01 and F-495-03 remain `BLOCKED` by the reproducible full Programs D1
  loopback Worker failure; isolated Programs geometry passes are not a
  substitute for that journey.
- F-495-04 remains `UNCLAIMED` for human keyboard/AT, real-device, camera,
  touch/safe-area, print-preview, reduced-motion, forced-colors, zoom/reflow,
  and text-spacing evaluation.
- The final authority chain and exact re-run condition are in
  `docs/qa/2026-09-01-s4-phase-f-release-gate.md`.
