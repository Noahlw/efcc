import * as stories from "./controls.stories";
import { discoverStoryDeclarations } from "./presentation-meta";

export const controlStoryDeclarations = discoverStoryDeclarations(stories);
