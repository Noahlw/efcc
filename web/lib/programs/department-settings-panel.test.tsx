import { cleanup, render, screen, waitFor } from "@testing-library/react";
// AUTH-01 (#255) — component tests for the Department-scoped settings panel
// and its Management Directory launcher. MSW intercepts the Worker endpoints;
// fixtures carry no credential material.
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { COPY } from "@/lib/copy";
import { DepartmentSettingsPanel } from "@/lib/programs/department-settings-panel";
import { ManagementDirectory } from "@/lib/programs/management-directory";
import type {
  Department,
  DepartmentManager,
  DepartmentModule,
} from "@/lib/programs/program-api";

const mocks = vi.hoisted(() => {
  const router = {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<() => void>(),
    replace: vi.fn<() => void>(),
    prefetch: vi.fn<() => void>(),
  };
  return { router };
});

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
}));

const server = setupServer();

const DEPARTMENT_ID = "dept-1";

const MANAGER_CAPABILITIES = {
  manage: true,
  publish: true,
  module_configure: true,
  manager_assign: true,
} as const;

const ONLY_MANAGER_ASSIGN_CAPABILITIES = {
  manage: false,
  publish: false,
  module_configure: false,
  manager_assign: true,
} as const;

const DEPARTMENT: Department = {
  department_id: DEPARTMENT_ID,
  code: "DEP-1",
  name: "青年事工",
  description: null,
  lifecycle: "Active",
  display_order: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities: MANAGER_CAPABILITIES,
};

const MODULES: DepartmentModule[] = [
  {
    department_id: DEPARTMENT_ID,
    module_key: "program_catalog",
    enabled: 1,
    enabled_at: "2026-01-01T00:00:00.000Z",
  },
  {
    department_id: DEPARTMENT_ID,
    module_key: "events",
    enabled: 0,
    enabled_at: "2026-01-01T00:00:00.000Z",
  },
];

const MANAGER_BOB: DepartmentManager = {
  department_id: DEPARTMENT_ID,
  user_id: "U002",
  granted_by: "U001",
  granted_at: "2026-08-01T00:00:00.000Z",
  revoked_by: null,
  revoked_at: null,
  user_name: "測試會友",
  username: "U002",
};

function panelWithCapabilities(capabilities: Department["capabilities"]) {
  return render(
    <DepartmentSettingsPanel
      department={{ ...DEPARTMENT, capabilities }}
      onClose={vi.fn<() => void>()}
    />
  );
}

function departmentHandlers(managers: DepartmentManager[] = []) {
  return [
    http.get("/api/v1/programs/departments/dept-1", () =>
      HttpResponse.json({
        requestId: "rid-detail",
        data: { department: DEPARTMENT, modules: MODULES },
      })
    ),
    http.get("/api/v1/programs/departments/dept-1/managers", () =>
      HttpResponse.json({ requestId: "rid-managers", data: { managers } })
    ),
    http.get(
      "/api/v1/programs/departments/dept-1/member-options",
      ({ request }) => {
        const query = new URL(request.url).searchParams.get("q");
        const userId = query === "ghost-user" ? "ghost-user" : "U003";
        return HttpResponse.json({
          requestId: "rid-members",
          data: {
            members: [{ user_id: userId, name: "測試會友", username: userId }],
          },
        });
      }
    ),
  ];
}

