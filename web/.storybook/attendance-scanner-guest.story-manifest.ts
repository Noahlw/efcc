import {
  AttendanceOperator,
  AttendanceOperatorRoster,
  AssistedCheckIn,
  GuestCheckIn,
  ScannerBoundary,
} from "./attendance-scanner-guest.stories";
import { ATTENDANCE_SCANNER_GUEST_PRESENTATION as PRESENTATION } from "./attendance-scanner-guest.story-contract";

export const attendanceScannerGuestStoryDeclarations = [
  {
    psn: PRESENTATION.guestCheckIn.psn,
    state: "default",
    storyId: PRESENTATION.guestCheckIn.storyId,
    story: GuestCheckIn,
  },
  {
    psn: PRESENTATION.scannerBoundary.psn,
    state: "boundary-self",
    storyId: PRESENTATION.scannerBoundary.storyId,
    story: ScannerBoundary,
  },
  {
    psn: PRESENTATION.assistedCheckIn.psn,
    state: "assisted",
    storyId: PRESENTATION.assistedCheckIn.storyId,
    story: AssistedCheckIn,
  },
  {
    psn: PRESENTATION.operator.psn,
    state: "chooser",
    storyId: PRESENTATION.operator.storyId,
    story: AttendanceOperator,
  },
  {
    psn: PRESENTATION.operatorRoster.psn,
    state: "roster",
    storyId: PRESENTATION.operatorRoster.storyId,
    story: AttendanceOperatorRoster,
  },
] as const;
