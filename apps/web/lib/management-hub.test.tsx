import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ManagementHub } from "@/app/management/management-hub";
import ManagementPage from "@/app/management/page";
import { RpcError } from "@/lib/api";
import type { Bootstrap, PublicUser } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { projectSections, projectNavigation } from "@/lib/sections";

// Hub wire contract (087-01, locked): GET /api/v1/programs/hub returns
// { requestId, data: { groups, entryCard } }; getManagementHub() unwraps to
// { groups, entryCard }. Groups are server-projected in the fixed prototype
// order; the client renders exactly what the server returns — never a
// client-side capability branch — so capability omission is asserted by
// fixture shape here and by authorization in the worker tests.
const mocks = vi.hoisted(() => {
  const pushMock = vi.fn();
  const replaceMock = vi.fn();
  const pathnameMock = vi.fn(() => "/management");
  return {
    getManagementHub: vi.fn(),
    pushMock,
    replaceMock,
    pathnameMock,
    mockRouter: {
      push: pushMock,
      replace: replaceMock,
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    },
  };
});

const { getManagementHub, pathnameMock, mockRouter } = mocks;

vi.mock(import("@/lib/programs/program-api"), () => ({
  getManagementHub: mocks.getManagementHub,
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.mockRouter,
  usePathname: () => mocks.pathnameMock(),
  useSearchParams: () =>
    new URLSearchParams() as unknown as ReadonlyURLSearchParams,
}));

const sessionMocks = vi.hoisted(() => ({
  clearAuthHintMock: vi.fn<() => void>(),
  setAuthHintMock: vi.fn<() => void>(),
  hasAuthHintMock: vi.fn<() => boolean>(),
  restoreBootstrapMock: vi.fn<() => Promise<Bootstrap>>(),
  rememberDeepLinkMock: vi.fn<(target: string) => void>(),
}));

vi.mock("@/lib/session", () => ({
  clearAuthHint: sessionMocks.clearAuthHintMock,
  setAuthHint: sessionMocks.setAuthHintMock,
  hasAuthHint: sessionMocks.hasAuthHintMock,
  restoreBootstrap: sessionMocks.restoreBootstrapMock,
  clearDeepLink: vi.fn(),
  rememberDeepLink: sessionMocks.rememberDeepLinkMock,
}));

interface HubRow {
  key: string;
  label: string;
  description: string;
  href: string;
}
interface HubGroup {
  key: string;
  label: string;
  rows: HubRow[];
}
interface HubEntryCard {
  key: string;
  label: string;
  description: string;
  href: string;
}
interface HubData {
  groups: HubGroup[];
  entryCard: HubEntryCard | null;
}

const row = (
  key: string,
  label: string,
  description: string,
  href: string
): HubRow => ({
  key,
  label,
  description,
  href,
});

// Full Admin projection: three groups in the locked order, six rows, and the
// course-management entry card. Labels/descriptions mirror the prototype
// verbatim (COPY.management is the single source for both sides).
const ADMIN_HUB: HubData = {
  groups: [
    {
      key: "members-and-permissions",
      label: COPY.management.groupMemberPermissions,
      rows: [
        row(
          "approvals",
          COPY.management.approvalsRow,
          COPY.management.approvalsRowHint,
          "/management?module=approvals"
        ),
        row(
          "permissions",
          COPY.management.permissionsRow,
          COPY.management.permissionsRowHint,
          "/management?module=permissions"
        ),
      ],
    },
    {
      key: "ministry-operations",
      label: COPY.management.groupOperations,
      rows: [
        row(
          "departments",
          COPY.management.departmentsRow,
          COPY.management.departmentsRowHint,
          "/management?module=departments"
        ),
        row(
          "attendance",
          COPY.management.attendanceRow,
          COPY.management.attendanceRowHint,
          "/management?module=attendance"
        ),
        row(
          "members",
          COPY.management.membersRow,
          COPY.management.membersRowHint,
          "/management?module=members"
        ),
      ],
    },
    {
      key: "content-and-system",
      label: COPY.management.groupContentSystem,
      rows: [
        row(
          "home-content",
          COPY.management.homeContentRow,
          COPY.management.homeContentRowHint,
          "/management?module=home-content"
        ),
      ],
    },
  ],
  entryCard: {
    key: "course-management",
    label: COPY.management.goCourseManagement,
    description: COPY.management.goCourseManagementHint,
    href: "/programs?mode=management",
  },
};

