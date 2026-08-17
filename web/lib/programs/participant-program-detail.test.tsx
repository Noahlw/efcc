/* oxlint-disable vitest/require-top-level-describe vitest/max-expects vitest/prefer-called-exactly-once-with -- shared fixture hooks cover all detail describes; contract tests assert the full visible surface. */
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { ParticipantProgramDetail } from "@/lib/programs/participant-program-detail";
import type {
  DepartmentSummary,
  ParticipantProgramDetail as ParticipantProgramDetailData,
  ParticipantEnrollmentSnapshot,
  ProgramSummary,
} from "@/lib/programs/program-api";

const mocks = vi.hoisted(() => {
  const router = {
    replace: vi.fn<(href: string) => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<(href: string) => void>(),
    prefetch: vi.fn<(href: string, options?: unknown) => void>(),
  };
  return {
    getParticipantProgramDetail:
      vi.fn<(programId: string) => Promise<ParticipantProgramDetailData>>(),
    replace: router.replace,
    router,
  };
});

vi.mock(import("@/lib/programs/program-api"), () => ({
  getParticipantProgramDetail: mocks.getParticipantProgramDetail,
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
}));

const department = (): DepartmentSummary => ({
  department_id: "dept-1",
  code: "D1",
  name: "青年事工",
  description: null,
  lifecycle: "Active",
  display_order: 0,
});

