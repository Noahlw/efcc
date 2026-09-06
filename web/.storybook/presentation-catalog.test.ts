import { describe, expect, test } from "vitest";

import { MANAGEMENT_HUB_STORY_IDS } from "./management-hub-story-ids";
import {
  ALL_PRESENTATION_DECLARATIONS,
  ATTENDANCE_SCANNER_GUEST_PRESENTATION_DECLARATIONS,
  MANAGEMENT_HUB_PRESENTATION_DECLARATIONS,
  MANAGEMENT_IDENTITY_PRESENTATION_DECLARATIONS,
  PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS,
  PROGRAMS_PRESENTATION_DECLARATIONS,
  SCREEN_CATALOG,
  validateScreenCatalog,
} from "./presentation-catalog";

const psnsFor = (screenId: string) =>
  SCREEN_CATALOG.find((entry) => entry.screenId === screenId)?.psns ?? [];

describe("T07 Screen Catalog foundation", () => {
  test("discovers four unique Management Hub states from real Stories", () => {
    expect(MANAGEMENT_HUB_PRESENTATION_DECLARATIONS).toHaveLength(4);
    expect(
      MANAGEMENT_HUB_PRESENTATION_DECLARATIONS.map(({ psn }) => psn)
    ).toStrictEqual([
      "PSN-MGMT-HUB-DEFAULT",
      "PSN-MGMT-HUB-LOADING",
      "PSN-MGMT-HUB-EMPTY",
      "PSN-MGMT-HUB-RECOVERABLE-ERROR",
    ]);
    expect(
      MANAGEMENT_HUB_PRESENTATION_DECLARATIONS.map(({ storyId }) => storyId)
    ).toStrictEqual(Object.values(MANAGEMENT_HUB_STORY_IDS));

    expect(
      SCREEN_CATALOG.find((entry) => entry.screenId === "management-hub")
    ).toMatchObject({
      productFamily: "management",
      lifecycle: "active",
      primaryBaselinePsn: "PSN-MGMT-HUB-DEFAULT",
      route: "/management",
      intent: null,
      gap: null,
      supersedes: [],
    });
  });

  test("catalogs every T07.2 baseline screen and its route", () => {
    expect(
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS
    ).toHaveLength(8);
    expect([
      ["auth-sign-in", psnsFor("auth-sign-in")],
      ["auth-register", psnsFor("auth-register")],
      ["member-home", psnsFor("member-home")],
      ["member-profile", psnsFor("member-profile")],
      ["member-account-settings", psnsFor("member-account-settings")],
      ["communications-notices", psnsFor("communications-notices")],
      ["communications-messages", psnsFor("communications-messages")],
      ["public-not-found", psnsFor("public-not-found")],
    ]).toStrictEqual([
      ["auth-sign-in", ["PSN-AUTH-SIGN-IN-DEFAULT"]],
      ["auth-register", ["PSN-AUTH-REGISTER-DEFAULT"]],
      ["member-home", ["PSN-MEMBER-HOME-DEFAULT"]],
      ["member-profile", ["PSN-MEMBER-PROFILE-DEFAULT"]],
      ["member-account-settings", ["PSN-MEMBER-ACCOUNT-SETTINGS"]],
      ["communications-notices", ["PSN-COMMS-NOTICES-DEFAULT"]],
      ["communications-messages", ["PSN-COMMS-MESSAGES-DEFAULT"]],
      ["public-not-found", ["PSN-PUBLIC-NOT-FOUND"]],
    ]);
    expect(
      SCREEN_CATALOG.find((entry) => entry.screenId === "auth-sign-in")
    ).toMatchObject({
      productFamily: "public-auth-member-communications",
      route: "/",
      intent: null,
      primaryBaselinePsn: "PSN-AUTH-SIGN-IN-DEFAULT",
    });
    expect(ALL_PRESENTATION_DECLARATIONS).toHaveLength(37);
  });

  test("classifies the credential/PIN upgrade as a transient sign-in state", () => {
    const signIn = SCREEN_CATALOG.find(
      (entry) => entry.screenId === "auth-sign-in"
    );
    expect(signIn).toMatchObject({
      route: "/",
      intent: null,
      lifecycle: "active",
    });
    expect(
      SCREEN_CATALOG.some(
        (entry) => entry.screenId === "auth-credential-upgrade"
      )
    ).toBeFalsy();
  });

  test("catalogs every T07.3 Programs composition with truthful intent", () => {
    expect(PROGRAMS_PRESENTATION_DECLARATIONS).toHaveLength(9);
    expect(
      SCREEN_CATALOG.find(
        (entry) => entry.screenId === "programs-participant-event-detail"
      )
    ).toMatchObject({
      productFamily: "programs",
      route: "/programs",
      intent: "program=t07-3-program&event=t07-3-event",
    });
    expect(
      SCREEN_CATALOG.find(
        (entry) => entry.screenId === "programs-workspace-notifications"
      )
    ).toMatchObject({
      route: "/programs",
      intent: "mode=management&program=t07-3-program&task=notifications",
    });
  });

  test("catalogs every T07.4 Management/Identity composition", () => {
    expect(MANAGEMENT_IDENTITY_PRESENTATION_DECLARATIONS).toHaveLength(11);
    expect(
      SCREEN_CATALOG.find(
        (entry) => entry.screenId === "management-account-access"
      )
    ).toMatchObject({
      productFamily: "management-identity",
      route: "/management",
      intent: "module=accounts&account=t07-4-account&view=access",
      primaryBaselinePsn: "PSN-MGMT-ACCOUNT-ACCESS",
    });
  });

  test("catalogs every T07.5 Attendance/Scanner/Guest composition", () => {
    expect(ATTENDANCE_SCANNER_GUEST_PRESENTATION_DECLARATIONS).toHaveLength(5);
    expect(
      SCREEN_CATALOG.find(
        (entry) => entry.screenId === "attendance-assisted-check-in"
      )
    ).toMatchObject({
      productFamily: "attendance-scanner-guest",
      route: "/scanner",
      intent: "mode=assisted&event=t07-5-event",
      primaryBaselinePsn: "PSN-ATTENDANCE-ASSISTED-CHECK-IN",
    });
    expect(SCREEN_CATALOG).toHaveLength(34);
    expect(ALL_PRESENTATION_DECLARATIONS).toHaveLength(37);
  });

  test("validates the aggregate catalog against Story-owned metadata", () => {
    expect(
      validateScreenCatalog(SCREEN_CATALOG, ALL_PRESENTATION_DECLARATIONS)
    ).toStrictEqual([]);
  });
});
