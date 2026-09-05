import {
  Default,
  Empty,
  Loading,
  RecoverableError,
} from "./management-hub.stories";
import { MANAGEMENT_HUB_PRESENTATION } from "./management-hub.story-contract";

export const managementHubStoryDeclarations = [
  {
    psn: MANAGEMENT_HUB_PRESENTATION.default.psn,
    state: "default",
    storyId: MANAGEMENT_HUB_PRESENTATION.default.storyId,
    story: Default,
  },
  {
    psn: MANAGEMENT_HUB_PRESENTATION.loading.psn,
    state: "loading",
    storyId: MANAGEMENT_HUB_PRESENTATION.loading.storyId,
    story: Loading,
  },
  {
    psn: MANAGEMENT_HUB_PRESENTATION.empty.psn,
    state: "empty",
    storyId: MANAGEMENT_HUB_PRESENTATION.empty.storyId,
    story: Empty,
  },
  {
    psn: MANAGEMENT_HUB_PRESENTATION.recoverableError.psn,
    state: "recoverable-error",
    storyId: MANAGEMENT_HUB_PRESENTATION.recoverableError.storyId,
    story: RecoverableError,
  },
] as const;
