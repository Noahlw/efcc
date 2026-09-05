import {
  AccountSettings,
  Home,
  Messages,
  NotFound,
  Notices,
  Profile,
  Register,
  SignIn,
} from "./public-auth-member-communications.stories";
import { PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION as PRESENTATION } from "./public-auth-member-communications.story-contract";

export const publicAuthMemberCommunicationsStoryDeclarations = [
  {
    psn: PRESENTATION.signIn.psn,
    state: "default",
    storyId: PRESENTATION.signIn.storyId,
    story: SignIn,
  },
  {
    psn: PRESENTATION.register.psn,
    state: "default",
    storyId: PRESENTATION.register.storyId,
    story: Register,
  },
  {
    psn: PRESENTATION.home.psn,
    state: "default",
    storyId: PRESENTATION.home.storyId,
    story: Home,
  },
  {
    psn: PRESENTATION.profile.psn,
    state: "default",
    storyId: PRESENTATION.profile.storyId,
    story: Profile,
  },
  {
    psn: PRESENTATION.accountSettings.psn,
    state: "default",
    storyId: PRESENTATION.accountSettings.storyId,
    story: AccountSettings,
  },
  {
    psn: PRESENTATION.notices.psn,
    state: "default",
    storyId: PRESENTATION.notices.storyId,
    story: Notices,
  },
  {
    psn: PRESENTATION.messages.psn,
    state: "default",
    storyId: PRESENTATION.messages.storyId,
    story: Messages,
  },
  {
    psn: PRESENTATION.notFound.psn,
    state: "default",
    storyId: PRESENTATION.notFound.storyId,
    story: NotFound,
  },
] as const;