// Narrow projection: a department-scoped manager without home.publish sees
// only the ministry-operations group with its departments row; every other
// group/row is omitted entirely (never shown disabled).
const NARROW_HUB: HubData = {
  groups: [
    {
      key: "ministry-operations",
      label: COPY.management.groupOperations,
      rows: [
        row(
          "departments",
          COPY.management.departmentsRow,
          COPY.management.departmentsRowHint,
          "/management?module=departments"
        ),
      ],
    },
  ],
  entryCard: {
    key: "course-management",
    label: COPY.management.goCourseManagement,
    description: COPY.management.goCourseManagementHint,
    href: "/programs?mode=management",
  },
};

const EMPTY_HUB: HubData = { groups: [], entryCard: null };
const ENTRY_ONLY_HUB: HubData = { groups: [], entryCard: NARROW_HUB.entryCard };

const ALL_ROWS: HubRow[] = ADMIN_HUB.groups.flatMap((group) => group.rows);

const STAFF_PROFILE: PublicUser = {
  userId: "u-staff-201",
  name: "陳同工",
  username: "staff.demo",
  phone: "92345678",
  identities: [],
  capabilities: {},
  status: "Active",
  qrCodeString: "qr:u-staff-201",
};

const STAFF_BOOTSTRAP: Bootstrap = {
  profile: STAFF_PROFILE,
  sections: projectSections({ "program.manage": true }),
  navigation: projectNavigation({ "program.manage": true }),
};

const MEMBER_PROFILE: PublicUser = {
  userId: "u-member-101",
  name: "陳小明",
  username: "member.demo",
  phone: "91234567",
  identities: [],
  capabilities: {},
  status: "Active",
  qrCodeString: "qr:u-member-101",
};

const MEMBER_BOOTSTRAP: Bootstrap = {
  profile: MEMBER_PROFILE,
  sections: projectSections({ "program.enroll": true }),
  navigation: projectNavigation({ "program.enroll": true }),
};

beforeEach(() => {
  getManagementHub.mockReset();
  sessionMocks.hasAuthHintMock.mockReset();
  sessionMocks.restoreBootstrapMock.mockReset();
  sessionMocks.rememberDeepLinkMock.mockReset();
  mocks.pushMock.mockReset();
  mocks.replaceMock.mockReset();
  pathnameMock.mockReset();
  pathnameMock.mockReturnValue("/management");
  window.history.replaceState(null, "", "/management");
});

afterEach(() => {
  cleanup();
});

