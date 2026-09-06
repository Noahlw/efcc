import { discoverStoryDeclarations } from "./presentation-meta";
// @ts-expect-error This manifest intentionally inspects the TSX CSF module at runtime.
import * as stories from "./public-auth-member-communications.stories";

export const publicAuthMemberCommunicationsStoryDeclarations =
  discoverStoryDeclarations(stories);
