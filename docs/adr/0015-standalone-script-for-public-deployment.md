# Standalone Script for Public Deployment

**Status:** Proposed — code change landed; account-side migration (new script
project, Spreadsheet re-share, redeploy) pending
**Date:** 2026-07-30
**Amends:** the deployment model implied by ADR-0001 and ADR-0010, which
assumed a container-bound script without stating it as a decision

## Problem

The app was a container-bound Apps Script project (its `doGet()` and RPCs
lived inside the member spreadsheet as the container). Google documents that
"container-bound scripts inherit the access permissions of their container
file" (https://developers.google.com/apps-script/guides/bound). After the
project's Drive ownership was transferred to the `efcc-ggc.org` Workspace
domain (to fix a separate cross-domain `clasp deploy` rejection), the
container's general access was set to domain-restricted. Because the script's
access list is the container's access list, this also blocked the deployed
web app for anyone outside the domain — including the church members with
personal Gmail accounts the app must serve, and even the account that
previously owned the file. The app's own manifest
(`webapp.access = ANYONE_ANONYMOUS`) had no effect, because the restriction
was enforced at the container/Drive layer, not the web app deployment layer.

The spreadsheet holds member PII (name, phone, DOB, PIN code) — sharing it
"Anyone with the link" to work around the bug would expose that data
directly, which is unacceptable.

## Decision

Convert the script from container-bound to **standalone**. A standalone
project has its own Drive file and its own independent access list, separate
from any spreadsheet (https://developers.google.com/apps-script/guides/collaborating:
"Standalone projects are shared like any other file in Drive"). The
spreadsheet is opened by ID (`SpreadsheetApp.openById`,
`src/gas/spreadsheet-access.gs`) instead of
`SpreadsheetApp.getActiveSpreadsheet()`, using an `EFCC_SPREADSHEET_ID` Script
Property, fail-closed if unset (same pattern as `EFCC_SESSION_SALT` in
`session.js.gs`).

This lets the deployment stay `access: ANYONE_ANONYMOUS` /
`executeAs: USER_DEPLOYING` for the public web app, while the spreadsheet's
own Drive sharing stays "Restricted," shared only with the account that
deploys the script. Visitors never get Drive-level access to the
spreadsheet — every read/write still goes through the deployed script's own
identity, exactly as it did when bound.

## Consequences

- `users-repository.gs`, `programs-repository.gs`, and
  `program-leaders-repository.gs` call `efccSpreadsheet_()` instead of
  `SpreadsheetApp.getActiveSpreadsheet()`.
- A fresh standalone Apps Script project must be created (ideally owned by
  an `efcc-ggc.org` account, so the same account can both own and deploy it
  without hitting the earlier cross-domain restriction), `EFCC_SPREADSHEET_ID`
  set in its Script Properties, and the spreadsheet shared with that
  project's deploying account as Editor. This is an account/Drive operation
  outside this repo's commit history — tracked separately, not done as part
  of this ADR.
- Existing `.clasp.json` / deployment IDs point at the old bound project and
  must be repointed once the new standalone project exists.
