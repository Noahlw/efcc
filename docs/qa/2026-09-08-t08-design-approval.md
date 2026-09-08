# T08 control design ApprovalPackage evidence

**Status:** `APPROVED — T08 control design`

**Reviewer:** Noah Wong / Repository Owner

**Approved at:** `2026-09-08T02:19:39Z`

**Reviewed production implementation revision:**
`1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76`

**Qualification revision:**
`1578d606362332edd006e0e681834b5810b16f36`

**PR:** [#574](https://github.com/Noahlw/efcc/pull/574)

## Review statement

Following the T08 QA checklist, the repository owner confirmed approval of all
seven durable control Stories at the representative `390`, `799`, `800`, and
`1440` viewports. This is the required T08 `kind: design` approval for the
production control implementation revision above.

The qualification and evidence revisions after the production implementation
do not change the reviewed control implementation. This approval does not
authorize merge, issue closure, release, T09+ work, or any B-003 disposition.

## Reviewed control PSNs and locators

| Control | PSN | Story locator |
|---|---|---|
| Button | `PSN-CONTROL-BUTTON` | [Button States](http://127.0.0.1:6007/iframe.html?id=controls--button-states&viewMode=story) |
| Icon Button | `PSN-CONTROL-ICON-BUTTON` | [Icon Button States](http://127.0.0.1:6007/iframe.html?id=controls--icon-button-states&viewMode=story) |
| Input | `PSN-CONTROL-INPUT` | [Input States](http://127.0.0.1:6007/iframe.html?id=controls--input-states&viewMode=story) |
| Textarea | `PSN-CONTROL-TEXTAREA` | [Textarea States](http://127.0.0.1:6007/iframe.html?id=controls--textarea-states&viewMode=story) |
| Checkbox | `PSN-CONTROL-CHECKBOX` | [Checkbox States](http://127.0.0.1:6007/iframe.html?id=controls--checkbox-states&viewMode=story) |
| Switch | `PSN-CONTROL-SWITCH` | [Switch States](http://127.0.0.1:6007/iframe.html?id=controls--switch-states&viewMode=story) |
| Select | `PSN-CONTROL-SELECT` | [Select States](http://127.0.0.1:6007/iframe.html?id=controls--select-states&viewMode=story) |

## Approval scope

- **Kind:** `design`
- **Viewports:** `390`, `799`, `800`, `1440`
- **Browser:** Chromium
- **App-facing route scope:** `/*` (shared control usage; no route behavior changed)
- **Contracts:** `CTR-TK-01`, `CTR-TK-07`, `CTR-TK-10`
- **Machine evidence:** `verify:programs` returned `functional-passed` at
  `1578d606362332edd006e0e681834b5810b16f36`; artifact
  `test-results/programs-promotion/20260907t182826352z`

This document records the owner decision and does not promote a visual
baseline or grant merge authorization.
