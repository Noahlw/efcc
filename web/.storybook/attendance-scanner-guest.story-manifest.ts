import * as stories from "./attendance-scanner-guest.stories";
import { discoverStoryDeclarations } from "./presentation-meta";

export const attendanceScannerGuestStoryDeclarations =
  discoverStoryDeclarations(stories);
