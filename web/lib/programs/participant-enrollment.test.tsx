/* oxlint-disable vitest/require-top-level-describe, vitest/max-expects, vitest/require-mock-type-parameters -- top-level hooks mirror the participant panel suite; untyped module mocks match the program-api module signature shape */
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

import styles from "@/app/programs/programs.module.css";

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

const pendingSnapshot = () =>
  snapshot({
    requests: [
      {
        request_id: "request-1",
        status: "Pending",
        submitted_at: "2099-03-01T00:00:00.000Z",
        decided_at: null,
      },
    ],
  });

const activeSnapshot = () =>
  snapshot({
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
      enrollmentAccess={overrides.enrollmentAccess ?? "Eligible"}
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

const setOnline = (online: boolean) => {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
};

beforeEach(() => {
  mocks.cancelEnrollment.mockReset().mockResolvedValue({});
  mocks.submitEnrollmentRequest.mockReset().mockResolvedValue({});
  mocks.withdrawEnrollmentRequest.mockReset().mockResolvedValue({});
  setOnline(true);
});

afterEach(() => {
  cleanup();
});

describe("PUI-04 participant Enrollment", () => {
  test("eligible member selects 報名 and sees the pending toast", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment();

    expect(
      screen.getAllByRole("button", { name: COPY.programs.enroll })
    ).toHaveLength(1);
    expect(
      screen.getByText(COPY.programs.enrollmentScheduleAdvisory)
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.enroll })
    );
    await waitFor(() => {
      expect(mocks.submitEnrollmentRequest).toHaveBeenCalledWith("program-1");
      expect(onRefresh).toHaveBeenCalledOnce();
      expect(
        screen.getByText(COPY.programs.requestSubmitted)
      ).toBeInTheDocument();
    });
  });

  test("pending member confirms the withdraw dialog to cancel the request", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment({
      enrollment: pendingSnapshot(),
      scheduleRules: [],
    });

    expect(
      screen.getByText(COPY.programs.requestPendingHint)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.withdrawRequest })
        .parentElement
    ).toHaveClass(styles.stickyActionBar);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.withdrawRequest })
    );

    const dialog = screen.getByRole("dialog", {
      name: COPY.programs.withdrawConfirmTitle,
    });
    expect(
      within(dialog).getByText(COPY.programs.withdrawConfirmBody)
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", {
        name: COPY.programs.withdrawConfirmAccept,
      })
    );

    await waitFor(() => {
      expect(mocks.withdrawEnrollmentRequest).toHaveBeenCalledWith(
        "program-1",
        "request-1"
      );
      expect(onRefresh).toHaveBeenCalledOnce();
      expect(
        screen.getByText(COPY.programs.requestWithdrawnNotice)
      ).toBeInTheDocument();
    });
  });

  test("dismissing the withdraw dialog keeps the request intact", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment({
      enrollment: pendingSnapshot(),
      scheduleRules: [],
    });

    await user.click(
      screen.getByRole("button", { name: COPY.programs.withdrawRequest })
    );
    const dialog = screen.getByRole("dialog", {
      name: COPY.programs.withdrawConfirmTitle,
    });
    await user.click(
      within(dialog).getByRole("button", { name: COPY.programs.cancelRevoke })
    );

    expect(
      screen.queryByRole("dialog", { name: COPY.programs.withdrawConfirmTitle })
    ).not.toBeInTheDocument();
    expect(mocks.withdrawEnrollmentRequest).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(
      screen.getByText(COPY.programs.requestPendingHint)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.withdrawRequest })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.requestWithdrawnNotice)
    ).not.toBeInTheDocument();
  });

  test("active member confirms the exit dialog to cancel the enrollment", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment({
      enrollment: activeSnapshot(),
      scheduleRules: [],
    });

    expect(
      screen.getByText(COPY.programs.enrollmentActiveHint)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
        .parentElement
    ).toHaveClass(styles.stickyActionBar);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    );

    const dialog = screen.getByRole("dialog", {
      name: COPY.programs.cancelConfirmTitle,
    });
    expect(
      within(dialog).getByText(COPY.programs.cancelConfirmBody)
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", {
        name: COPY.programs.cancelConfirmAccept,
      })
    );

    await waitFor(() => {
      expect(mocks.cancelEnrollment).toHaveBeenCalledWith(
        "program-1",
        "enrollment-1"
      );
      expect(onRefresh).toHaveBeenCalledOnce();
      expect(
        screen.getByText(COPY.programs.enrollmentCancelledNotice)
      ).toBeInTheDocument();
    });
  });

  test("dismissing the exit dialog keeps the enrollment intact", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment({
      enrollment: activeSnapshot(),
      scheduleRules: [],
    });

    await user.click(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    );
    const dialog = screen.getByRole("dialog", {
      name: COPY.programs.cancelConfirmTitle,
    });
    await user.click(
      within(dialog).getByRole("button", { name: COPY.programs.cancelRevoke })
    );

    expect(mocks.cancelEnrollment).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(
      screen.getByText(COPY.programs.enrollmentActiveHint)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.enrollmentCancelledNotice)
    ).not.toBeInTheDocument();
  });

  test("withdrawn member re-submits via 重新報名 and returns to pending", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment({
      enrollment: snapshot({
        requests: [
          {
            request_id: "request-1",
            status: "Withdrawn",
            submitted_at: "2099-03-01T00:00:00.000Z",
            decided_at: "2099-03-02T00:00:00.000Z",
          },
        ],
      }),
      scheduleRules: [],
    });

    expect(
      screen.getByText(COPY.programs.requestWithdrawnHint)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.reEnroll })
    );
    await waitFor(() => {
      expect(mocks.submitEnrollmentRequest).toHaveBeenCalledWith("program-1");
      expect(onRefresh).toHaveBeenCalledOnce();
      expect(
        screen.getByText(COPY.programs.requestSubmitted)
      ).toBeInTheDocument();
    });
  });

  test("member with a cancelled enrollment re-submits via 重新報名", async () => {
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
            status: "Cancelled",
            enrolled_at: "2099-03-02T00:00:00.000Z",
            cancelled_at: "2099-03-03T00:00:00.000Z",
          },
        ],
      }),
      scheduleRules: [],
    });

    expect(
      screen.getByText(COPY.programs.enrollmentCancelledHint)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.reEnroll })
    );
    await waitFor(() => {
      expect(mocks.submitEnrollmentRequest).toHaveBeenCalledWith("program-1");
      expect(onRefresh).toHaveBeenCalledOnce();
      expect(
        screen.getByText(COPY.programs.requestSubmitted)
      ).toBeInTheDocument();
    });
  });

  test("rejected member re-submits via 重新報名", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment({
      enrollment: snapshot({
        requests: [
          {
            request_id: "request-1",
            status: "Rejected",
            submitted_at: "2099-03-01T00:00:00.000Z",
            decided_at: "2099-03-02T00:00:00.000Z",
          },
        ],
      }),
      scheduleRules: [],
    });

    expect(
      screen.getByText(COPY.programs.requestRejectedHint)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.reEnroll })
    );
    await waitFor(() => {
      expect(mocks.submitEnrollmentRequest).toHaveBeenCalledWith("program-1");
      expect(onRefresh).toHaveBeenCalledOnce();
      expect(
        screen.getByText(COPY.programs.requestSubmitted)
      ).toBeInTheDocument();
    });
  });

  test.each([
    ["ManagerOnly", "managerOnlyNote"],
    ["Draft", "enrollmentDraftNote"],
    ["Archived", "archivedNote"],
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
      screen.queryByRole("button", { name: COPY.programs.enroll })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.reEnroll })
    ).not.toBeInTheDocument();
  });

  test("explains an ineligible MemberRequest without an action", () => {
    renderEnrollment({
      enrollment: null,
      enrollmentAccess: "Ineligible",
      scheduleRules: [],
    });

    expect(
      screen.getByText(COPY.programs.enrollmentIneligibleNote)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.enroll })
    ).not.toBeInTheDocument();
  });

  test("explains an unavailable enrollment module before ManagerOnly copy", () => {
    renderEnrollment({
      program: program({ enrollment_mode: "ManagerOnly" }),
      enrollment: null,
      enrollmentAccess: "Unavailable",
      scheduleRules: [],
    });

    expect(
      screen.getByText(COPY.programs.enrollmentUnavailableNote)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.enroll })
    ).not.toBeInTheDocument();
  });

  test("offline action shows an inline error, makes no API call, and leaves state unchanged; retry online succeeds", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderEnrollment();

    setOnline(false);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.enroll })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        COPY.programs.enrollmentOfflineError
      );
    });
    expect(mocks.submitEnrollmentRequest).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(
      screen.queryByText(COPY.programs.requestSubmitted)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.enroll })
    ).toBeInTheDocument();

    setOnline(true);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.enroll })
    );
    await waitFor(() => {
      expect(mocks.submitEnrollmentRequest).toHaveBeenCalledWith("program-1");
      expect(onRefresh).toHaveBeenCalledOnce();
      expect(
        screen.getByText(COPY.programs.requestSubmitted)
      ).toBeInTheDocument();
    });
  });

  test("recovers from duplicate conflict with centralized ProblemDetails copy", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn<() => Promise<void>>().mockResolvedValue();
    mocks.submitEnrollmentRequest.mockRejectedValue(
      new RpcError({ code: "ENROLLMENT_DUPLICATE", status: 409 })
    );
    renderEnrollment({ onRefresh });

    await user.click(
      screen.getByRole("button", { name: COPY.programs.enroll })
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        COPY.programs.enrollmentDuplicate
      );
      expect(onRefresh).toHaveBeenCalledOnce();
    });
  });

  test("keeps stale enrollment-mode errors on localized copy", async () => {
    const user = userEvent.setup();
    mocks.submitEnrollmentRequest.mockRejectedValue(
      new RpcError({
        code: "VALIDATION",
        status: 422,
        detail:
          "Program internal-program-id does not accept enrollment mode MemberRequest.",
      })
    );
    renderEnrollment();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.enroll })
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        COPY.programs.enrollmentUnavailableNote
      );
      expect(
        screen.queryByText(/internal-program-id/u)
      ).not.toBeInTheDocument();
    });
  });
});