describe("ManagementHub component", () => {
  test("renders h1, lead, and the three groups in the fixed prototype order", async () => {
    getManagementHub.mockResolvedValue(ADMIN_HUB);
    render(<ManagementHub />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: COPY.management.groupMemberPermissions,
        })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: COPY.management.managementTitle,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.management.managementLead)
    ).toBeInTheDocument();

    const groupHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(groupHeadings).toEqual([
      COPY.management.groupMemberPermissions,
      COPY.management.groupOperations,
      COPY.management.groupContentSystem,
    ]);
  });

  test("every row renders both its label and its short description", async () => {
    getManagementHub.mockResolvedValue(ADMIN_HUB);
    render(<ManagementHub />);

    await waitFor(() => {
      expect(
        screen.getByText(COPY.management.approvalsRow)
      ).toBeInTheDocument();
    });

    for (const [label, description] of ALL_ROWS.map((r) => [
      r.label,
      r.description,
    ])) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
    }
  });

  test("each row link carries its canonical hub URL", async () => {
    getManagementHub.mockResolvedValue(ADMIN_HUB);
    render(<ManagementHub />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /註冊審批/u })
      ).toBeInTheDocument();
    });

    for (const row of ALL_ROWS) {
      const link = screen.getByRole("link", {
        name: new RegExp(row.label, "u"),
      });
      expect(link).toHaveAttribute("href", row.href);
    }
  });

  test("the another-entry card renders between operations and content with the course-management href", async () => {
    getManagementHub.mockResolvedValue(ADMIN_HUB);
    render(<ManagementHub />);

    await waitFor(() => {
      expect(
        screen.getByText(COPY.management.anotherEntry)
      ).toBeInTheDocument();
    });

    const cardLabel = screen.getByRole("link", {
      name: new RegExp(COPY.management.goCourseManagement, "u"),
    });
    expect(cardLabel).toHaveAttribute("href", "/programs?mode=management");
    expect(
      screen.getByText(COPY.management.goCourseManagementHint)
    ).toBeInTheDocument();

    // Prototype placement: between 事工營運 and 內容與系統.
    const operations = screen.getByRole("heading", {
      level: 2,
      name: COPY.management.groupOperations,
    });
    const card = screen.getByText(COPY.management.anotherEntry);
    const content = screen.getByRole("heading", {
      level: 2,
      name: COPY.management.groupContentSystem,
    });
    expect(operations.compareDocumentPosition(card)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(card.compareDocumentPosition(content)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  test("narrow capability projection omits ungranted rows and groups entirely", async () => {
    getManagementHub.mockResolvedValue(NARROW_HUB);
    render(<ManagementHub />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: COPY.management.groupOperations,
        })
      ).toBeInTheDocument();
    });

    // The granted row renders with its description.
    expect(screen.getByRole("link", { name: /部門設定/u })).toBeInTheDocument();
    expect(
      screen.getByText(COPY.management.departmentsRowHint)
    ).toBeInTheDocument();

    // Every ungranted group heading and row is absent — never shown disabled.
    for (const absent of [
      COPY.management.groupMemberPermissions,
      COPY.management.groupContentSystem,
      COPY.management.approvalsRow,
      COPY.management.approvalsRowHint,
      COPY.management.permissionsRow,
      COPY.management.permissionsRowHint,
      COPY.management.attendanceRow,
      COPY.management.attendanceRowHint,
      COPY.management.membersRow,
      COPY.management.membersRowHint,
      COPY.management.homeContentRow,
      COPY.management.homeContentRowHint,
    ]) {
      expect(screen.queryByText(absent)).not.toBeInTheDocument();
    }
  });

  test("empty projection renders the empty state instead of groups", async () => {
    getManagementHub.mockResolvedValue(EMPTY_HUB);
    render(<ManagementHub />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    expect(screen.getByText(COPY.management.emptyTitle)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: COPY.management.backHome })
    ).toHaveAttribute("href", "/");
    // No group section renders for the empty projection (the empty-title h2
    // is the only level-2 heading).
    for (const group of [
      COPY.management.groupMemberPermissions,
      COPY.management.groupOperations,
      COPY.management.groupContentSystem,
    ]) {
      expect(
        screen.queryByRole("heading", { level: 2, name: group })
      ).not.toBeInTheDocument();
    }
  });

  test("entry-card-only projection remains discoverable", async () => {
    getManagementHub.mockResolvedValue(ENTRY_ONLY_HUB);
    render(<ManagementHub />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", {
          name: new RegExp(COPY.management.goCourseManagement, "u"),
        })
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("shows a busy loading region while the projection is pending", () => {
    getManagementHub.mockReturnValue(new Promise<HubData>(() => {}));
    render(<ManagementHub />);

    expect(screen.getByText(COPY.management.loading)).toBeInTheDocument();
  });

  test("a failed projection surfaces an alert with a retry action", async () => {
    getManagementHub.mockRejectedValue(new Error("hub unavailable"));
    render(<ManagementHub />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(COPY.management.loadError)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.management.retry })
    ).toBeInTheDocument();
  });

  test("unauthenticated response remembers deep link and redirects to root without rendering alert", async () => {
    getManagementHub.mockRejectedValue(
      new RpcError({
        code: "AUTH_REQUIRED",
        status: 401,
        title: "Unauthorized",
      })
    );
    render(<ManagementHub />);

    await waitFor(() => {
      expect(sessionMocks.rememberDeepLinkMock).toHaveBeenCalledWith(
        "/management"
      );
    });

    expect(mocks.replaceMock).toHaveBeenCalledWith("/");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("a forbidden projection surfaces the forbidden alert with retry action", async () => {
    getManagementHub.mockRejectedValue(
      new RpcError({
        code: "FORBIDDEN",
        status: 403,
        title: "Forbidden",
      })
    );
    render(<ManagementHub />);

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: COPY.management.forbidden,
      })
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent(COPY.error.forbidden);
    expect(
      screen.getByRole("button", { name: COPY.management.retry })
    ).toBeInTheDocument();
  });

  test("recovering from error via retry button re-fetches hub and renders ready state", async () => {
    getManagementHub
      .mockRejectedValueOnce(new Error("hub network failure"))
      .mockResolvedValueOnce(ADMIN_HUB);

    render(<ManagementHub />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    const retryButton = screen.getByRole("button", {
      name: COPY.management.retry,
    });
    retryButton.click();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: COPY.management.groupMemberPermissions,
        })
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getManagementHub).toHaveBeenCalledTimes(2);
  });

  test("renders groups and entry card in a responsive grid with 1-column mobile and 2-column desktop composition", async () => {
    getManagementHub.mockResolvedValue(ADMIN_HUB);
    const { container } = render(<ManagementHub />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: COPY.management.groupMemberPermissions,
        })
      ).toBeInTheDocument();
    });

    const grid =
      container.querySelector('[data-slot="management-hub-grid"]') ||
      container.querySelector(".grid.grid-cols-1");
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("grid-cols-1");
    expect(grid?.className).toContain("lg:grid-cols-2");
  });

  test("no Care row renders for any fixture (spec 084 regression)", async () => {
    for (const fixture of [ADMIN_HUB, NARROW_HUB, EMPTY_HUB]) {
      getManagementHub.mockResolvedValue(fixture);
      render(<ManagementHub />);

      if (fixture.groups.length > 0) {
        await waitFor(() => {
          expect(
            screen.getAllByRole("heading", { level: 2 }).length
          ).toBeGreaterThan(0);
        });
      } else {
        await waitFor(() => {
          expect(screen.getByRole("status")).toBeInTheDocument();
        });
      }

      expect(screen.queryByText(/Care/iu)).not.toBeInTheDocument();
      expect(screen.queryByText("關懷")).not.toBeInTheDocument();
      cleanup();
    }
  });
});

describe("ManagementPage page export", () => {
  test("renders the hub for a management-capable bootstrap", async () => {
    getManagementHub.mockResolvedValue(ADMIN_HUB);
    sessionMocks.hasAuthHintMock.mockReturnValue(true);
    sessionMocks.restoreBootstrapMock.mockResolvedValue(STAFF_BOOTSTRAP);

    render(<ManagementPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: COPY.management.groupMemberPermissions,
        })
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: COPY.management.managementTitle })
    ).toBeInTheDocument();
    expect(getManagementHub).toHaveBeenCalledTimes(1);
  });

  test("keeps the management section gate for a Member and never fetches the hub", async () => {
    getManagementHub.mockResolvedValue(ADMIN_HUB);
    sessionMocks.hasAuthHintMock.mockReturnValue(true);
    sessionMocks.restoreBootstrapMock.mockResolvedValue(MEMBER_BOOTSTRAP);

    render(<ManagementPage />);

    await waitFor(() => {
      expect(screen.getByText(COPY.error.forbidden)).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("heading", { name: COPY.management.managementTitle })
    ).not.toBeInTheDocument();
    expect(getManagementHub).not.toHaveBeenCalled();
  });
});
