import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
// 087-04 (#321) — component tests for the Member Directory panel
// (Spec 087 US 13-15). MSW intercepts GET /api/v1/programs/members at the
// same seam as the directory's public Worker endpoint. Covers: live search renders
// results; selecting a result shows the member detail (contact, role,
// department memberships) inline with no separate commit step; and the
// empty / loading / server-error (retry re-fetches) / forbidden states.
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

import { MemberDirectoryPanel } from "@/app/management/member-directory-panel";

import { COPY } from "./copy";

const mocks = vi.hoisted(() => {
  const router = {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<() => void>(),
    replace: vi.fn<(href: string) => void>(),
    prefetch: vi.fn<() => void>(),
  };
  return { router, rememberDeepLink: vi.fn<(path: string) => void>() };
});

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
}));
vi.mock("@/lib/session", () => ({
  rememberDeepLink: mocks.rememberDeepLink,
}));

const server = setupServer();

const MEMBERS = COPY.managementMembers;

// Wire contract: GET /api/v1/programs/members -> data.members of
// { userId, name, phone: string|null, identities, status, departments }.
interface MemberRow {
  userId: string;
  name: string;
  phone: string | null;
  identities?: Array<{
    id: string;
    label: string;
    scopeKind: "Global" | "Department" | "Program";
    scopeId: string | null;
  }>;
  status: string;
  departments: Array<{ id: string; name: string }>;
}

const MEMBER_ROWS: MemberRow[] = [
  {
    userId: "U-DIR-DANA",
    name: "陳大文",
    phone: "9123 4567",
    identities: [
      { id: "id-dana", label: "會友基礎", scopeKind: "Global", scopeId: null },
    ],
    status: "Active",
    departments: [
      { id: "dept-grow", name: "培育部" },
      { id: "dept-worship", name: "崇拜部" },
    ],
  },
  {
    userId: "U-DIR-EVAN",
    name: "王大文",
    phone: null,
    identities: [
      {
        id: "id-evan",
        label: "青年部同工",
        scopeKind: "Department",
        scopeId: "dept-worship",
      },
    ],
    status: "Active",
    departments: [{ id: "dept-worship", name: "崇拜部" }],
  },
  {
    userId: "U-DIR-FAY",
    name: "李秀蘭",
    phone: "7777 8888",
    identities: [
      { id: "id-fay", label: "會友基礎", scopeKind: "Global", scopeId: null },
    ],
    status: "Active",
    departments: [],
  },
];

function membersResponse(members: MemberRow[]) {
  return HttpResponse.json({
    requestId: "rid-member-directory",
    data: { members },
  });
}

function problemResponse(status: number, code: string, detail: string) {
  return HttpResponse.json(
    { type: "about:blank", title: detail, status, detail, code },
    { status }
  );
}

