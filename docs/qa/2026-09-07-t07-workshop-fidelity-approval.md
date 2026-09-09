# T07 workshop-fidelity ApprovalPackage evidence

**Status:** `APPROVED — T07 workshop fidelity`

**Reviewer:** Repository owner / Noah Wong

**Reviewed implementation revision:** `5d22835de0d3b1802e2ae84b774066edc5e24a2f`

**Shared PR:** [#573](https://github.com/Noahlw/efcc/pull/573), based on `rescue/ui-control-recovery`

## Review statement

The owner compared representative Storybook screens against the actual local
EFCC application and confirmed that Storybook presentation faithfully matches
the current production presentation. Responsive review covered the `390`,
`799`, `800`, and `1440` boundaries with no material workshop-fidelity issue.

This approves Storybook as a trustworthy local presentation workshop for the
current EFCC UI. It does not approve legacy visual design as final design,
T08+ design work, Worker/D1/backend behavior, hardware/scanner/camera behavior,
B-003, or production release.

## Reviewed PSNs and representative families

| Family | Reviewed PSNs |
|---|---|
| Management Hub | `PSN-MGMT-HUB-DEFAULT`, `PSN-MGMT-HUB-LOADING`, `PSN-MGMT-HUB-EMPTY`, `PSN-MGMT-HUB-RECOVERABLE-ERROR` |
| Public/Auth/Member/Communications | `PSN-AUTH-SIGN-IN-DEFAULT`, `PSN-AUTH-SIGN-IN-CREDENTIAL-UPGRADE`, `PSN-MEMBER-HOME-DEFAULT`, `PSN-COMMS-NOTICES-DEFAULT`, `PSN-PUBLIC-NOT-FOUND` |
| Programs | `PSN-PROGRAMS-PARTICIPANT-DIRECTORY`, `PSN-PROGRAMS-WORKSPACE-OVERVIEW`, `PSN-PROGRAMS-WORKSPACE-NOTIFICATIONS` |
| Management/Identity | `PSN-MGMT-ACCOUNT-DIRECTORY`, `PSN-MGMT-APPROVAL-QUEUE`, `PSN-MGMT-REGISTRATIONS-FALLBACK` |
| Attendance/Scanner/Guest | `PSN-ATTENDANCE-GUEST-CHECK-IN`, `PSN-ATTENDANCE-SCANNER-BOUNDARY`, `PSN-ATTENDANCE-ASSISTED-CHECK-IN` |

## Representative locators

- `http://127.0.0.1:6006/iframe.html?id=t07-1-management-hub--default&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-2-public-auth-member-communications--credential-upgrade&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-3-programs--workspace-notifications&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-4-management-identity--registrations-fallback&viewMode=story`

The Storybook URL/slug is a locator; the PSN is the stable presentation
identity. This evidence is workshop-fidelity approval, not a pixel baseline or
real-system acceptance artifact.
