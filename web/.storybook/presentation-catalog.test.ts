import { describe, expect, test } from "vitest";

import { MANAGEMENT_HUB_PRESENTATION } from "./management-hub.story-contract";
import {
  ALL_PRESENTATION_DECLARATIONS,
  MANAGEMENT_HUB_PRESENTATION_DECLARATIONS,
  PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS,
  SCREEN_CATALOG,
  validateScreenCatalog,
} from "./presentation-catalog";
import { PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION } from "./public-auth-member-communications.story-contract";

describe("T07.1 Screen Catalog foundation", () => {
  test("declares four unique Management Hub PSNs with resolvable Stories", () => {
    expect(MANAGEMENT_HUB_PRESENTATION_DECLARATIONS).toHaveLength(4);
    expect(
      MANAGEMENT_HUB_PRESENTATION_DECLARATIONS.map(({ psn }) => psn)
    ).toStrictEqual([
      MANAGEMENT_HUB_PRESENTATION.default.psn,
      MANAGEMENT_HUB_PRESENTATION.loading.psn,
      MANAGEMENT_HUB_PRESENTATION.empty.psn,
      MANAGEMENT_HUB_PRESENTATION.recoverableError.psn,
    ]);
    expect(
      validateScreenCatalog(SCREEN_CATALOG, ALL_PRESENTATION_DECLARATIONS)
    ).toStrictEqual([]);
  });

  test("catalogs every T07.2 baseline screen from its owning Story", () => {
    expect(SCREEN_CATALOG).toHaveLength(9);
    expect(
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS
    ).toHaveLength(8);
    expect(
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS.map(
        ({ psn }) => psn
      )
    ).toStrictEqual([
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.signIn.psn,
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.register.psn,
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.home.psn,
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.profile.psn,
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.accountSettings.psn,
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.notices.psn,
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.messages.psn,
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.notFound.psn,
    ]);
    expect(ALL_PRESENTATION_DECLARATIONS).toHaveLength(12);
  });
});
