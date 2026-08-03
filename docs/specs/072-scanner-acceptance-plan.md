# F5 Scanner Acceptance Plan

**Status:** Proposed / blocked on manual `Attendances` setup and fresh `/exec` proof
**Parent:** #83, #96. **Spec:** #93. **Architecture:** ADR-0015, ADR-0016
**Date:** 2026-08-01

## Runtime ownership

- The **Scanner Section** stays inside the Apps Script App Document. It loads the
  permitted Event picker, opens the Scanner Window, runs `api_qrCheckIn`, and
  shows only compact launch/session/bridge recovery errors.
- The **Scanner Window** is the external HTTPS page. It owns the camera, decoder,
  loading animation, in-flight processing indicator, result, retry, and return-to-
  scanning controls. The App Document does not render a per-scan result log.
- The Attendance RPC remains the authority. The Scanner Window sends only an
  opaque `scannedCode`; it never resolves a Member or writes Sheets directly.

## Preconditions

1. The operator manually archives the legacy `Attendances` tab.
2. The operator runs `setupAttendancesSheet_` once from the Apps Script editor.
3. The new `Attendances` tab has exactly these operational headers (extra columns
   are not required for F5):

   `Attendance_ID | Event_ID | User_ID | CheckIn_Time | CheckIn_Method | CheckIn_By | Status`

4. A fresh versioned `/exec?efcc_e2e=1` deployment is supplied through
   `E2E_TARGET_URL`; never use the production deployment for acceptance.

## Role matrix

| Role | User | Scanner nav | Viewports |
| --- | --- | --- | --- |
| STAFF | alice / 1234 | visible | 375px, 1280px |
| ADMIN | noah / 6883 | visible | 375px, 1280px |
| MEMBER | bob / 5678 | hidden; direct access forbidden | 375px |
| Program Leader | controlled DEV fixture only | own permitted Events | 375px |

## Acceptance trace

1. **Scanner access:** STAFF/ADMIN and permitted Program Leaders see `掃描`;
   MEMBER does not.
2. **Event loading:** entering Scanner shows a Section loading state, then the
   Event selector contains only permitted active Events. The selector remains
   present even when there is one Event.
3. **Launch:** the operator selects an Event and taps `掃描 QR Code` once. A
   popup-blocked launch shows one recoverable App Script error; a successful
   launch does not duplicate a success/status log in the App Document.
4. **Scanner boot:** the Scanner Window visibly transitions through
   `開啟掃描器` -> `連線中` -> `正在開啟相機` -> `對準 QR Code`. Loading uses an
   indeterminate animation, not a false percentage.
5. **Valid scan:** decoding a valid enrolled Member sends only `scannedCode` to
   the App Document. The App Document calls `api_qrCheckIn`; the server creates
   exactly one Attendance and one Audit_Log row; the Scanner Window shows
   `簽到成功` with the server-derived Member name.
6. **Continuous scanning:** after success, the camera remains open and returns
   automatically to `READY`; the operator does not return to the App Document.
7. **Duplicate scan:** `created:false` produces a brief neutral `已簽到`
   acknowledgement, no second Attendance row, no alarm/chime, and no App Script
   result-log entry; the Scanner Window returns to `READY`.
8. **In-flight protection:** while `簽到處理中…` is visible, the camera remains
   visible but additional decodes do not start another RPC.
9. **Typed business failure:** unknown Member, inactive Member, not enrolled,
   inactive Event, or forbidden Event shows the server-derived Traditional
   Chinese reason and a `返回掃描` action. It does not echo `scannedCode`.
10. **Transport failure:** a check-in transport failure shows `重試簽到` in the
    same Scanner Window; retry does not require closing or reopening it.
11. **Camera/bridge failure:** permission denial, unavailable camera, or bridge
    timeout stops the spinner and exposes an in-place recovery action.
12. **Teardown:** leaving Scanner or logging out closes the Scanner Window,
    removes the message listener, clears in-flight/cooldown state, and prevents
    later messages from invoking the RPC.
13. **Accessibility:** every loading/result state is exposed through the status
    region; reduced-motion users receive an equivalent non-animated state.

## Forbidden paths

- MEMBER calls `api_getScannerEvents` -> `FORBIDDEN`; no Event data.
- Forged `api_qrCheckIn` Event or code -> typed failure; no Attendance write.
- Stale session -> `AUTH_REQUIRED`; login recovery; no write.
- Program Leader scans an Event outside their assigned Program -> `FORBIDDEN`;
  the server re-checks even if the picker is spoofed.
- Scanner-origin messages from any origin other than the exact allowlisted origin
  -> ignored; no RPC.
- Messages arriving after Section leave/logout -> ignored; no RPC.

## Recovery paths

- **Session expiry:** result returns `AUTH_REQUIRED`; the App Document clears the
  session, closes the Scanner Window, and renders the login recovery state.
- **Event-list transport failure:** the Section renders its existing recoverable
  error card with retry; retry reloads `api_getScannerEvents`.
- **Check-in transport failure:** the Scanner Window remains open and exposes
  `重試簽到` for the last code.
- **Camera denial/unavailable:** the Scanner Window stops loading, explains the
  recovery, and exposes one in-place camera retry.
- **Section leave/logout:** teardown is idempotent and leaves no popup/listener/
  timer able to submit a scan.

## Verification boundary

Unit tests use mocked RPCs and must prove state/bridge contracts without writing
Sheets. The required deployed phone run proves the real App Document -> external
Scanner Window -> `postMessage` -> `api_qrCheckIn` -> Attendance row -> result
overlay path. Per AGENTS.md, the agent does not mutate the Google Sheet
automatically; the operator performs the manual tab archive/setup first.
