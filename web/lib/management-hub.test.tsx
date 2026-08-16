import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type { Bootstrap, Section } from "@/lib/api";
import { AppProvider } from "@/lib/app-context";
import { COPY } from "@/lib/copy";
import {
  ManagementHub,
  projectManagementHubGroups,
} from "@/lib/management-hub";

const mocks = vi.hoisted(() => {
  const router = {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  };
  return {
    getManagementAccess: vi.fn(),
    router,
  };
});

const server = setupServer();

vi.mock(import("@/lib/programs/program-api"), () => ({
  getManagementAccess: mocks.getManagementAccess,
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
}));

const profile = {
  userId: "admin-1",
  name: "Admin User",
  username: "admin",
  phone: "5555",
  role: "Admin",
  status: "Active",
  qrCodeString: "qr-admin",
};

const section = (key: string, capability = "READ", label = key): Section => ({
  key,
  label,
  capability,
  requiresServerAuth: true,
});

const allSections = [
  section("home"),
  section("permissions", "AUTH", COPY.sections.permissions),
  section("events", "AUTH", COPY.sections.events),
  section("care", "AUTH", COPY.sections.care),
  section("home-cms", "home.publish", COPY.management.homeContent),
];

const access = {
  hasManagementCapability: true,
  departmentScopes: 2,
  programScopes: 3,
};

const bootstrap = (overrides: Partial<Bootstrap> = {}): Bootstrap => ({
  profile,
  sections: allSections,
  navigation: allSections,
  ...overrides,
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

beforeEach(() => {
  window.history.replaceState({}, "", "/management");
  mocks.getManagementAccess.mockReset();
  mocks.router.push.mockReset();
  mocks.router.replace.mockReset();
  server.resetHandlers();
  cleanup();
});

afterAll(() => server.close());

describe(projectManagementHubGroups, () => {
  test("keeps the exact group order and omits no authorized rows", () => {
    const groups = projectManagementHubGroups(profile, allSections, access);

    expect(groups.map((group) => group.label)).toStrictEqual([
      COPY.management.groupMembership,
      COPY.management.groupOperations,
      COPY.management.groupContent,
    ]);
    expect(
      groups.map((group) => group.rows.map((row) => row.key))
    ).toStrictEqual([
      ["approvals", "members", "permissions"],
      ["programs", "events", "care"],
      ["home"],
    ]);
  });

  test("omits unauthorized groups and rows instead of rendering disabled affordances", () => {
    const groups = projectManagementHubGroups(
      { role: "Member" },
      [section("home")],
      {
        hasManagementCapability: false,
        departmentScopes: 0,
        programScopes: 0,
      }
    );

    expect(groups).toStrictEqual([]);
  });
});

describe(ManagementHub, () => {
  test("renders only the server-authorized group headings", async () => {
    mocks.getManagementAccess.mockResolvedValue(access);
    render(
      <AppProvider bootstrap={bootstrap()} onSignOut={() => {}}>
        <ManagementHub />
      </AppProvider>
    );

    await expect(
      screen.findByRole("heading", {
        name: COPY.management.groupMembership,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
    ).toStrictEqual([
      COPY.management.groupMembership,
      COPY.management.groupOperations,
      COPY.management.groupContent,
    ]);
  });

  test("does not render member rows when the server grants no management scope", async () => {
    mocks.getManagementAccess.mockResolvedValue({
      hasManagementCapability: false,
      departmentScopes: 0,
      programScopes: 0,
    });
    render(
      <AppProvider
        bootstrap={bootstrap({
          profile: { ...profile, role: "Member" },
          sections: [section("home")],
          navigation: [section("home")],
        })}
        onSignOut={() => {}}
      >
        <ManagementHub />
      </AppProvider>
    );

    await expect(
      screen.findByText(COPY.management.forbidden)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: COPY.management.groupMembership })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.management.memberDirectory })
    ).not.toBeInTheDocument();
  });

  test("uses the scoped member API and preserves the query after an error", async () => {
    server.use(
      http.get("/api/v1/management/members", ({ request }) => {
        expect(new URL(request.url).searchParams.get("q")).toBe("An");
        return HttpResponse.json({
          requestId: "rid-members",
          data: {
            members: [
              { user_id: "member-1", name: "Angela Chan", username: "angela" },
            ],
          },
        });
      })
    );
    mocks.getManagementAccess.mockResolvedValue(access);
    const user = userEvent.setup();
    render(
      <AppProvider bootstrap={bootstrap()} onSignOut={() => {}}>
        <ManagementHub />
      </AppProvider>
    );

    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(COPY.management.memberDirectory),
      })
    );
    const input = await screen.findByRole("searchbox", {
      name: COPY.management.memberSearchLabel,
    });
    await user.type(input, "An");
    await user.click(
      screen.getByRole("button", { name: COPY.management.memberSearchSubmit })
    );
    await expect(screen.findByText("Angela Chan")).resolves.toBeInTheDocument();

    server.use(
      http.get("/api/v1/management/members", () =>
        HttpResponse.json(
          { code: "UNAVAILABLE", detail: "temporarily unavailable" },
          { status: 503 }
        )
      )
    );
    await user.clear(input);
    await user.type(input, "Error");
    await user.click(
      screen.getByRole("button", { name: COPY.management.memberSearchSubmit })
    );
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.management.memberSearchError
    );
    expect(input).toHaveValue("Error");
  });
});
