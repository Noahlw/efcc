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
import { DepartmentManagerPicker } from "@/lib/programs/department-manager-picker";
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

function panelWithCapabilities(
  capabilities: Department["capabilities"],
  onOpenManagerPicker = vi.fn<() => void>()
) {
  return render(
    <DepartmentSettingsPanel
      department={{ ...DEPARTMENT, capabilities }}
      onClose={vi.fn<() => void>()}
      onOpenManagerPicker={onOpenManagerPicker}
    />
  );
}

function pickerWithCapabilities(
  capabilities: Department["capabilities"],
  onBack = vi.fn<() => void>()
) {
  return render(
    <DepartmentManagerPicker
      department={{ ...DEPARTMENT, capabilities }}
      onBack={onBack}
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

  test("manager-assign actor sees details and a read-only manager list", async () => {
    const onOpenManagerPicker = vi.fn<() => void>();
    server.use(...departmentHandlers([MANAGER_BOB]));
    panelWithCapabilities(MANAGER_CAPABILITIES, onOpenManagerPicker);

    await screen.findByText(/U002/u);
    expect(
      screen.getByRole("textbox", { name: COPY.programs.deptName })
    ).toHaveValue(DEPARTMENT.name);
    expect(
      screen.getByRole("heading", { name: COPY.programs.modules })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.departmentManagers })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.assignDepartmentManager,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.revokeDepartmentManager,
      })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.departmentManagers })
    );
    expect(onOpenManagerPicker).toHaveBeenCalledOnce();
  });

  test("manager-only actor is confined to the manager list and picker entry", async () => {
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
      screen.getByRole("button", { name: COPY.programs.departmentManagers })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.assignDepartmentManager,
      })
    ).not.toBeInTheDocument();
  });

  test("assigning a manager through the routable picker shows notice and updates list", async () => {
    const managers: DepartmentManager[] = [];
    const onBack = vi.fn<() => void>();
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
            data: { manager: managers[0] },
          });
        }
      )
    );
    pickerWithCapabilities(MANAGER_CAPABILITIES, onBack);

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
    await expect(
      screen.findByRole("button", {
        name: COPY.programs.revokeDepartmentManager,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: COPY.programs.departmentManagers })
    ).toHaveTextContent(/測試會友/u);
    expect(managers).toHaveLength(1);
  });

  test("revoking a manager through the routable picker shows notice and updates list", async () => {
    const managers: DepartmentManager[] = [{ ...MANAGER_BOB }];
    const onBack = vi.fn<() => void>();
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
    pickerWithCapabilities(MANAGER_CAPABILITIES, onBack);

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
    expect(managers).toHaveLength(0);
  });

  test("picker assign failure surfaces the mapped error in an alert", async () => {
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
    pickerWithCapabilities(MANAGER_CAPABILITIES);

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

  test("routes Department Detail and the manager picker as separate views", async () => {
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
    let departmentId: string | null = null;
    let departmentView: "managers" | null = null;
    const onOpenDepartment = vi.fn<(nextDepartmentId: string) => void>(
      (nextDepartmentId: string) => {
        departmentId = nextDepartmentId;
      }
    );
    const onOpenDepartmentManagers = vi.fn<(nextDepartmentId: string) => void>(
      (nextDepartmentId: string) => {
        departmentId = nextDepartmentId;
        departmentView = "managers";
      }
    );
    const onBackToDirectory = vi.fn<() => void>(() => {
      departmentId = null;
      departmentView = null;
    });
    const view = render(
      <ManagementDirectory
        onOpenProgram={vi.fn<(programId: string) => void>()}
        departmentId={departmentId}
        departmentView={departmentView}
        onOpenDepartment={onOpenDepartment}
        onOpenDepartmentManagers={onOpenDepartmentManagers}
        onBackToDirectory={onBackToDirectory}
      />
    );

    await waitFor(() =>
      expect(screen.getByText(DEPARTMENT.name)).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`${DEPARTMENT.name}`, "u"),
      })
    );
    expect(onOpenDepartment).toHaveBeenCalledWith(DEPARTMENT_ID);
    view.rerender(
      <ManagementDirectory
        onOpenProgram={vi.fn<(programId: string) => void>()}
        departmentId={departmentId}
        departmentView={departmentView}
        onOpenDepartment={onOpenDepartment}
        onOpenDepartmentManagers={onOpenDepartmentManagers}
        onBackToDirectory={onBackToDirectory}
      />
    );

    await expect(
      screen.findByRole("heading", {
        name: `${COPY.programs.departmentSettings}: ${DEPARTMENT.name}`,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.assignDepartmentManager,
      })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.departmentManagers })
    );
    expect(onOpenDepartmentManagers).toHaveBeenCalledWith(DEPARTMENT_ID);
    view.rerender(
      <ManagementDirectory
        onOpenProgram={vi.fn<(programId: string) => void>()}
        departmentId={departmentId}
        departmentView={departmentView}
        onOpenDepartment={onOpenDepartment}
        onOpenDepartmentManagers={onOpenDepartmentManagers}
        onBackToDirectory={onBackToDirectory}
      />
    );
    await expect(
      screen.findByRole("heading", {
        name: `${COPY.programs.departmentManagers}: ${DEPARTMENT.name}`,
      })
    ).resolves.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.departmentSettings })
    );
    expect(onOpenDepartment).toHaveBeenLastCalledWith(DEPARTMENT_ID);
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
