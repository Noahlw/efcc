// 087-02 (#319) — component tests for the routable Approval Detail screen.
// MSW intercepts the Worker detail + decide endpoints (same seam as
// lib/approval-queue.test.tsx). Fixtures carry no credential material.
// Covers: deep-link read, name/contact/status rendering, atomic 核准,
// required-note 拒絕, read-only outcome after a decision, back-nav to the
// approvals list, and the guarded/error states.
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { ApprovalDetail } from "./approval-detail";
import { COPY } from "./copy";
import { QUEUE_COPY } from "./registration-copy";
import type { RegistrationDetail } from "./registration-client";

const server = setupServer();

const PENDING: RegistrationDetail = {
  requestId: "req-1",
  username: "dave",
  name: "Dave Ng",
  phone: "9123 4567",
  status: "Pending",
  role: "Member",
  submittedAt: 1_700_000_000_000,
  decidedAt: null,
  decisionNote: null,
  decision: null,
};

function detailResponse(detail: RegistrationDetail) {
  return HttpResponse.json({
    requestId: "rid-detail",
    data: { registration: detail },
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

describe("ApprovalDetail", () => {
  test("deep-links: fetches the request by id on mount and shows name/contact/status", async () => {
    let requestedPath: string | null = null;
    server.use(
      http.get("/api/v1/auth/registrations/req-1", ({ request }) => {
        requestedPath = new URL(request.url).pathname;
        return detailResponse(PENDING);
      })
    );
    render(<ApprovalDetail requestId="req-1" />);

    expect(
      await screen.findByRole("heading", {
        name: COPY.approvals.approvalDetailTitle,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Dave Ng")).toBeInTheDocument();
    expect(screen.getByText("dave")).toBeInTheDocument();
    expect(screen.getByText("9123 4567")).toBeInTheDocument();
    expect(screen.getByText(COPY.approvals.statusPending)).toBeInTheDocument();
    // The read hit the canonical single-request endpoint (reload-safe URL).
    expect(requestedPath).toBe("/api/v1/auth/registrations/req-1");
  });

  test("shows a decided request read-only with the recorded outcome on load", async () => {
    server.use(
      http.get("/api/v1/auth/registrations/req-1", () =>
        detailResponse({
          ...PENDING,
          status: "Rejected",
          decidedAt: 1_700_000_200_000,
          decisionNote: "資料不完整",
          decision: "Rejected",
        })
      )
    );
    render(<ApprovalDetail requestId="req-1" />);

    expect(
      await screen.findByText(COPY.approvals.statusRejected)
    ).toBeInTheDocument();
    expect(screen.getByText("資料不完整")).toBeInTheDocument();
    expect(screen.getByText(COPY.approvals.decisionMade)).toBeInTheDocument();
    // Read-only: no decision controls are offered for a decided request.
    expect(
      screen.queryByRole("button", { name: COPY.approvals.approve })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.approvals.reject })
    ).not.toBeInTheDocument();
  });

  test("approve commits atomically and the outcome becomes read-only", async () => {
    let detail: RegistrationDetail = PENDING;
    const approveCalls: { idempotency: string | null }[] = [];
    server.use(
      http.get("/api/v1/auth/registrations/req-1", () => detailResponse(detail)),
      http.post("/api/v1/auth/registrations/req-1/approve", ({ request }) => {
        approveCalls.push({ idempotency: request.headers.get("idempotency-key") });
        detail = { ...detail, status: "Active", decidedAt: 1_700_000_300_000, decision: "Approved" };
        return HttpResponse.json({
          requestId: "rid-approve",
          data: { accountStatus: "active" },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalDetail requestId="req-1" />);

    const approveButton = await screen.findByRole("button", {
      name: COPY.approvals.approve,
    });
    await user.click(approveButton);

    expect(approveCalls).toHaveLength(0);
    expect(
      screen.getByRole("alertdialog", { name: "確認核准申請" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Dave Ng.*Active Account/u)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(approveButton).toHaveFocus();
    expect(approveCalls).toHaveLength(0);
    await user.click(approveButton);
    await user.click(screen.getByRole("button", { name: "確認核准" }));

    // The decision posts with an Idempotency-Key and the detail reloads to
    // the read-only Approved outcome (atomic: one round-trip, then locked).
    expect(
      await screen.findByText(COPY.approvals.statusApproved)
    ).toBeInTheDocument();
    expect(approveCalls[0]?.idempotency).toBeTruthy();
    // 已處理申請。 appears both as the success notice and as the read-only
    // outcome marker on the locked detail.
    expect(
      screen.getAllByText(COPY.approvals.decisionMade).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: COPY.approvals.approve })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.approvals.reject })
    ).not.toBeInTheDocument();
  });

  test("reject without a note shows the required error and posts nothing", async () => {
    let detail: RegistrationDetail = PENDING;
    let rejectPosts = 0;
    server.use(
      http.get("/api/v1/auth/registrations/req-1", () => detailResponse(detail)),
      http.post("/api/v1/auth/registrations/req-1/reject", () => {
        rejectPosts += 1;
        detail = { ...detail, status: "Rejected", decision: "Rejected" };
        return HttpResponse.json({
          requestId: "rid-reject",
          data: { accountStatus: "rejected" },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalDetail requestId="req-1" />);

    await user.click(
      await screen.findByRole("button", { name: COPY.approvals.reject })
    );

    expect(
      screen.getByRole("alertdialog", { name: "確認拒絕申請" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "確認拒絕" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "確認拒絕" }));

    // Client-side gate: the required-note error is announced inline and no
    // POST leaves the browser (the server also 422s, but this must not fire).
    expect(
      await screen.findByText(COPY.approvals.rejectionNoteRequired)
    ).toBeInTheDocument();
    expect(rejectPosts).toBe(0);
    expect(
      screen.getByRole("alertdialog", { name: "確認拒絕申請" })
    ).toBeInTheDocument();
    const noteInput = screen.getByRole("textbox", {
      name: COPY.approvals.decisionNote,
    });
    expect(noteInput).toHaveAttribute("aria-invalid", "true");
    expect(noteInput).toHaveFocus();
  });
  test("retrying a load failure restores the detail and focuses the error", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/v1/auth/registrations/req-retry", () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json(
              { code: "UNAVAILABLE", detail: "temporary" },
              { status: 500 }
            )
          : detailResponse({ ...PENDING, requestId: "req-retry" });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalDetail requestId="req-retry" />);

    const error = await screen.findByRole("alert");
    await waitFor(() => expect(error).toHaveFocus());
    expect(error).toHaveAttribute("tabindex", "-1");
    await user.click(screen.getByRole("button", { name: "重試連接" }));
    expect(await screen.findByText("Dave Ng")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  test("conflict failure keeps pending decisions available with conflict styling", async () => {
    server.use(
      http.get("/api/v1/auth/registrations/req-1", () => detailResponse(PENDING)),
      http.post(
        "/api/v1/auth/registrations/req-1/approve",
        () =>
          HttpResponse.json(
            { requestId: "rid-detail-conflict", code: "CONFLICT" },
            { status: 409 }
          )
      )
    );
    const user = userEvent.setup();
    render(<ApprovalDetail requestId="req-1" />);
    const approveButton = await screen.findByRole("button", {
      name: COPY.approvals.approve,
    });
    await user.click(approveButton);
    await user.click(screen.getByRole("button", { name: "確認核准" }));

    const conflict = await screen.findByRole("alert", {
      name: "",
    });
    expect(conflict).toHaveTextContent(QUEUE_COPY.conflict);
    expect(
      screen.getByRole("region", { name: "申請處理操作" })
    ).toHaveAttribute("data-state", "conflict");
    expect(
      screen.getByRole("button", { name: COPY.approvals.approve })
    ).toBeInTheDocument();
  });

  test("decision busy state locks the Action Surface until the server resolves", async () => {
    let release!: () => void;
    let detail: RegistrationDetail = PENDING;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/v1/auth/registrations/req-1", () => detailResponse(detail)),
      http.post("/api/v1/auth/registrations/req-1/approve", async () => {
        await gate;
        detail = {
          ...detail,
          status: "Active",
          decision: "Approved",
          decidedAt: 1_700_000_500_000,
        };
        return HttpResponse.json({
          requestId: "rid-detail-busy",
          data: { accountStatus: "active" },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalDetail requestId="req-1" />);
    const approveButton = await screen.findByRole("button", {
      name: COPY.approvals.approve,
    });
    await user.click(approveButton);
    await user.click(screen.getByRole("button", { name: "確認核准" }));

    await waitFor(() => expect(approveButton).toBeDisabled());
    expect(approveButton).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("region", { name: COPY.approvals.approvalDetailTitle })
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("region", { name: "申請處理操作" })
    ).toHaveAttribute("data-state", "busy");

    release();
    expect(
      await screen.findByText(COPY.approvals.statusApproved)
    ).toBeInTheDocument();
  });

  test("reject with a note commits atomically with the note and shows it read-only", async () => {
    let detail: RegistrationDetail = PENDING;
    const rejectCalls: { decisionNote?: string; idempotency: string | null }[] =
      [];
    server.use(
      http.get("/api/v1/auth/registrations/req-1", () => detailResponse(detail)),
      http.post("/api/v1/auth/registrations/req-1/reject", async ({ request }) => {
        const body = (await request.json()) as { decisionNote?: string };
        rejectCalls.push({
          decisionNote: body.decisionNote,
          idempotency: request.headers.get("idempotency-key"),
        });
        detail = {
          ...detail,
          status: "Rejected",
          decidedAt: 1_700_000_400_000,
          decisionNote: body.decisionNote ?? null,
          decision: "Rejected",
        };
        return HttpResponse.json({
          requestId: "rid-reject-note",
          data: { accountStatus: "rejected" },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalDetail requestId="req-1" />);

    await user.click(
      await screen.findByRole("button", { name: COPY.approvals.reject })
    );
    await user.type(
      await screen.findByLabelText(COPY.approvals.decisionNote),
      "資料不完整"
    );
    await user.click(screen.getByRole("button", { name: "確認拒絕" }));

    expect(
      await screen.findByText(COPY.approvals.statusRejected)
    ).toBeInTheDocument();
    expect(rejectCalls[0]?.decisionNote).toBe("資料不完整");
    expect(rejectCalls[0]?.idempotency).toBeTruthy();
    // Terminal + auditable: the recorded note is visible on the read-only
    // detail at the same URL.
    expect(screen.getByText("資料不完整")).toBeInTheDocument();
    expect(
      screen.getAllByText(COPY.approvals.decisionMade).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: COPY.approvals.approve })
    ).not.toBeInTheDocument();
  });

  test("back-navigation returns to the approvals list with prior state intact", async () => {
    server.use(
      http.get("/api/v1/auth/registrations/req-1", () => detailResponse(PENDING))
    );
    render(<ApprovalDetail requestId="req-1" />);

    const back = await screen.findByRole("link", {
      name: COPY.approvals.backToApprovals,
    });
    // The canonical hub sub-route: same module URL, no request param, so the
    // list remounts with its own loaded state (browser back preserves it).
    expect(back).toHaveAttribute("href", "/management?module=approvals");
  });

  test("exposes a busy root, live result, and focused detail heading", async () => {
    server.use(
      http.get("/api/v1/auth/registrations/req-1", () => detailResponse(PENDING))
    );
    render(<ApprovalDetail requestId="req-1" />);
    const heading = await screen.findByRole("heading", {
      name: COPY.approvals.approvalDetailTitle,
    });
    expect(heading).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(heading).toHaveFocus());
    expect(
      screen.getByRole("region", { name: COPY.approvals.approvalDetailTitle })
    ).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  test("shows the S13 forbidden state for a non-Admin/Staff caller (403)", async () => {
    server.use(
      http.get("/api/v1/auth/registrations/req-1", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#FORBIDDEN",
            title: "Forbidden",
            status: 403,
            code: "FORBIDDEN",
            requestId: "rid-403",
          },
          { status: 403, headers: { "Content-Type": "application/problem+json" } }
        )
      )
    );
    render(<ApprovalDetail requestId="req-1" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(COPY.error.forbidden);
    expect(
      screen.getByRole("link", { name: COPY.approvals.backToApprovals })
    ).toHaveAttribute("href", "/management?module=approvals");
  });

  test("shows the not-found message for an unknown request", async () => {
    server.use(
      http.get("/api/v1/auth/registrations/req-unknown", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#NOT_FOUND",
            title: "Not found",
            status: 404,
            code: "NOT_FOUND",
            requestId: "rid-404",
          },
          { status: 404, headers: { "Content-Type": "application/problem+json" } }
        )
      )
    );
    render(<ApprovalDetail requestId="req-unknown" />);

    expect(await screen.findByText(QUEUE_COPY.notFound)).toBeInTheDocument();
  });
});
