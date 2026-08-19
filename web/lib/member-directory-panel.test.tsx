// 087-04 (#321) — component tests for the Member Directory panel
// (Spec 087 US 13-15). MSW intercepts GET /api/v1/programs/members at the
// same seam as lib/permissions-panel.test.tsx. Covers: live search renders
// results; selecting a result shows the member detail (contact, role,
// department memberships) inline with no separate commit step; and the
// empty / loading / server-error (retry re-fetches) / forbidden states.
import userEvent from "@testing-library/user-event";
import {
  cleanup,
  render,
  screen,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { MemberDirectoryPanel } from "@/app/management/member-directory-panel";
import { COPY } from "./copy";

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

const MEMBERS = COPY.managementMembers;

// Wire contract: GET /api/v1/programs/members -> data.members of
// { userId, name, phone: string|null, role, status, departments }.
interface MemberRow {
  userId: string;
  name: string;
  phone: string | null;
  role: "Admin" | "Staff" | "Member";
  status: string;
  departments: Array<{ id: string; name: string }>;
}

const MEMBER_ROWS: MemberRow[] = [
  {
    userId: "U-DIR-DANA",
    name: "陳大文",
    phone: "9123 4567",
    role: "Member",
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
    role: "Staff",
    status: "Active",
    departments: [{ id: "dept-worship", name: "崇拜部" }],
  },
  {
    userId: "U-DIR-FAY",
    name: "李秀蘭",
    phone: "7777 8888",
    role: "Member",
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
      (member) =>
        member.name.includes(query) || member.phone?.includes(query)
    );
    return membersResponse(matched);
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

describe("MemberDirectoryPanel", () => {
  test("typing in the search field renders matching results without a submit step", async () => {
    const user = userEvent.setup();
    server.use(liveSearchHandler());
    render(<MemberDirectoryPanel />);

    const search = screen.getByLabelText(MEMBERS.searchLabel);
    await user.type(search, "大文");

    // Results render as buttons carrying name + role · department.
    const danaRow = await screen.findByRole("button", { name: /陳大文/ });
    expect(within(danaRow).getByText(/Member/)).toBeTruthy();
    expect(within(danaRow).getByText(/培育部/)).toBeTruthy();
    const evanRow = screen.getByRole("button", { name: /王大文/ });
    expect(within(evanRow).getByText(/Staff/)).toBeTruthy();
    expect(within(evanRow).getByText(/崇拜部/)).toBeTruthy();
    // No submit control exists — search is live on input.
    expect(
      screen.queryByRole("button", { name: /搜尋$/ })
    ).toBeNull();
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
    expect(detailRoot).not.toBeNull();
    if (detailRoot === null) return;
    const detailView = within(detailRoot as HTMLElement);
    expect(detailView.getByText(MEMBERS.memberContact)).toBeTruthy();
    expect(detailView.getByText("9123 4567")).toBeTruthy();
    expect(detailView.getByText(MEMBERS.memberRole)).toBeTruthy();
    expect(detailView.getByText("Member")).toBeTruthy();
    expect(detailView.getByText(MEMBERS.memberDepartments)).toBeTruthy();
    expect(detailView.getByText("培育部")).toBeTruthy();
    expect(detailView.getByText("崇拜部")).toBeTruthy();
    // No commit step: no save/confirm/submit control, and no navigation.
    expect(
      screen.queryByRole("button", { name: /儲存|確認|提交/ })
    ).toBeNull();
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
    server.use(
      http.get("/api/v1/programs/members", () => membersResponse([]))
    );
    render(<MemberDirectoryPanel />);

    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "無人");
    expect(
      await screen.findByText(MEMBERS.noResults)
    ).toBeTruthy();
    expect(screen.getByText(MEMBERS.emptyHint)).toBeTruthy();
  });

  test("the search region is marked busy while a request is pending", async () => {
    const user = userEvent.setup();
    let resolvePending: ((response: Response) => void) | undefined;
    server.use(
      http.get("/api/v1/programs/members", () =>
        new Promise<Response>((resolve) => {
          resolvePending = resolve;
        })
      )
    );
    const { container } = render(<MemberDirectoryPanel />);

    await user.type(screen.getByLabelText(MEMBERS.searchLabel), "陳大");
    expect(
      container.querySelector('[aria-busy="true"]')
    ).not.toBeNull();

    resolvePending?.(membersResponse([MEMBER_ROWS[0]!]));
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
});
