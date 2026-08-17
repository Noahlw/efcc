// AUTH-05 (#163) — component tests for the Staff/Admin approval queue.
// MSW intercepts the Worker queue endpoints (the same seam used by
// lib/app.test.tsx). Fixtures carry no credential material.
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { ApprovalQueue } from "./approval-queue";
import { COPY } from "./copy";
import { QUEUE_COPY } from "./registration-copy";

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
  },
];

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

describe("ApprovalQueue", () => {
  test("lists Pending registrations", async () => {
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
      screen.getByRole("button", { name: `${QUEUE_COPY.approve} Member` })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: QUEUE_COPY.reject })).toBeInTheDocument();
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
      },
      {
        requestId: "req-late",
        username: "ben",
        name: "Ben Lau",
        phone: null,
        submittedAt: 1_700_000_100_000,
        accountStatus: "Pending",
        role: "Member",
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
    // Inline approve/reject stays for quick same-screen review (Spec 087
    // US 8): both Member rows keep their quick-action buttons.
    expect(
      screen.getAllByRole("button", { name: "批准 Member" })
    ).toHaveLength(2);
  });

  test("approve posts with an Idempotency-Key and reloads the list", async () => {
    let approved = false;
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({
          requestId: "rid-3",
          data: {
            registrations: approved ? [] : PENDING_ONE,
          },
        })
      ),
      http.post("/api/v1/auth/registrations/req-1/approve", ({ request }) => {
        approved = true;
        expect(request.headers.get("idempotency-key")).toBeTruthy();
        return HttpResponse.json({
          requestId: "rid-4",
          data: { accountStatus: "active" },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);
    await user.click(
      await screen.findByRole("button", { name: `${QUEUE_COPY.approve} Member` })
    );
    // After the approve round-trip the queue reloads and the row is gone.
    expect(await screen.findByText(QUEUE_COPY.empty)).toBeInTheDocument();
  });

  test("inline reject reveals a note field; empty note gates locally, filled note posts atomically", async () => {
    let rejected = false;
    const rejectCalls: { decisionNote?: string; idempotency: string | null }[] =
      [];
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({
          requestId: "rid-rejectq",
          data: { registrations: rejected ? [] : PENDING_ONE },
        })
      ),
      http.post("/api/v1/auth/registrations/req-1/reject", async ({ request }) => {
        rejected = true;
        const body = (await request.json()) as { decisionNote?: string };
        rejectCalls.push({
          decisionNote: body.decisionNote,
          idempotency: request.headers.get("idempotency-key"),
        });
        return HttpResponse.json({
          requestId: "rid-rejectq-2",
          data: { accountStatus: "rejected" },
        });
      })
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);

    // First click reveals the row's required-note field and suspends approve
    // for that row (quick-review flow stays inline — Spec 087 US 8).
    await user.click(
      await screen.findByRole("button", { name: QUEUE_COPY.reject })
    );
    const noteInput = await screen.findByLabelText(COPY.approvals.decisionNote);
    expect(noteInput).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `${QUEUE_COPY.approve} Member` })
    ).toBeDisabled();

    // Empty note: the local gate announces the required error and nothing
    // posts (the server also 422s, but the row must not leave the queue).
    await user.click(screen.getByRole("button", { name: QUEUE_COPY.reject }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      COPY.approvals.rejectionNoteRequired
    );
    expect(rejectCalls).toHaveLength(0);

    // Filled note: the reject posts the decision note with an Idempotency-Key
    // and the queue reloads without the row.
    await user.type(noteInput, "資料不完整");
    await user.click(screen.getByRole("button", { name: QUEUE_COPY.reject }));
    expect(await screen.findByText(QUEUE_COPY.empty)).toBeInTheDocument();
    expect(rejectCalls[0]?.decisionNote).toBe("資料不完整");
    expect(rejectCalls[0]?.idempotency).toBeTruthy();
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
    const link = screen.getByRole("link", { name: COPY.nav.backToProfile });
    expect(link).toHaveAttribute("href", "/profile");
  });
});