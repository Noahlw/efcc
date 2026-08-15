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

  test("requires and submits a rejection note from the request details", async () => {
    let rejected = false;
    let attempts = 0;
    server.use(
      http.get("/api/v1/auth/registrations", () =>
        HttpResponse.json({
          requestId: "rid-note",
          data: { registrations: rejected ? [] : PENDING_ONE },
        })
      ),
      http.post(
        "/api/v1/auth/registrations/req-1/reject",
        async ({ request }) => {
          attempts += 1;
          expect(request.headers.get("idempotency-key")).toBeTruthy();
          expect(request.headers.get("content-type")).toContain(
            "application/json"
          );
          expect(await request.json()).toStrictEqual({
            note: "資料不足，請補充後再申請。",
          });
          if (attempts === 1) {
            return HttpResponse.json(
              { code: "UNAVAILABLE", detail: "temporarily unavailable" },
              { status: 503 }
            );
          }
          rejected = true;
          return HttpResponse.json({
            requestId: "rid-note-decision",
            data: { accountStatus: "rejected" },
          });
        }
      )
    );
    const user = userEvent.setup();
    render(<ApprovalQueue />);
    await user.click(
      await screen.findByRole("button", {
        name: `${QUEUE_COPY.reject}`,
      })
    );
    const note = screen.getByRole("textbox", {
      name: QUEUE_COPY.rejectionNoteLabel,
    });
    await user.click(
      screen.getByRole("button", { name: QUEUE_COPY.confirmReject })
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      QUEUE_COPY.rejectionNoteRequired
    );
    await user.type(note, "資料不足，請補充後再申請。");
    await user.click(
      screen.getByRole("button", { name: QUEUE_COPY.confirmReject })
    );
    expect(await screen.findByText(QUEUE_COPY.unavailable)).toBeInTheDocument();
    expect(note).toHaveValue("資料不足，請補充後再申請。");
    await user.click(
      screen.getByRole("button", { name: QUEUE_COPY.confirmReject })
    );
    expect(await screen.findByText(QUEUE_COPY.empty)).toBeInTheDocument();
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