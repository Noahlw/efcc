import { cleanup, render, screen } from "@testing-library/react";
// PRG-03 (#199) — component tests for the enrollment panel (UI-1..UI-6).
// MSW intercepts the Worker program endpoints; fixtures carry no credential
// material.
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { COPY, errorCopyFor } from "@/lib/copy";
import type {
  Enrollment,
  EnrollmentRequest,
  Program,
} from "@/lib/programs/program-api";
import { EnrollmentPanel } from "@/lib/programs/programs-enrollment-panel";

const server = setupServer();

const MEMBER_REQUEST_PROGRAM: Program = {
  program_id: "prog-1",
  department_id: "dept-1",
  name: "週六團契",
  description: null,
  category: null,
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  display_order: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const MANAGER_ONLY_PROGRAM: Program = {
  ...MEMBER_REQUEST_PROGRAM,
  program_id: "prog-2",
  enrollment_mode: "ManagerOnly",
};

const PENDING_BOB: EnrollmentRequest = {
  request_id: "req-1",
  program_id: "prog-1",
  member_user_id: "U002",
  status: "Pending",
  submitted_at: "2026-08-01T00:00:00.000Z",
  decided_by: null,
  decided_at: null,
  decision_note: null,
  request_version: 1,
};

const PENDING_CAROL: EnrollmentRequest = {
  ...PENDING_BOB,
  request_id: "req-2",
  member_user_id: "U003",
};

const ACTIVE_ENROLLMENT: Enrollment = {
  enrollment_id: "enr-1",
  program_id: "prog-1",
  member_user_id: "U002",
  request_id: "req-1",
  status: "Active",
  enrolled_at: "2026-08-01T00:00:00.000Z",
  cancelled_at: null,
  cancelled_by: null,
  created_by: "U001",
  created_at: "2026-08-01T00:00:00.000Z",
};

function requestHandlers(
  programId: string,
  requests: EnrollmentRequest[],
  enrollments: Enrollment[]
) {
  return [
    http.get(`/api/v1/programs/${programId}/enrollment-requests`, () =>
      HttpResponse.json({ requestId: "rid-1", data: { requests } })
    ),
    http.get(`/api/v1/programs/${programId}/enrollments`, () =>
      HttpResponse.json({ requestId: "rid-2", data: { enrollments } })
    ),
  ];
}

describe("PRG-03 enrollment panel", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  test("UI-1 members can request enrollment and then withdraw their Pending request", async () => {
    const requests: EnrollmentRequest[] = [];
    const enrollments: Enrollment[] = [];
    server.use(
      ...requestHandlers("prog-1", requests, enrollments),
      http.post("/api/v1/programs/prog-1/enrollment-requests", () => {
        requests.push(PENDING_BOB);
        return HttpResponse.json({
          requestId: "rid-3",
          data: { request: PENDING_BOB },
        });
      }),
      http.post(
        "/api/v1/programs/prog-1/enrollment-requests/req-1/withdraw",
        () => {
          requests[0] = { ...requests[0], status: "Withdrawn" };
          return HttpResponse.json({
            requestId: "rid-4",
            data: { request: requests[0] },
          });
        }
      )
    );
    const user = userEvent.setup();
    render(
      <EnrollmentPanel
        program={MEMBER_REQUEST_PROGRAM}
        canManage={false}
        currentUserId="U002"
      />
    );
    await screen.findByText(COPY.programs.noRequests);
    const requestButton = screen.getByRole("button", {
      name: COPY.programs.requestEnroll,
    });
    await user.click(requestButton);
    await expect(
      screen.findByText(COPY.programs.requestSubmitted)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.requestPending)
    ).resolves.toBeInTheDocument();
    const withdrawButton = screen.getByRole("button", {
      name: COPY.programs.withdrawRequest,
    });
    await user.click(withdrawButton);
    await expect(
      screen.findByText(COPY.programs.requestWithdrawnNotice)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.requestWithdrawn)
    ).resolves.toBeInTheDocument();
  });

  test("UI-2 ManagerOnly programs show a read-only note with no request button", async () => {
    server.use(...requestHandlers("prog-2", [], []));
    render(
      <EnrollmentPanel
        program={MANAGER_ONLY_PROGRAM}
        canManage={false}
        currentUserId="U002"
      />
    );
    await expect(
      screen.findByText(COPY.programs.managerOnlyNote)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.requestEnroll })
    ).not.toBeInTheDocument();
  });

  test("UI-3 managers approve and reject Pending requests with the decision note", async () => {
    const requests: EnrollmentRequest[] = [PENDING_BOB, PENDING_CAROL];
    server.use(
      ...requestHandlers("prog-1", requests, []),
      http.post(
        "/api/v1/programs/prog-1/enrollment-requests/req-1/decision",
        async ({ request }) => {
          const body = (await request.json()) as {
            action: string;
            note: string | null;
          };
          expect(body.action).toBe("Approved");
          expect(body.note).toBe("歡迎");
          requests[0] = {
            ...requests[0],
            status: "Approved",
            decision_note: "歡迎",
          };
          return HttpResponse.json({
            requestId: "rid-3",
            data: { request: requests[0] },
          });
        }
      ),
      http.post(
        "/api/v1/programs/prog-1/enrollment-requests/req-2/decision",
        async ({ request }) => {
          const body = (await request.json()) as { action: string };
          expect(body.action).toBe("Rejected");
          requests[1] = { ...requests[1], status: "Rejected" };
          return HttpResponse.json({
            requestId: "rid-4",
            data: { request: requests[1] },
          });
        }
      )
    );
    const user = userEvent.setup();
    render(
      <EnrollmentPanel
        program={MEMBER_REQUEST_PROGRAM}
        canManage
        currentUserId="U001"
      />
    );
    await screen.findAllByText(COPY.programs.requestPending);
    const notes = screen.getAllByLabelText(COPY.programs.decisionNote);
    await user.type(notes[0], "歡迎");
    await user.click(
      screen.getAllByRole("button", { name: COPY.programs.approve })[0]
    );
    await expect(
      screen.findByText(COPY.programs.decisionMade)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.requestApproved)
    ).resolves.toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: COPY.programs.reject })[0]
    );
    await expect(
      screen.findByText(COPY.programs.requestRejected)
    ).resolves.toBeInTheDocument();
  });

  test("UI-4 managers enroll a member directly on ManagerOnly programs", async () => {
    const enrollments: Enrollment[] = [];
    server.use(
      ...requestHandlers("prog-2", [], enrollments),
      http.post("/api/v1/programs/prog-2/enrollments", async ({ request }) => {
        const body = (await request.json()) as { member_user_id: string };
        expect(body.member_user_id).toBe("U002");
        enrollments.push(ACTIVE_ENROLLMENT);
        return HttpResponse.json({
          requestId: "rid-3",
          data: { enrollment: ACTIVE_ENROLLMENT },
        });
      })
    );
    const user = userEvent.setup();
    render(
      <EnrollmentPanel
        program={MANAGER_ONLY_PROGRAM}
        canManage
        currentUserId="U001"
      />
    );
    await screen.findByText(COPY.programs.noEnrollments);
    await user.type(screen.getByLabelText(COPY.programs.memberId), "U002");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.assistedEnroll })
    );
    await expect(
      screen.findByText(COPY.programs.assistedSubmitted)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.enrollmentActive)
    ).resolves.toBeInTheDocument();
  });

  test("UI-5 members can cancel their own Active enrollment", async () => {
    const enrollments: Enrollment[] = [{ ...ACTIVE_ENROLLMENT }];
    server.use(
      ...requestHandlers("prog-1", [], enrollments),
      http.post("/api/v1/programs/prog-1/enrollments/enr-1/cancel", () => {
        enrollments[0] = { ...enrollments[0], status: "Cancelled" };
        return HttpResponse.json({
          requestId: "rid-3",
          data: { enrollment: enrollments[0] },
        });
      })
    );
    const user = userEvent.setup();
    render(
      <EnrollmentPanel
        program={MEMBER_REQUEST_PROGRAM}
        canManage={false}
        currentUserId="U002"
      />
    );
    await screen.findByText(COPY.programs.selfEnrollmentNote);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    );
    await expect(
      screen.findByText(COPY.programs.enrollmentCancelledNotice)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.enrollmentCancelled)
    ).resolves.toBeInTheDocument();
  });

  test("UI-6 duplicate request surfaces the mapped conflict error in an alert", async () => {
    server.use(
      ...requestHandlers("prog-1", [], []),
      http.post("/api/v1/programs/prog-1/enrollment-requests", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            code: "CONFLICT",
            detail: "Member U002 already has an open request.",
            requestId: "rid-3",
          },
          { status: 409 }
        )
      )
    );
    const user = userEvent.setup();
    render(
      <EnrollmentPanel
        program={MEMBER_REQUEST_PROGRAM}
        canManage={false}
        currentUserId="U002"
      />
    );
    await screen.findByText(COPY.programs.noRequests);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.requestEnroll })
    );
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      errorCopyFor("CONFLICT")
    );
  });
});
