import { discoverStoryDeclarations } from "./presentation-meta";
import * as stories from "./programs.stories";

export const programsStoryDeclarations = discoverStoryDeclarations(stories);
