// @ts-expect-error This manifest intentionally inspects the TSX CSF module at runtime.
import * as stories from "./management-identity.stories";
import { discoverStoryDeclarations } from "./presentation-meta";

export const managementIdentityStoryDeclarations =
  discoverStoryDeclarations(stories);
