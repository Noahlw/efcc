import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { ParticipantEnrollment } from "@/lib/programs/participant-enrollment";
import type {
  ParticipantEnrollmentSnapshot,
  ProgramSummary,
} from "@/lib/programs/program-api";

const mocks = vi.hoisted(() => ({
  cancelEnrollment: vi.fn(),
  submitEnrollmentRequest: vi.fn(),
  withdrawEnrollmentRequest: vi.fn(),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  cancelEnrollment: mocks.cancelEnrollment,
  submitEnrollmentRequest: mocks.submitEnrollmentRequest,
  withdrawEnrollmentRequest: mocks.withdrawEnrollmentRequest,
}));

const program = (overrides: Partial<ProgramSummary> = {}): ProgramSummary => ({
  program_id: "program-1",
  department_id: "dept-1",
  name: "青年門徒小組",
  description: "為青年建立穩定的同行與學習空間。",
  category: "門徒訓練",
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const snapshot = (
  overrides: Partial<ParticipantEnrollmentSnapshot> = {}
): ParticipantEnrollmentSnapshot => ({
  requests: [],
  enrollments: [],
  ...overrides,
});

function renderEnrollment(
  overrides: Partial<ComponentProps<typeof ParticipantEnrollment>> = {}
) {
  const onRefresh = vi.fn<() => Promise<void>>().mockResolvedValue();
  render(
    <ParticipantEnrollment
      program={overrides.program ?? program()}
      enrollment={
        overrides.enrollment === undefined ? snapshot() : overrides.enrollment
      }
      scheduleRules={
        overrides.scheduleRules ?? [
          {
            rule_id: "rule-1",
            recurrence: "WEEKLY",
            day_of_week: 3,
            month_day: null,
            start_time: "19:30",
            end_time: "21:00",
          },
        ]
      }
      events={overrides.events ?? []}
      onRefresh={overrides.onRefresh ?? onRefresh}
    />
  );
  return { onRefresh };
}

beforeEach(() => {
  mocks.cancelEnrollment.mockReset().mockResolvedValue({});
  mocks.submitEnrollmentRequest.mockReset().mockResolvedValue({});
  mocks.withdrawEnrollmentRequest.mockReset().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe("PUI-04 participant Enrollment", () => {
  test("offers one MemberRequest action with a non-blocking schedule advisory", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment();

    expect(
      screen.getAllByRole("button", { name: COPY.programs.requestEnroll })
    ).toHaveLength(1);
    expect(
      screen.getByText(COPY.programs.enrollmentScheduleAdvisory)
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.requestEnroll })
    );
    await waitFor(() => {
      expect(mocks.submitEnrollmentRequest).toHaveBeenCalledWith("program-1");
      expect(onRefresh).toHaveBeenCalledOnce();
      expect(
        screen.getByText(COPY.programs.requestSubmitted)
      ).toBeInTheDocument();
    });
  });

  test("shows Pending state and only permits withdrawal", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment({
      enrollment: snapshot({
        requests: [
          {
            request_id: "request-1",
            status: "Pending",
            submitted_at: "2099-03-01T00:00:00.000Z",
            decided_at: null,
          },
        ],
      }),
      scheduleRules: [],
    });

    expect(screen.getAllByText(COPY.programs.requestPending)).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: COPY.programs.requestEnroll })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.withdrawRequest })
    );
    await waitFor(() => {
      expect(mocks.withdrawEnrollmentRequest).toHaveBeenCalledWith(
        "program-1",
        "request-1"
      );
      expect(onRefresh).toHaveBeenCalledOnce();
    });
  });

  test("uses active Enrollment as terminal evidence and permits cancellation", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment({
      enrollment: snapshot({
        requests: [
          {
            request_id: "request-1",
            status: "Approved",
            submitted_at: "2099-03-01T00:00:00.000Z",
            decided_at: "2099-03-02T00:00:00.000Z",
          },
        ],
        enrollments: [
          {
            enrollment_id: "enrollment-1",
            status: "Active",
            enrolled_at: "2099-03-02T00:00:00.000Z",
            cancelled_at: null,
          },
        ],
      }),
      scheduleRules: [],
    });

    expect(screen.getAllByText(COPY.programs.enrollmentActive)).toHaveLength(2);
    expect(
      screen.queryByText(COPY.programs.requestApproved)
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    );
    await waitFor(() => {
      expect(mocks.cancelEnrollment).toHaveBeenCalledWith(
        "program-1",
        "enrollment-1"
      );
      expect(onRefresh).toHaveBeenCalledOnce();
    });
  });

  test.each([
    ["ManagerOnly", "managerOnlyNote"],
    ["Draft", "enrollmentDraftNote"],
    ["Archived", "enrollmentArchivedNote"],
  ] as const)("explains %s without an action", (mode, copyKey) => {
    renderEnrollment({
      program: program(
        mode === "ManagerOnly"
          ? { enrollment_mode: "ManagerOnly" }
          : { lifecycle: mode }
      ),
      enrollment: snapshot(),
      scheduleRules: [],
    });

    expect(screen.getByText(COPY.programs[copyKey])).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.requestEnroll })
    ).not.toBeInTheDocument();
  });

  test("recovers from duplicate conflict with centralized ProblemDetails copy", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn<() => Promise<void>>().mockResolvedValue();
    mocks.submitEnrollmentRequest.mockRejectedValue(
      new RpcError({ code: "ENROLLMENT_DUPLICATE", status: 409 })
    );
    renderEnrollment({ onRefresh });

    await user.click(
      screen.getByRole("button", { name: COPY.programs.requestEnroll })
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        COPY.programs.enrollmentDuplicate
      );
      expect(onRefresh).toHaveBeenCalledOnce();
    });
  });
});
