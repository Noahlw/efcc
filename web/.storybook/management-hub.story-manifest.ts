import * as stories from "./management-hub.stories";
import { discoverStoryDeclarations } from "./presentation-meta";

export const managementHubStoryDeclarations =
  discoverStoryDeclarations(stories);
