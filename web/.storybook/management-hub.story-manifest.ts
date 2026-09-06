// @ts-expect-error This manifest intentionally inspects the TSX CSF module at runtime.
import * as stories from "./management-hub.stories";
import { discoverStoryDeclarations } from "./presentation-meta";

export const managementHubStoryDeclarations =
  discoverStoryDeclarations(stories);
