import * as stories from "./management-identity.stories";
import { discoverStoryDeclarations } from "./presentation-meta";

export const managementIdentityStoryDeclarations =
  discoverStoryDeclarations(stories);
