import { discoverStoryDeclarations } from "./presentation-meta";
import * as stories from "./public-auth-member-communications.stories";

export const publicAuthMemberCommunicationsStoryDeclarations =
  discoverStoryDeclarations(stories);
