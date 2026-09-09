import { describe, expect, test } from "vitest";

import { PRESENTATION_SCREEN_CATALOG } from "@/lib/governance/presentation-screen-catalog";
import {
  buildProgramsHref,
  parseProgramsIntent,
} from "@/lib/programs/programs-intent";

import { MANAGEMENT_HUB_STORY_IDS } from "./management-hub-story-ids";
import {
  ALL_PRESENTATION_DECLARATIONS,
  ATTENDANCE_SCANNER_GUEST_PRESENTATION_DECLARATIONS,
  MANAGEMENT_HUB_PRESENTATION_DECLARATIONS,
  MANAGEMENT_IDENTITY_PRESENTATION_DECLARATIONS,
  PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS,
  PROGRAMS_PRESENTATION_DECLARATIONS,
  SCREEN_CATALOG,
  createScreenCatalog,
  validateScreenCatalog,
} from "./presentation-catalog";
import { WorkspaceNotifications } from "./programs.stories";

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
    ).toHaveLength(9);
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
      [
        "auth-sign-in",
        ["PSN-AUTH-SIGN-IN-DEFAULT", "PSN-AUTH-SIGN-IN-CREDENTIAL-UPGRADE"],
      ],
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
    expect(ALL_PRESENTATION_DECLARATIONS).toHaveLength(39);
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
      intent: "mode=management&task=notifications",
    });
  });

  test("keeps NotFound as a framework fallback, not a product route", () => {
    expect(
      SCREEN_CATALOG.find((entry) => entry.screenId === "public-not-found")
    ).toMatchObject({ route: null });
  });

  test("keeps the independent obligation list separate from Story discovery", () => {
    expect(PRESENTATION_SCREEN_CATALOG).toHaveLength(35);
    expect(SCREEN_CATALOG.map(({ screenId }) => screenId)).toStrictEqual(
      PRESENTATION_SCREEN_CATALOG.map(({ screenId }) => screenId)
    );
    expect(
      SCREEN_CATALOG.find((entry) => entry.screenId === "management-hub")?.psns
    ).toHaveLength(4);
  });

  test("fails when an independent baseline Story is deleted", () => {
    const declarations = ALL_PRESENTATION_DECLARATIONS.filter(
      ({ psn }) => psn !== "PSN-MGMT-HUB-DEFAULT"
    );
    const errors = validateScreenCatalog(
      createScreenCatalog(declarations),
      declarations
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must have exactly one primary baseline Story"),
        expect.stringContaining("references unknown primary baseline PSN"),
      ])
    );
  });

  test("fails when a referenced baseline PSN is renamed without supersession", () => {
    const declarations = ALL_PRESENTATION_DECLARATIONS.map((declaration) =>
      declaration.psn === "PSN-MGMT-HUB-DEFAULT"
        ? { ...declaration, psn: "PSN-MGMT-HUB-RENAMED" }
        : declaration
    );
    const errors = validateScreenCatalog(
      createScreenCatalog(declarations),
      declarations
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "primary baseline PSN does not match its Story metadata"
        ),
        expect.stringContaining("references unknown primary baseline PSN"),
      ])
    );
  });

  test("rejects duplicate primary, orphan references, and invalid supersession", () => {
    const hub = ALL_PRESENTATION_DECLARATIONS.find(
      ({ psn }) => psn === "PSN-MGMT-HUB-DEFAULT"
    );
    if (!hub) {
      throw new Error("Management Hub baseline declaration is missing");
    }
    const duplicateDeclarations = [
      ...ALL_PRESENTATION_DECLARATIONS,
      {
        ...hub,
        psn: "PSN-MGMT-HUB-DUPLICATE",
        storyId: "t07-1-management-hub--duplicate",
      },
    ];
    const duplicateErrors = validateScreenCatalog(
      createScreenCatalog(duplicateDeclarations),
      duplicateDeclarations
    );
    expect(duplicateErrors).toContain(
      "management-hub must have exactly one primary baseline Story"
    );

    const orphanCatalog = SCREEN_CATALOG.map((entry) =>
      entry.screenId === "management-hub"
        ? { ...entry, psns: ["PSN-NOT-REGISTERED"] }
        : entry
    );
    expect(
      validateScreenCatalog(orphanCatalog, ALL_PRESENTATION_DECLARATIONS)
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("references unknown PSN"),
      ])
    );

    const invalidObligations = PRESENTATION_SCREEN_CATALOG.map((entry) =>
      entry.screenId === "management-hub"
        ? { ...entry, supersedes: ["management-hub"] }
        : entry
    );
    expect(
      validateScreenCatalog(
        createScreenCatalog(ALL_PRESENTATION_DECLARATIONS, invalidObligations),
        ALL_PRESENTATION_DECLARATIONS,
        invalidObligations
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("invalid supersession target"),
      ])
    );
  });

  test("proves Notifications intent through the production parser", () => {
    expect(
      parseProgramsIntent("?mode=management&task=notifications")
    ).toMatchObject({
      mode: "management",
      programId: null,
      task: "notifications",
      malformed: false,
    });
    expect(
      parseProgramsIntent(
        "?mode=management&program=t07-3-program&task=notifications"
      ).malformed
    ).toBe(true);
  });

  test("catalogs every T07.4 Management/Identity composition", () => {
    expect(MANAGEMENT_IDENTITY_PRESENTATION_DECLARATIONS).toHaveLength(12);
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
    expect(SCREEN_CATALOG).toHaveLength(35);
    expect(ALL_PRESENTATION_DECLARATIONS).toHaveLength(39);
  });

  test("keeps Notifications Story metadata and navigation parser-backed", () => {
    const story = WorkspaceNotifications as unknown as {
      parameters: {
        nextjs: { navigation: { query: Record<string, string> } };
        presentation: { intent: string | null };
      };
    };
    const query = story.parameters.nextjs.navigation.query;
    const parsed = parseProgramsIntent(
      `?${new URLSearchParams(query).toString()}`
    );
    expect(parsed).toMatchObject({
      malformed: false,
      mode: "management",
      programId: null,
      task: "notifications",
    });
    const href = buildProgramsHref({
      mode: parsed.mode,
      programId: parsed.programId,
      task: parsed.task,
    });
    expect(new URL(href, "http://localhost").search.slice(1)).toBe(
      story.parameters.presentation.intent
    );
  });

  test("validates the aggregate catalog against Story-owned metadata", () => {
    expect(
      validateScreenCatalog(SCREEN_CATALOG, ALL_PRESENTATION_DECLARATIONS)
    ).toStrictEqual([]);
  });
});
