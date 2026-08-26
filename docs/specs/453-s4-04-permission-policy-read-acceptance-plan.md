# S4-04 Permission Policy read projection acceptance trace

**Ticket:** #453
**Parent authority:** #449, `docs/specs/369-s4-management-access.md`, ADR-0038, ADR-0039
**Presentation authority:** `prototype/s4-management-access` at `653a531` — Permissions C, Change-set Review
**Status:** Acceptance trace written before implementation

## Contract under test

The authenticated `/management?module=permissions` surface reads the authoritative
global 13-Capability Role policy through the existing
`GET /api/v1/programs/account-permissions` resource. The read response includes
the monotonic policy revision, complete Admin/Staff/Member mapping, Cantonese
labels/descriptions, applicability and lock metadata, actor editability, and
authorized elevated-account context. This ticket has no mutation endpoint or
optimistic Save behavior.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| API-01 | Active Admin requests the Account Permissions resource | Call `GET /api/v1/programs/account-permissions` | `200` response contains `revision`, the complete 13 × 3 Role/Capability mapping, descriptions, applicability/lock metadata, actor editability, and elevated-account context; body `requestId` matches `X-Request-Id`. |
| API-02 | Active Staff requests the same resource | Call the endpoint with Staff's cookie | `200` response is the same authoritative policy, with `actor.canEdit=false` and read-only editability metadata. |
| API-03 | Member or scoped-only actor requests the resource directly | Call the endpoint with Member and Member-with-active-scoped-grant cookies | Server returns `403` Problem Details with `code=FORBIDDEN`; no client-side projection substitutes for authorization. |
| API-04 | Policy is seeded from S4 additive defaults | Read the response and D1 rows | `program.enroll` is visibly shared by Admin, Staff, and Member; Admin-only `home.publish` and `account.permissions.write` are represented with authoritative lock reasons; no per-account or scoped-grant editor appears. |
| UI-01 | Admin receives the real projection | Render Permissions C on desktop | Grouped participant baseline, Department, Program, and Account/System sections are readable; persistent change-summary region explains that this ticket is read-only and shows editable intent without a fake Save mutation. |
| UI-02 | Staff receives the real projection | Render Permissions C | Complete policy remains readable; Staff is explicitly read-only and no editable control or Save action is exposed. |
| UI-03 | Shared baseline or safety invariant is rendered | Inspect policy cells | Locked cells are semantic non-controls with visible reason text, never disabled-looking checkboxes. |
| UI-04 | Resource is loading, forbidden, or fails recoverably | Render each state and activate retry where applicable | Each state owns one heading/focus target; busy/error feedback is announced; forbidden is distinct; retry re-fetches without stale optimistic content. |
| UI-05 | Policy renders at 320, 390, 800, and 1440px | Inspect DOM geometry and screenshots | Phone uses grouped Role/Capability rows/cards (not a shrunken 13 × 3 table); desktop uses dense policy + summary; no page horizontal overflow; targets are at least 44px and content clears the dock. |

## Test seams and gates

- Worker/domain seam: `web/lib/programs/account-permissions.test.ts` exercises the
  real Worker/D1 response, authorization, revision/defaults, metadata, and
  elevated-account projection.
- Component seam: `web/lib/permissions-panel.test.tsx` exercises grouped rendering,
  Staff read-only and locked semantics, state headings/focus/retry, and the
  read-only change summary without coupling to CSS class names.
- Local Worker/D1 Playwright is the final authenticated proof for Admin, Staff,
  Member, and scoped-only actors at all four widths; screenshots prove layout,
  while response/D1 assertions prove authorization and authoritative values.
- Required repository gates: root and web typecheck, focused Worker/component
  tests, production build, responsive/focus geometry suite, and `git diff --check`.

## Prototype-to-production delta register

- Permissions C structure is preserved. Production replaces the prototype's
  in-memory switcher and fake toggles with the real Worker/D1 projection.
- The read ticket renders Admin editable intent as metadata only; no Save or
  mutation control ships until #454.
