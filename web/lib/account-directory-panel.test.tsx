import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { AccountDirectoryPanel } from "@/app/management/account-directory-panel";

import { COPY } from "./copy";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  router: {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    replace: vi.fn<(href: string) => void>(),
    push: vi.fn<(href: string) => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  rememberDeepLink: vi.fn<(path: string) => void>(),
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
  useSearchParams: () =>
    mocks.searchParams as unknown as ReadonlyURLSearchParams,
}));
vi.mock("@/lib/session", () => ({
  rememberDeepLink: mocks.rememberDeepLink,
}));

const server = setupServer();
const ACCOUNTS = COPY.accountDirectory;

interface AccountRow {
  userId: string;
  name: string;
  username: string;
  phone: string | null;
  role: "Admin" | "Staff" | "Member";
  status: "Pending" | "Active" | "Suspended" | "Deactivated";
  departments: { id: string; name: string }[];
}

const ROWS: AccountRow[] = [
  {
    userId: "AD-001",
    name: "陳大文",
    username: "dai.man.chan",
    phone: "9123 4567",
    role: "Staff",
    status: "Active",
    departments: [{ id: "dept-grow", name: "培育部" }],
  },
  {
    userId: "AD-002",
    name: "王大文",
    username: "dai.man.wong",
    phone: null,
    role: "Member",
    status: "Pending",
    departments: [],
  },
] as const;

function response(
  accounts: AccountRow[] = ROWS,
  nextCursor: string | null = null
) {
  return HttpResponse.json({
    requestId: "rid-account-directory",
    data: {
      accounts,
      nextCursor,
      summary: { total: accounts.length, active: 1, elevated: 1, pending: 1 },
    },
  });
}