describe("department settings authorization UI", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  const user = userEvent.setup();

  test("manager-assign actor sees details, modules, and manager controls", async () => {
    server.use(...departmentHandlers([MANAGER_BOB]));
    panelWithCapabilities(MANAGER_CAPABILITIES);

    await screen.findByText(/U002/u);
    expect(
      screen.getByRole("textbox", { name: COPY.programs.deptName })
    ).toHaveValue(DEPARTMENT.name);
    expect(
      screen.getByRole("heading", { name: COPY.programs.modules })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.disable })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.enable })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.programs.revokeDepartmentManager,
      })
    ).toBeInTheDocument();
  });

  test("manager-only actor is confined to the manager list and picker", async () => {
    server.use(...departmentHandlers([]));
    panelWithCapabilities({ ...ONLY_MANAGER_ASSIGN_CAPABILITIES });

    await screen.findByText(COPY.programs.noDepartmentManagers);
    expect(
      screen.queryByRole("textbox", { name: COPY.programs.deptName })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: COPY.programs.modules })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.programs.assignDepartmentManager,
      })
    ).toBeInTheDocument();
  });

  test("assigning a manager through the member picker shows the success notice", async () => {
    const managers: DepartmentManager[] = [];
    server.use(
      ...departmentHandlers(managers),
      http.post(
        "/api/v1/programs/departments/dept-1/managers",
        async ({ request }) => {
          const body = (await request.json()) as { user_id: string };
          expect(body.user_id).toBe("U003");
          managers.push({
            ...MANAGER_BOB,
            user_id: "U003",
            user_name: "測試會友",
            username: "U003",
          });
          return HttpResponse.json({
            requestId: "rid-post",
            data: {
              manager: {
                ...MANAGER_BOB,
                user_id: "U003",
                user_name: "測試會友",
                username: "U003",
              },
            },
          });
        }
      )
    );
    panelWithCapabilities(MANAGER_CAPABILITIES);

    await screen.findByText(COPY.programs.noDepartmentManagers);
    await user.type(
      screen.getByRole("combobox", {
        name: COPY.programs.departmentManagerUserId,
      }),
      "U003"
    );
    await user.click(await screen.findByRole("button", { name: /U003/u }));
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.assignDepartmentManager,
      })
    );
    await expect(
      screen.findByText(COPY.programs.departmentManagerAssignedNotice)
    ).resolves.toBeInTheDocument();
    await expect(screen.findAllByText(/U003/u)).resolves.toHaveLength(2);
  });

  test("revoking a manager requires the confirm step and shows the success notice", async () => {
    const managers: DepartmentManager[] = [{ ...MANAGER_BOB }];
    server.use(
      ...departmentHandlers(managers),
      http.post(
        "/api/v1/programs/departments/dept-1/managers/U002/revoke",
        () => {
          managers.splice(0, 1);
          return HttpResponse.json({
            requestId: "rid-revoke",
            data: {
              manager: {
                ...MANAGER_BOB,
                revoked_at: "2026-08-06T00:00:00.000Z",
              },
            },
          });
        }
      )
    );
    panelWithCapabilities(MANAGER_CAPABILITIES);

    await screen.findByText(/U002/u);
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.revokeDepartmentManager,
      })
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmRevoke })
    );
    await expect(
      screen.findByText(COPY.programs.departmentManagerRevokedNotice)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.noDepartmentManagers)
    ).resolves.toBeInTheDocument();
  });

  test("assign failure surfaces the mapped error in an alert", async () => {
    server.use(
      ...departmentHandlers([]),
      http.post("/api/v1/programs/departments/dept-1/managers", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "conflicting manager change",
            code: "CONFLICT",
            requestId: "rid-conflict",
          },
          { status: 409 }
        )
      )
    );
    panelWithCapabilities(MANAGER_CAPABILITIES);

    await screen.findByText(COPY.programs.noDepartmentManagers);
    await user.type(
      screen.getByRole("combobox", {
        name: COPY.programs.departmentManagerUserId,
      }),
      "U003"
    );
    await user.click(await screen.findByRole("button", { name: /U003/u }));
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.assignDepartmentManager,
      })
    );
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.error.conflict
    );
  });

  test("load failure surfaces the mapped error in an alert", async () => {
    server.use(
      http.get("/api/v1/programs/departments/dept-1", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Not found",
            status: 404,
            detail: "missing",
            code: "NOT_FOUND",
            requestId: "rid-404",
          },
          { status: 404 }
        )
      ),
      http.get("/api/v1/programs/departments/dept-1/managers", () =>
        HttpResponse.json({ requestId: "rid-managers", data: { managers: [] } })
      )
    );
    panelWithCapabilities(MANAGER_CAPABILITIES);

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.error.notFound
    );
  });
});

describe("ManagementDirectory department launcher", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  test("renders department settings cards and expands the panel in place", async () => {
    server.use(
      http.get("/api/v1/programs/management-directory", () =>
        HttpResponse.json({
          requestId: "rid-dir",
          data: { departments: [DEPARTMENT], programs: [] },
        })
      ),
      ...departmentHandlers([])
    );
    const user = userEvent.setup();
    render(
      <ManagementDirectory
        onOpenProgram={vi.fn<(programId: string) => void>()}
      />
    );

    await waitFor(() =>
      expect(screen.getByText(DEPARTMENT.name)).toBeInTheDocument()
    );
    const card = screen.getByRole("button", {
      name: new RegExp(`${DEPARTMENT.name}`, "u"),
    });
    expect(card).toHaveTextContent(DEPARTMENT.code);
    await user.click(card);

    await expect(
      screen.findByRole("heading", {
        name: `${COPY.programs.departmentSettings}: ${DEPARTMENT.name}`,
      })
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.noDepartmentManagers)
    ).resolves.toBeInTheDocument();
    const panel = document.querySelector("#dept-1-settings-panel");
    expect(panel).not.toBeNull();
    await waitFor(() => expect(panel).toHaveFocus());
    await user.click(
      screen.getByRole("button", { name: COPY.programs.collapse })
    );
    const restoredCard = await screen.findByRole("button", {
      name: new RegExp(`${DEPARTMENT.name}`, "u"),
    });
    await waitFor(() => expect(restoredCard).toHaveFocus());
  });

  test("omits the department settings section without any department scope", async () => {
    server.use(
      http.get("/api/v1/programs/management-directory", () =>
        HttpResponse.json({
          requestId: "rid-dir",
          data: {
            departments: [
              {
                ...DEPARTMENT,
                capabilities: {
                  manage: false,
                  publish: false,
                  module_configure: false,
                },
              },
            ],
            programs: [],
          },
        })
      )
    );
    render(
      <ManagementDirectory
        onOpenProgram={vi.fn<(programId: string) => void>()}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: COPY.programs.managementDirectoryEmpty,
        })
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("heading", { name: COPY.programs.departmentSettings })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /青年事工/u })
    ).not.toBeInTheDocument();
  });
});