/** Live-search handler: filters fixtures by name or phone, like the Worker. */
function liveSearchHandler() {
  return http.get("/api/v1/programs/members", ({ request }) => {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const matched = MEMBER_ROWS.filter(
      (member) => member.name.includes(query) || member.phone?.includes(query)
    );
    return membersResponse(matched);
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});
afterAll(() => server.close());

describe("MemberDirectoryPanel", () => {
  test("typing in the search field renders matching results without a submit step", async () => {
    const user = userEvent.setup();
    server.use(liveSearchHandler());
    render(<MemberDirectoryPanel />);

    const search = screen.getByLabelText(MEMBERS.searchLabel);
    await user.type(search, "大文");

    // Results render as buttons carrying normalized identity labels and
    // department summaries.
    const danaRow = await screen.findByRole("button", { name: /陳大文/ });
    expect(within(danaRow).getByText(/會友基礎/)).toBeTruthy();
    expect(within(danaRow).getByText(/培育部/)).toBeTruthy();
    const evanRow = screen.getByRole("button", { name: /王大文/ });
    expect(within(evanRow).getByText(/青年部同工/)).toBeTruthy();
    expect(within(evanRow).getByText(/崇拜部/)).toBeTruthy();
    // No submit control exists — search is live on input.
    expect(screen.queryByRole("button", { name: /搜尋$/ })).toBeNull();
  });

  test("suppresses network search until two trimmed characters are present", async () => {
    const user = userEvent.setup();
    let requests = 0;
    server.use(
      http.get("/api/v1/programs/members", () => {
        requests += 1;
        return membersResponse([]);
      })
    );
    render(<MemberDirectoryPanel />);

    const search = screen.getByLabelText(MEMBERS.searchLabel);
    await user.type(search, "陳");
    expect(requests).toBe(0);
    await user.type(search, "大");
    await waitFor(() => expect(requests).toBeGreaterThan(0));
  });

  test("selecting a result shows the member detail inline — no separate commit step", async () => {
    const user = userEvent.setup();
    server.use(liveSearchHandler());
    render(<MemberDirectoryPanel />);

    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "陳大");
    const danaRow = await screen.findByRole("button", { name: /陳大文/ });
    await user.click(danaRow);

    // Inline detail: heading + contact / role / department memberships.
    const detail = await screen.findByRole("heading", {
      name: MEMBERS.memberDetail,
    });
    const detailRoot = detail.closest("section") ?? detail.parentElement;
    const detailCard = detail.closest("article");
    expect(detailRoot).not.toBeNull();
    expect(detailCard).not.toBeNull();
    if (detailRoot === null || detailCard === null) return;
    const detailView = within(detailRoot as HTMLElement);
    expect(detailView.getByText(MEMBERS.memberContact)).toBeTruthy();
    expect(detailView.getByText("9123 4567")).toBeTruthy();
    expect(detailView.getByText("身份組")).toBeTruthy();
    expect(detailView.getByText("會友基礎")).toBeTruthy();
    expect(detailView.getByText(MEMBERS.memberDepartments)).toBeTruthy();
    expect(detailView.getByText("培育部")).toBeTruthy();
    expect(detailView.getByText("崇拜部")).toBeTruthy();
    expect(danaRow).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(detailCard).toHaveFocus());
    // No commit step: no save/confirm/submit control, and no navigation.
    expect(screen.queryByRole("button", { name: /儲存|確認|提交/ })).toBeNull();
    expect(mocks.router.push).not.toHaveBeenCalled();
    // The directory search stays on the same surface (inline, not a screen).
    expect(screen.getByLabelText(MEMBERS.searchLabel)).toBeTruthy();
  });

  test("a member without enrollments shows the no-departments placeholder", async () => {
    const user = userEvent.setup();
    server.use(liveSearchHandler());
    render(<MemberDirectoryPanel />);

    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "李秀蘭");
    const fayRow = await screen.findByRole("button", { name: /李秀蘭/ });
    await user.click(fayRow);

    const detail = await screen.findByRole("heading", {
      name: MEMBERS.memberDetail,
    });
    const detailRoot = detail.closest("section") ?? detail.parentElement;
    expect(detailRoot).not.toBeNull();
    if (detailRoot === null) return;
    expect(
      within(detailRoot as HTMLElement).getByText(MEMBERS.noDepartments)
    ).toBeTruthy();
  });

  test("an empty result set renders the no-results state", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/programs/members", () => membersResponse([])));
    render(<MemberDirectoryPanel />);

    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "無人");
    expect(await screen.findByText(MEMBERS.noResults)).toBeTruthy();
    expect(screen.getByText(MEMBERS.emptyHint)).toBeTruthy();
  });

  test("the search region is marked busy while a request is pending", async () => {
    const user = userEvent.setup();
    let resolvePending: ((response: Response) => void) | undefined;
    server.use(
      http.get(
        "/api/v1/programs/members",
        () =>
          new Promise<Response>((resolve) => {
            resolvePending = resolve;
          })
      )
    );
    const { container } = render(<MemberDirectoryPanel />);

    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "陳大");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolvePending?.(membersResponse([MEMBER_ROWS[0]!]).clone());
    expect(await screen.findByRole("button", { name: /陳大文/ })).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  test("a failed search shows the error state and retry re-fetches", async () => {
    const user = userEvent.setup();
    let retried = false;
    server.use(
      http.get("/api/v1/programs/members", () => {
        if (retried) {
          return membersResponse([MEMBER_ROWS[1]!]);
        }
        return problemResponse(500, "INTERNAL", "Internal Server Error");
      })
    );
    render(<MemberDirectoryPanel />);

    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "王大文");
    expect(await screen.findByText(MEMBERS.loadError)).toBeTruthy();

    retried = true;
    await user.click(screen.getByRole("button", { name: MEMBERS.retry }));
    expect(await screen.findByRole("button", { name: /王大文/ })).toBeTruthy();
    expect(screen.queryByText(MEMBERS.loadError)).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: MEMBERS.membersTitle,
        })
      ).toHaveFocus()
    );
  });

  test("a server-shaped forbidden response renders the forbidden state", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/programs/members", () =>
        problemResponse(403, "FORBIDDEN", "Forbidden")
      )
    );
    render(<MemberDirectoryPanel />);

    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "陳大");
    expect(await screen.findByText(MEMBERS.forbidden)).toBeTruthy();
  });

  test("hands an AUTH_REQUIRED search back through the safe deep-link seam", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/management?module=members");
    server.use(
      http.get("/api/v1/programs/members", () =>
        problemResponse(401, "AUTH_REQUIRED", "Session expired")
      )
    );
    render(<MemberDirectoryPanel />);

    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "陳大");
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/"));
    expect(mocks.rememberDeepLink).toHaveBeenCalledWith(
      "/management?module=members"
    );
  });

  test("uses an origin-aware same-origin Back link", () => {
    window.history.replaceState(
      {},
      "",
      "/management?module=members&return=%2Fmanagement%3Fmodule%3Dsettings"
    );
    render(<MemberDirectoryPanel />);

    expect(
      screen.getByRole("link", { name: MEMBERS.backToManagement })
    ).toHaveAttribute("href", "/management?module=settings");
  });

  test("forwards the 20-member search limit parameter and query to the member search seam", async () => {
    const user = userEvent.setup();
    let requestedUrl = "";
    server.use(
      http.get("/api/v1/programs/members", ({ request }) => {
        requestedUrl = request.url;
        return membersResponse(MEMBER_ROWS.slice(0, 1));
      })
    );
    render(<MemberDirectoryPanel />);
    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "陳大");
    await screen.findByRole("button", { name: /陳大文/ });
    const params = new URL(requestedUrl).searchParams;
    expect(params.get("limit")).toBe("20");
    expect(params.get("q")).toBe("陳大");
  });

  test("restores focus to the search field after selecting a member and clearing search query", async () => {
    const user = userEvent.setup();
    server.use(liveSearchHandler());
    render(<MemberDirectoryPanel />);
    const search = screen.getByLabelText(MEMBERS.searchLabel);
    await user.type(search, "陳大");
    const row = await screen.findByRole("button", { name: /陳大文/ });
    await user.click(row);
    await screen.findByRole("heading", { name: MEMBERS.memberDetail });

    await user.clear(search);
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: MEMBERS.memberDetail })
      ).toBeNull()
    );
    expect(document.activeElement).toBe(search);
  });

  test("renders ManagementPageHeader title and description inside DirectoryFrame", () => {
    render(<MemberDirectoryPanel />);
    expect(
      screen.getByRole("heading", { level: 1, name: MEMBERS.membersTitle })
    ).toBeInTheDocument();
    expect(screen.getAllByText(MEMBERS.membersLead).length).toBeGreaterThan(0);
  });
});
