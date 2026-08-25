import { cleanup, render, screen, within } from "@testing-library/react";
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
  router: {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    replace: vi.fn<(href: string) => void>(),
    push: vi.fn<(href: string) => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
  useSearchParams: () =>
    new URLSearchParams() as unknown as ReadonlyURLSearchParams,
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

function response(accounts: AccountRow[] = ROWS) {
  return HttpResponse.json({
    requestId: "rid-account-directory",
    data: {
      accounts,
      summary: { total: accounts.length, active: 1, elevated: 1, pending: 1 },
    },
  });
}

describe(AccountDirectoryPanel, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
    vi.clearAllMocks();
  });

  afterAll(() => server.close());

  test("renders selected B ledger rows, metrics, and read-only detail", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/programs/accounts", () => response()));
    render(<AccountDirectoryPanel />);

    await user.type(screen.getByLabelText(ACCOUNTS.searchLabel), "大文");
    const row = await screen.findByRole("button", { name: /陳大文/u });
    expect(within(row).getByText(/同工/u)).toBeTruthy();
    expect(screen.getByText(String(ROWS.length))).toBeTruthy();
    await user.click(row);
    expect(mocks.router.replace).toHaveBeenCalledWith(
      expect.stringContaining("account=AD-001")
    );
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
    await user.selectOptions(
      screen.getByLabelText(ACCOUNTS.roleLabel),
      "Staff"
    );
    await user.selectOptions(
      screen.getByLabelText(ACCOUNTS.statusLabel),
      "Active"
    );
    expect(requestedUrl).toContain("role=Staff");
    expect(requestedUrl).toContain("status=Active");
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
    await user.type(screen.getByLabelText(ACCOUNTS.searchLabel), "陳大");
    await expect(screen.findByText(ACCOUNTS.loadError)).resolves.toBeTruthy();
    await user.click(screen.getByRole("button", { name: ACCOUNTS.retry }));
    await expect(
      screen.findByRole("button", { name: /陳大文/u })
    ).resolves.toBeTruthy();
  });
});
