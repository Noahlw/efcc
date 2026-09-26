import * as stories from "./foundations.stories";
import { discoverStoryDeclarations } from "./presentation-meta";

export const foundationStoryDeclarations = discoverStoryDeclarations(stories);
