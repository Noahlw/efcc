// AUTH-05 (#163) — component tests for the Staff/Admin approval queue.
// MSW intercepts the Worker queue endpoints (the same seam used by
// lib/app.test.tsx). Fixtures carry no credential material.
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

import { ApprovalQueue } from "./approval-queue";
import { COPY } from "./copy";
import { QUEUE_COPY } from "./registration-copy";

vi.mock(import("next/navigation"), () => ({
  useSearchParams: () =>
    new URLSearchParams() as unknown as ReadonlyURLSearchParams,
}));
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

const server = setupServer();

const PENDING_ONE = [
  {
    requestId: "req-1",
    username: "dave",
    name: "Dave Ng",
    phone: null,
    submittedAt: 1_700_000_000_000,
    accountStatus: "Pending",
    role: "Member",
    decision: null,
    decisionNote: null,
  },
];

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

describe("ApprovalQueue", () => {
  test("lists Pending registrations with explicit selection controls", async () => {
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({
          requestId: "rid-1",
          data: { registrations: PENDING_ONE },
        })
      )
    );
    render(<ApprovalQueue />);
    expect(await screen.findByText("Dave Ng")).toBeInTheDocument();
    expect(screen.getByText("dave")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /待審批/u })
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "選取 Dave Ng" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: `${COPY.approvals.openDetail} Dave Ng` })
    ).toHaveAttribute(
      "href",
      "/management?module=approvals&request=req-1"
    );
    expect(
      screen.queryByRole("button", { name: QUEUE_COPY.approve })
    ).not.toBeInTheDocument();
  });

  test("shows an empty state when there are no pending requests", async () => {
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({ requestId: "rid-2", data: { registrations: [] } })
      )
    );
    render(<ApprovalQueue />);
    expect(await screen.findByText(QUEUE_COPY.empty)).toBeInTheDocument();
  });

  test("renders pending requests in submission order with routable detail links", async () => {
    const PENDING_TWO = [
      {
        requestId: "req-early",
        username: "anna",
        name: "Anna Poon",
        phone: "9123 4001",
        submittedAt: 1_700_000_000_000,
        accountStatus: "Pending",
        role: "Member",
        decision: null,
        decisionNote: null,
      },
      {
        requestId: "req-late",
        username: "ben",
        name: "Ben Lau",
        phone: null,
        submittedAt: 1_700_000_100_000,
        accountStatus: "Pending",
        role: "Member",
        decision: null,
        decisionNote: null,
      },
    ];
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({
          requestId: "rid-order",
          data: { registrations: PENDING_TWO },
        })
      )
    );
    render(<ApprovalQueue />);

    // The server returns the queue in submission order (oldest first); the
    // list renders exactly that order.
    const links = await screen.findAllByRole("link", {
      name: new RegExp(COPY.approvals.openDetail, "u"),
    });
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      `${COPY.approvals.openDetail} Anna Poon`,
      `${COPY.approvals.openDetail} Ben Lau`,
    ]);

    // Each row name is the deep-linkable entry into the routable detail
    // (canonical hub sub-route `&request=<id>`), while inline approve/reject
    // stays available for quick same-screen review (Spec 087 US 8).
    expect(links[0]).toHaveAttribute(
      "href",
      "/management?module=approvals&request=req-early"
    );
    expect(links[1]).toHaveAttribute(
      "href",
      "/management?module=approvals&request=req-late"
    );
    // Queue rows only locate/select work; mutations happen on Detail after
    // applicant-summary confirmation.
    expect(screen.getAllByRole("checkbox", { name: /選取/u })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /批准 Member/u })).toBeNull();
  });

  test("select-all reflects mixed local Checkbox state", async () => {
    const rows = [
      PENDING_ONE[0],
      { ...PENDING_ONE[0], requestId: "req-2", name: "Anna Poon" },
      { ...PENDING_ONE[0], requestId: "req-3", name: "Ben Lau" },
    ];
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({
          requestId: "rid-mixed",
          data: { registrations: rows },
        })
      )
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);
    await user.click(
      await screen.findByRole("checkbox", { name: "選取 Dave Ng" })
    );
    await user.click(screen.getByRole("checkbox", { name: "選取 Anna Poon" }));

    const selectAll = screen.getByRole("checkbox", {
      name: "全選目前結果",
    });
    expect(selectAll).toHaveAttribute("aria-checked", "mixed");
    expect(selectAll).toHaveAttribute("data-state", "indeterminate");
  });

  test("bulk approve waits for one explicit confirmation, then reloads the list", async () => {
    let approved = false;
    let batchCalls = 0;
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({
          requestId: "rid-3",
          data: {
            registrations: approved ? [] : PENDING_ONE,
          },
        })
      ),
      http.post("/api/v1/auth/registrations/approve-batch", async ({ request }) => {
        batchCalls += 1;
        approved = true;
        expect(request.headers.get("idempotency-key")).toBeTruthy();
        expect(await request.json()).toEqual({ requestIds: ["req-1"] });
        return HttpResponse.json({
          requestId: "rid-4",
          data: { accountStatus: "active", approvedCount: 1 },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);
    await user.click(await screen.findByRole("checkbox", { name: "選取 Dave Ng" }));
    const bulkButton = await screen.findByRole("button", { name: "核准所選" });
    await user.click(bulkButton);
    expect(batchCalls).toBe(0);
    expect(
      screen.getByRole("alertdialog", { name: "確認核准所選申請" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Dave Ng").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(bulkButton).toHaveFocus();
    expect(batchCalls).toBe(0);
    await user.click(bulkButton);
    await user.click(screen.getByRole("button", { name: "確認核准" }));
    expect(await screen.findByText(QUEUE_COPY.empty)).toBeInTheDocument();
    expect(batchCalls).toBe(1);
  });
  test("busy batch approval locks the Action Surface and selection controls", async () => {
    let approved = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({
          requestId: "rid-busy",
          data: { registrations: approved ? [] : PENDING_ONE },
        })
      ),
      http.post("/api/v1/auth/registrations/approve-batch", async () => {
        await gate;
        approved = true;
        return HttpResponse.json({
          requestId: "rid-busy-post",
          data: { accountStatus: "active", approvedCount: 1 },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);
    await user.click(
      await screen.findByRole("checkbox", { name: "選取 Dave Ng" })
    );
    const bulkButton = await screen.findByRole("button", { name: "核准所選" });
    await user.click(bulkButton);
    await user.click(screen.getByRole("button", { name: "確認核准" }));

    await waitFor(() => expect(bulkButton).toBeDisabled());
    expect(bulkButton).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("region", { name: "審批選取集" })
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("checkbox", { name: "選取 Dave Ng" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "檢視所選" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "清除" })).toBeDisabled();
    expect(
      screen.getByRole("region", { name: "審批選取集" })
    ).toHaveAttribute("data-state", "busy");

    release();
    expect(await screen.findByText(QUEUE_COPY.empty)).toBeInTheDocument();
  });

  test("selection persists across search/filter and supports review removal and clear", async () => {
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({
          requestId: "rid-selection",
          data: {
            registrations: [
              ...PENDING_ONE,
              {
                ...PENDING_ONE[0],
                requestId: "req-2",
                username: "anna",
                name: "Anna Poon",
              },
            ],
          },
        })
      )
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);
    await user.click(await screen.findByRole("checkbox", { name: "選取 Dave Ng" }));
    expect(screen.getByText("已選 1 位")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "搜尋申請" }), "Anna");
    expect(screen.queryByText("Dave Ng")).not.toBeInTheDocument();
    expect(screen.getByText("已選 1 位")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "篩選角色" }));
    await user.click(screen.getByRole("option", { name: "同工", exact: true }));
    expect(screen.getByText("已選 1 位")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "檢視所選" }));
    expect(screen.getByRole("button", { name: "移除 Dave Ng" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "移除 Dave Ng" }));
    expect(screen.queryByText("已選 1 位")).not.toBeInTheDocument();
  });

  test("processed tab is read-only and does not render selection or mutation controls", async () => {
    server.use(
      http.get("/api/v1/auth/registrations", ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        return HttpResponse.json({
          requestId: "rid-processed",
          data: {
            status: status === "Processed" ? "Processed" : "Pending",
            registrations:
              status === "Processed"
                ? [
                    {
                      ...PENDING_ONE[0],
                      accountStatus: "Rejected",
                      decision: "Rejected",
                      decisionNote: "資料不完整",
                    },
                  ]
                : PENDING_ONE,
          },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);
    await user.click(await screen.findByRole("tab", { name: /已處理/u }));
    expect(await screen.findByText(COPY.approvals.statusRejected)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /選取/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "核准所選" })).not.toBeInTheDocument();
  });

  test("hides the pending selection actions while viewing Processed", async () => {
    server.use(
      http.get("/api/v1/auth/registrations", ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        return HttpResponse.json({
          requestId: "rid-processed-actions",
          data: {
            status: status === "Processed" ? "Processed" : "Pending",
            registrations: status === "Processed" ? [] : PENDING_ONE,
          },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);
    await user.click(await screen.findByRole("checkbox", { name: "選取 Dave Ng" }));
    await user.click(screen.getByRole("tab", { name: /已處理/u }));
    expect(await screen.findByText("目前沒有已處理的申請。"))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "核准所選" })).not.toBeInTheDocument();
  });

  test("stale batch conflict preserves the selection and identifies stale rows", async () => {
    let reads = 0;
    server.use(
      http.get("/api/v1/auth/registrations", () => {
        const registrations = reads++ === 0 ? PENDING_ONE : [];
        return HttpResponse.json({
          requestId: "rid-conflict",
          data: { registrations },
        });
      }),
      http.post("/api/v1/auth/registrations/approve-batch", () =>
        HttpResponse.json(
          {
            requestId: "rid-conflict-post",
            code: "CONFLICT",
            detail: "stale",
          },
          { status: 409 }
        )
      )
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);
    await user.click(await screen.findByRole("checkbox", { name: "選取 Dave Ng" }));
    await user.click(screen.getByRole("button", { name: "核准所選" }));
    await user.click(screen.getByRole("button", { name: "確認核准" }));
    expect(
      await screen.findByText("部分申請已變更，請檢視所選項目後再試。")
    ).toBeInTheDocument();
    expect(screen.getByText("已選 1 位")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "審批選取集" })
    ).toHaveAttribute("data-state", "conflict");
    await user.click(screen.getByRole("button", { name: "檢視所選" }));
    expect(screen.getByText("資料已變更，請重新檢視")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除 Dave Ng" })).toBeInTheDocument();
  });

  test("exposes busy, live-region, and result-heading focus targets", async () => {
    server.use(
      http.get("/api/v1/auth/registrations", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return HttpResponse.json({
          requestId: "rid-a11y",
          data: { registrations: PENDING_ONE },
        });
      })
    );
    render(<ApprovalQueue />);
    const root = screen.getByRole("region", { name: /註冊審批/u });
    expect(root).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    const heading = await screen.findByRole("heading", {
      name: COPY.approvals.statusPending,
      level: 2,
    });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveFocus();
  });


  test("shows the S13 forbidden state for a non-Admin/Staff caller (403)", async () => {
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#FORBIDDEN",
            title: "Forbidden",
            status: 403,
            code: "FORBIDDEN",
            requestId: "rid-5",
          },
          { status: 403, headers: { "Content-Type": "application/problem+json" } }
        )
      )
    );
    render(<ApprovalQueue />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("您沒有權限執行此操作。");
    const link = screen.getByRole("link", { name: COPY.approvals.backToApprovals });
    expect(link).toHaveAttribute("href", "/management?module=approvals");
  });
});