describe(AccountDirectoryPanel, () => {
  beforeAll(() => {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
    HTMLElement.prototype.scrollIntoView = () => undefined;
    server.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    cleanup();
    server.resetHandlers();
    mocks.searchParams = new URLSearchParams();
    window.history.replaceState({}, "", "/");
    vi.clearAllMocks();
  });

  afterAll(() => server.close());

  test("renders selected B ledger rows, metrics, and read-only detail", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/programs/accounts", () => response()),
      http.get("/api/v1/programs/accounts/AD-001", () =>
        HttpResponse.json({
          requestId: "rid-account-detail",
          data: ROWS[0],
        })
      )
    );
    render(<AccountDirectoryPanel />);

    await user.type(screen.getByLabelText(ACCOUNTS.searchLabel), "大文");
    const row = await screen.findByRole("button", { name: /陳大文/u });
    expect(within(row).getByText(/同工/u)).toBeTruthy();
    expect(screen.getByText(String(ROWS.length))).toBeTruthy();
    await user.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toContain("account=AD-001");
    const accessLink = await screen.findByRole("button", {
      name: "查看帳戶權限與身份組",
    });
    await user.click(accessLink);
    expect(mocks.router.push).toHaveBeenCalledWith(
      expect.stringContaining("module=accounts&account=AD-001&view=access")
    );
  });

  test("opens with a populated Account page before search", async () => {
    let requestedUrl = "";
    server.use(
      http.get("/api/v1/programs/accounts", ({ request }) => {
        requestedUrl = request.url;
        return response();
      })
    );
    render(<AccountDirectoryPanel />);

    expect(await screen.findByRole("button", { name: /陳大文/u })).toBeTruthy();
    expect(new URL(requestedUrl).searchParams.get("q")).toBe("");
  });

  test("appends the next bounded page without replacing existing rows", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/programs/accounts", ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return cursor === "1"
          ? response(ROWS.slice(1), null)
          : response(ROWS.slice(0, 1), "1");
      })
    );
    render(<AccountDirectoryPanel />);

    expect(await screen.findByRole("button", { name: /陳大文/u })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "載入更多帳戶" }));
    expect(await screen.findByRole("button", { name: /王大文/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /陳大文/u })).toBeTruthy();
  });

  test("uses one compact phone filter sheet with an active count", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/programs/accounts", () => response()));
    render(<AccountDirectoryPanel />);
    await screen.findByRole("button", { name: /陳大文/u });

    await user.click(screen.getByRole("button", { name: "篩選" }));
    const sheet = screen.getByRole("dialog", { name: "篩選帳戶" });
    const roleSelect = within(sheet).getByRole("combobox", {
      name: ACCOUNTS.roleLabel,
    });
    await user.click(roleSelect);
    await user.click(
      await screen.findByRole("option", { name: ACCOUNTS.staff })
    );
    await user.click(within(sheet).getByRole("button", { name: "套用篩選" }));

    expect(screen.getByRole("button", { name: "篩選 1" })).toBeTruthy();
  });

  test("forwards role and status filters to the Account Directory seam", async () => {
    const user = userEvent.setup();
    let requestedUrl = "";
    server.use(
      http.get("/api/v1/programs/accounts", ({ request }) => {
        requestedUrl = request.url;
        return response(ROWS.slice(0, 1));
      })
    );
    render(<AccountDirectoryPanel />);
    await user.type(screen.getByLabelText(ACCOUNTS.searchLabel), "大文");
    await screen.findByRole("button", { name: /陳大文/u });
    const roleSelect = screen.getByRole("combobox", {
      name: ACCOUNTS.roleLabel,
    });
    await user.click(roleSelect);
    await user.click(
      await screen.findByRole("option", { name: ACCOUNTS.staff })
    );
    const statusSelect = screen.getByRole("combobox", {
      name: ACCOUNTS.statusLabel,
    });
    await user.click(statusSelect);
    await user.click(
      await screen.findByRole("option", {
        name: ACCOUNTS.active,
      })
    );
    await user.type(screen.getByLabelText(ACCOUNTS.departmentLabel), "培育部");
    expect(requestedUrl).toContain("role=Staff");
    expect(requestedUrl).toContain("status=Active");
    expect(requestedUrl).toContain("department=");
  });

  test("announces a no-match state for a filter-only search", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/programs/accounts", () => response([])));
    render(<AccountDirectoryPanel />);

    const roleSelect = screen.getByRole("combobox", {
      name: ACCOUNTS.roleLabel,
    });
    await user.click(roleSelect);
    await user.click(
      await screen.findByRole("option", { name: ACCOUNTS.staff })
    );
    expect(await screen.findByText(ACCOUNTS.noResults)).toBeTruthy();
  });

  test("loads a bookmarked Account Detail without a prior list search", async () => {
    mocks.searchParams = new URLSearchParams("module=accounts&account=AD-001");
    server.use(
      http.get("/api/v1/programs/accounts", () => response([])),
      http.get("/api/v1/programs/accounts/AD-001", () =>
        HttpResponse.json({
          requestId: "rid-account-detail",
          data: ROWS[0],
        })
      )
    );
    render(<AccountDirectoryPanel />);

    expect(
      await screen.findByRole("heading", { name: ROWS[0].name })
    ).toBeTruthy();
    expect(screen.getByText(ACCOUNTS.detailReadOnly)).toBeTruthy();
  });

  test("renders recoverable error and retry", async () => {
    const user = userEvent.setup();
    let failed = true;
    server.use(
      http.get("/api/v1/programs/accounts", () => {
        if (failed) {
          failed = false;
          return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
        }
        return response(ROWS.slice(0, 1));
      })
    );
    render(<AccountDirectoryPanel />);
    await expect(screen.findByText(ACCOUNTS.loadError)).resolves.toBeTruthy();
    await user.click(screen.getByRole("button", { name: ACCOUNTS.retry }));
    await expect(
      screen.findByRole("button", { name: /陳大文/u })
    ).resolves.toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: ACCOUNTS.resultsTitle })
    );
  });
  test("shows visible load-more recovery and retries without duplicate rows", async () => {
    const user = userEvent.setup();
    let failed = true;
    server.use(
      http.get("/api/v1/programs/accounts", ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (cursor === "1" && failed) {
          failed = false;
          return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
        }
        return cursor === "1"
          ? response(ROWS.slice(1), null)
          : response(ROWS.slice(0, 1), "1");
      })
    );
    render(<AccountDirectoryPanel />);

    await screen.findByRole("button", { name: /陳大文/u });
    await user.click(screen.getByRole("button", { name: "載入更多帳戶" }));
    expect(await screen.findByText(ACCOUNTS.loadError)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: ACCOUNTS.retry }));
    await screen.findByRole("button", { name: /王大文/u });
    expect(screen.getAllByRole("button", { name: /大文/u })).toHaveLength(2);
  });

  test("recovers an Account detail error through the selected detail slot", async () => {
    const user = userEvent.setup();
    let failed = true;
    mocks.searchParams = new URLSearchParams("module=accounts&account=AD-001");
    server.use(
      http.get("/api/v1/programs/accounts", () => response([])),
      http.get("/api/v1/programs/accounts/AD-001", () => {
        if (failed) {
          failed = false;
          return HttpResponse.json({ code: "NOT_FOUND" }, { status: 404 });
        }
        return HttpResponse.json({
          requestId: "rid-account-detail",
          data: ROWS[0],
        });
      })
    );
    render(<AccountDirectoryPanel />);

    expect(await screen.findByText(COPY.error.notFound)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: ACCOUNTS.retry }));
    expect(
      await screen.findByRole("heading", { name: ROWS[0].name })
    ).toBeInTheDocument();
  });

  test("clearing search preserves Account filters in the safe URL", async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams(
      "module=accounts&q=大文&role=Staff&status=Active&department=培育部"
    );
    window.history.replaceState(
      {},
      "",
      "/management?module=accounts&q=%E5%A4%A7%E6%96%87&role=Staff&status=Active&department=%E5%9F%B9%E8%82%B2%E9%83%A8"
    );
    server.use(http.get("/api/v1/programs/accounts", () => response()));
    render(<AccountDirectoryPanel />);

    const search = screen.getByLabelText(ACCOUNTS.searchLabel);
    await user.clear(search);
    const params = new URL(window.location.href).searchParams;
    expect(params.get("q")).toBeNull();
    expect(params.get("role")).toBe("Staff");
    expect(params.get("status")).toBe("Active");
    expect(params.get("department")).toBe("培育部");
  });

  test("restores a safe Account deep link and clears selection on same-origin Back", async () => {
    const deepLink =
      "/management?module=accounts&q=%E5%A4%A7%E6%96%87&role=Staff&account=AD-001&return=%2Fmanagement%3Fmodule%3Dsettings";
    mocks.searchParams = new URLSearchParams(
      "module=accounts&q=大文&role=Staff&account=AD-001&return=%2Fmanagement%3Fmodule%3Dsettings"
    );
    window.history.replaceState({}, "", deepLink);
    server.use(
      http.get("/api/v1/programs/accounts", () => response()),
      http.get("/api/v1/programs/accounts/AD-001", () =>
        HttpResponse.json({
          requestId: "rid-account-detail",
          data: ROWS[0],
        })
      )
    );
    render(<AccountDirectoryPanel />);

    expect(screen.getByLabelText(ACCOUNTS.searchLabel)).toHaveValue("大文");
    expect(screen.getByRole("link", { name: ACCOUNTS.back })).toHaveAttribute(
      "href",
      "/management?module=settings"
    );
    expect(
      await screen.findByRole("heading", { name: ROWS[0].name })
    ).toBeInTheDocument();

    window.history.replaceState(
      {},
      "",
      "/management?module=accounts&q=%E5%A4%A7%E6%96%87&role=Staff"
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: ROWS[0].name })).toBeNull()
    );
  });

  test("appends 200-plus Account rows through bounded pages", async () => {
    const user = userEvent.setup();
    const pageSize = 50;
    const manyRows = Array.from({ length: 201 }, (_, index) => ({
      ...ROWS[index % ROWS.length]!,
      userId: `AD-${String(index + 1).padStart(3, "0")}`,
      name: `帳戶 ${String(index + 1).padStart(3, "0")}`,
    }));
    server.use(
      http.get("/api/v1/programs/accounts", ({ request }) => {
        const start = Number(
          new URL(request.url).searchParams.get("cursor") ?? "0"
        );
        const page = manyRows.slice(start, start + pageSize);
        const nextCursor =
          start + pageSize < manyRows.length ? String(start + pageSize) : null;
        return response(page, nextCursor);
      })
    );
    render(<AccountDirectoryPanel />);

    await screen.findByRole("button", { name: /帳戶 001/u });
    for (let start = pageSize; start < manyRows.length; start += pageSize) {
      await user.click(screen.getByRole("button", { name: "載入更多帳戶" }));
      await screen.findByRole("button", {
        name: new RegExp(
          `帳戶 ${String(Math.min(start + pageSize, manyRows.length)).padStart(3, "0")}`,
          "u"
        ),
      });
    }
    expect(screen.getAllByRole("button", { name: /帳戶 \d{3}/u })).toHaveLength(
      manyRows.length
    );
    expect(screen.queryByRole("button", { name: "載入更多帳戶" })).toBeNull();
  });
  test("hands an AUTH_REQUIRED list load back through the deep-link seam", async () => {
    mocks.searchParams = new URLSearchParams(
      "module=accounts&q=%E5%A4%A7%E6%96%87"
    );
    window.history.replaceState(
      {},
      "",
      "/management?module=accounts&q=%E5%A4%A7%E6%96%87"
    );
    server.use(
      http.get("/api/v1/programs/accounts", () =>
        HttpResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 })
      )
    );
    render(<AccountDirectoryPanel />);

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/"));
    expect(mocks.rememberDeepLink).toHaveBeenCalledWith(
      "/management?module=accounts&q=%E5%A4%A7%E6%96%87"
    );
  });

  test("hands an AUTH_REQUIRED detail load back through the deep-link seam", async () => {
    mocks.searchParams = new URLSearchParams("module=accounts&account=AD-001");
    window.history.replaceState(
      {},
      "",
      "/management?module=accounts&account=AD-001"
    );
    server.use(
      http.get("/api/v1/programs/accounts", () => response([])),
      http.get("/api/v1/programs/accounts/AD-001", () =>
        HttpResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 })
      )
    );
    render(<AccountDirectoryPanel />);

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/"));
    expect(mocks.rememberDeepLink).toHaveBeenCalledWith(
      "/management?module=accounts&account=AD-001"
    );
  });
});
