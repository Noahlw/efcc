// @ts-expect-error This manifest intentionally inspects the TSX CSF module at runtime.
import * as stories from "./attendance-scanner-guest.stories";
import { discoverStoryDeclarations } from "./presentation-meta";

export const attendanceScannerGuestStoryDeclarations =
  discoverStoryDeclarations(stories);