const program = (
  programId: string,
  name: string,
  overrides: Partial<ProgramSummary> = {}
): ProgramSummary => ({
  program_id: programId,
  department_id: "dept-1",
  name,
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

const detailFixture = (
  overrides: Partial<ParticipantProgramDetailData> = {}
): ParticipantProgramDetailData => ({
  program: program("program-1", "青年門徒小組"),
  department: department(),
  schedule_rules: [
    {
      rule_id: "rule-1",
      recurrence: "WEEKLY",
      day_of_week: 3,
      month_day: null,
      start_time: "19:30",
      end_time: "21:00",
    },
  ],
  events: [
    {
      event_id: "event-1",
      program_id: "program-1",
      starts_at: "2099-03-04T11:30:00.000Z",
      ends_at: "2099-03-04T13:00:00.000Z",
      status: "Active",
      source: "SCHEDULE",
      name: "第三課聚會",
      location: "二樓禮堂",
    },
    {
      event_id: "event-2",
      program_id: "program-1",
      starts_at: "2099-03-11T11:30:00.000Z",
      ends_at: "2099-03-11T13:00:00.000Z",
      status: "Active",
      source: "SCHEDULE",
      name: "第四課聚會",
      location: "二樓禮堂",
    },
  ],
  enrollment: snapshot(),
  enrollment_access: "Eligible",
  ...overrides,
});

function renderDetail(
  props: Partial<Parameters<typeof ParticipantProgramDetail>[0]> = {}
) {
  const onBack = vi.fn<() => void>();
  const onOpenEvent = vi.fn<(eventId: string) => void>();
  const view = render(
    <ParticipantProgramDetail
      programId={props.programId ?? "program-1"}
      onBack={props.onBack ?? onBack}
      canManage={props.canManage ?? false}
      onManagement={props.onManagement ?? vi.fn<() => void>()}
      onOpenEvent={props.onOpenEvent ?? onOpenEvent}
      conflictProgramName={props.conflictProgramName}
    />
  );
  return { onBack, onOpenEvent, view };
}

beforeEach(() => {
  mocks.getParticipantProgramDetail.mockReset();
  mocks.replace.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PUI-03 participant Program detail", () => {
  test("renders purpose, status tag, next-meeting card, schedule rows, and the back action", async () => {
    mocks.getParticipantProgramDetail.mockResolvedValue(detailFixture());
    const { onBack, onOpenEvent } = renderDetail();

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    const heading = await screen.findByRole("heading", {
      name: "青年門徒小組",
    });
    expect(heading).toBeInTheDocument();
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(
      screen.getByRole("button", { name: COPY.programs.detailBack })
    ).toHaveTextContent(/^課程$/u);
    expect(
      screen.getByText("為青年建立穩定的同行與學習空間。")
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.programs.statusEligible)).toBeInTheDocument();

    const nextCard = screen.getByRole("article", { name: "第三課聚會" });
    expect(
      within(nextCard).getByText(COPY.programs.nextMeeting)
    ).toBeInTheDocument();
    expect(
      within(nextCard).getByText(/2099\/03\/04 19:30/u)
    ).toBeInTheDocument();
    expect(within(nextCard).getByText("二樓禮堂")).toBeInTheDocument();
    await userEvent.click(
      within(nextCard).getByRole("button", {
        name: COPY.programs.viewEventDetail,
      })
    );
    expect(onOpenEvent).toHaveBeenCalledOnce();
    expect(onOpenEvent).toHaveBeenCalledWith("event-1");

    expect(screen.getByText("每週三 19:30–21:00")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.detailBack })
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("renders the member's own enrollment history", async () => {
    mocks.getParticipantProgramDetail.mockResolvedValue(
      detailFixture({
        enrollment: snapshot({
          requests: [
            {
              request_id: "request-1",
              status: "Pending",
              submitted_at: "2099-03-01T00:00:00.000Z",
              decided_at: null,
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
      })
    );
    renderDetail();

    await screen.findByRole("heading", { name: "青年門徒小組" });
    const history = screen.getByRole("list", {
      name: COPY.programs.enrollmentHistory,
    });
    expect(
      within(history).getByText(COPY.programs.requestPending)
    ).toBeInTheDocument();
    expect(
      within(history).getByText(COPY.programs.enrollmentCancelled)
    ).toBeInTheDocument();
  });

  const enrollmentFor = (state: string): ParticipantEnrollmentSnapshot => {
    switch (state) {
      case "active": {
        return snapshot({
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
      }
      case "pending": {
        return snapshot({
          requests: [
            {
              request_id: "request-1",
              status: "Pending",
              submitted_at: "2099-03-01T00:00:00.000Z",
              decided_at: null,
            },
          ],
        });
      }
      case "withdrawn": {
        return snapshot({
          requests: [
            {
              request_id: "request-1",
              status: "Withdrawn",
              submitted_at: "2099-03-01T00:00:00.000Z",
              decided_at: "2099-03-02T00:00:00.000Z",
            },
          ],
        });
      }
      case "rejected": {
        return snapshot({
          requests: [
            {
              request_id: "request-1",
              status: "Rejected",
              submitted_at: "2099-03-01T00:00:00.000Z",
              decided_at: "2099-03-02T00:00:00.000Z",
            },
          ],
        });
      }
      case "cancelled": {
        return snapshot({
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
        });
      }
      default: {
        return snapshot();
      }
    }
  };

  test.each([
    ["active", COPY.programs.statusActive],
    ["pending", COPY.programs.statusPending],
    ["withdrawn", COPY.programs.statusWithdrawn],
    ["rejected", COPY.programs.statusRejected],
    ["cancelled", COPY.programs.statusCancelled],
  ] as const)(
    "shows the %s status tag from the real enrollment snapshot",
    async (state, tag) => {
      mocks.getParticipantProgramDetail.mockResolvedValue(
        detailFixture({ enrollment: enrollmentFor(state) })
      );
      renderDetail();

      await screen.findByRole("heading", { name: "青年門徒小組" });
      expect(screen.getAllByText(tag).length).toBeGreaterThan(0);
    }
  );

  test("ManagerOnly renders the 由同工安排 tag, read-only note, and no self-enroll action", async () => {
    mocks.getParticipantProgramDetail.mockResolvedValue(
      detailFixture({
        program: program("program-1", "敬拜隊訓練", {
          enrollment_mode: "ManagerOnly",
        }),
      })
    );
    renderDetail();

    await screen.findByRole("heading", { name: "敬拜隊訓練" });
    expect(
      screen.getByText(COPY.programs.statusManagerOnly)
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.programs.managerOnlyNote)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.enroll })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.withdrawRequest })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelEnrollment })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.reEnroll })
    ).not.toBeInTheDocument();
  });

  test("Archived renders the 已封存 tag, archived note, and no interactive action", async () => {
    mocks.getParticipantProgramDetail.mockResolvedValue(
      detailFixture({
        program: program("program-1", "青年門徒小組", {
          lifecycle: "Archived",
        }),
      })
    );
    renderDetail();

    await screen.findByRole("heading", { name: "青年門徒小組" });
    expect(screen.getByText(COPY.programs.statusArchived)).toBeInTheDocument();
    expect(screen.getByText(COPY.programs.archivedNote)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.enroll })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.reEnroll })
    ).not.toBeInTheDocument();
  });

  test("conflict note renders as a non-blocking hint that never hides the enroll action", async () => {
    mocks.getParticipantProgramDetail.mockResolvedValue(detailFixture());
    renderDetail({ conflictProgramName: "敬拜隊訓練" });

    await screen.findByRole("heading", { name: "青年門徒小組" });
    expect(
      screen.getByText(
        COPY.programs.conflictNote.replace("{program}", "敬拜隊訓練")
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.enroll })
    ).toBeInTheDocument();
  });

  test("hides the meeting venue row when the next event has no location", async () => {
    mocks.getParticipantProgramDetail.mockResolvedValue(
      detailFixture({
        events: [
          {
            event_id: "event-1",
            program_id: "program-1",
            starts_at: "2099-03-04T11:30:00.000Z",
            ends_at: "2099-03-04T13:00:00.000Z",
            status: "Active",
            source: "SCHEDULE",
            name: "第三課聚會",
            location: null,
          },
        ],
      })
    );
    renderDetail();

    await screen.findByRole("heading", { name: "青年門徒小組" });
    const nextCard = screen.getByRole("article", { name: "第三課聚會" });
    expect(within(nextCard).getByText("第三課聚會")).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.detailEventLocation)
    ).not.toBeInTheDocument();
  });

  test("renders a privacy-preserving unavailable state for missing or unauthorized detail", async () => {
    mocks.getParticipantProgramDetail.mockRejectedValue(
      new RpcError({ code: "NOT_FOUND", status: 404 })
    );
    const user = userEvent.setup();
    const { onBack } = renderDetail({ programId: "hidden-program" });

    await expect(
      screen.findByRole("heading", { name: COPY.programs.detailUnavailable })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.detailUnavailableHint)
    ).toBeInTheDocument();
    expect(screen.queryByText("hidden-program")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.detailBack })
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("retries recoverable failures and ignores stale detail responses", async () => {
    const stale = Promise.withResolvers<ParticipantProgramDetailData>();
    mocks.getParticipantProgramDetail
      .mockReturnValueOnce(stale.promise)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(detailFixture());
    const { view } = renderDetail();
    view.rerender(
      <ParticipantProgramDetail
        programId="program-2"
        onBack={vi.fn<() => void>()}
        canManage={false}
        onManagement={vi.fn<() => void>()}
        onOpenEvent={vi.fn<(eventId: string) => void>()}
      />
    );
    stale.resolve(detailFixture({ program: program("program-1", "過期內容") }));
    await expect(
      screen.findByRole("heading", { name: COPY.programs.detailLoadError })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "過期內容" })
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.detailRetry })
    );
    await expect(
      screen.findByRole("heading", { name: "青年門徒小組" })
    ).resolves.toBeInTheDocument();
    view.unmount();
  });

  test("returns expired sessions to login after remembering the direct link", async () => {
    mocks.getParticipantProgramDetail.mockRejectedValue(
      new RpcError({ code: "AUTH_REQUIRED", status: 401 })
    );
    renderDetail();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/");
    });
  });
});
