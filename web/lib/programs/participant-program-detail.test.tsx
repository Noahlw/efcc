/* oxlint-disable vitest/require-top-level-describe -- shared fixture hooks cover all detail describes */
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
    },
    {
      event_id: "event-2",
      program_id: "program-1",
      starts_at: "2099-03-11T11:30:00.000Z",
      ends_at: "2099-03-11T13:00:00.000Z",
      status: "Active",
      source: "SCHEDULE",
    },
  ],
  enrollment: null,
  enrollment_access: "Eligible",
  ...overrides,
});

function renderDetail(
  props: Partial<Parameters<typeof ParticipantProgramDetail>[0]> = {}
) {
  const onBack = vi.fn<() => void>();
  const view = render(
    <ParticipantProgramDetail
      programId={props.programId ?? "program-1"}
      onBack={props.onBack ?? onBack}
      canManage={props.canManage ?? false}
      onManagement={props.onManagement ?? vi.fn<() => void>()}
    />
  );
  return { onBack, view };
}

beforeEach(() => {
  mocks.getParticipantProgramDetail.mockReset();
  mocks.replace.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PUI-03 participant Program detail", () => {
  test("loads purpose, explicit behavior, lifecycle, participation, context, schedule, and nearest Event", async () => {
    mocks.getParticipantProgramDetail.mockResolvedValue(detailFixture());
    const { onBack } = renderDetail();

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    const heading = await screen.findByRole("heading", {
      name: "青年門徒小組",
    });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveFocus();
    expect(screen.getByText("為青年建立穩定的同行與學習空間。"));
    expect(screen.getByText(/Recurring/u)).toBeInTheDocument();
    expect(screen.getByText(/Active/u)).toBeInTheDocument();
    expect(screen.getByText(/MemberRequest/u)).toBeInTheDocument();
    expect(screen.getByText("青年事工")).toBeInTheDocument();
    expect(screen.getByText("門徒訓練")).toBeInTheDocument();
    expect(screen.getByText("每週三 19:30–21:00")).toBeInTheDocument();
    const events = screen.getByRole("region", { name: "近期活動" });
    expect(within(events).getByText(/19:30/u)).toBeInTheDocument();
    expect(within(events).getByText(/2099/u)).toBeInTheDocument();
    expect(within(events).getAllByRole("listitem")).toHaveLength(1);
    expect(
      screen.queryByText(/check_in_token|manual_check_in_code/iu)
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.detailBack })
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("keeps multiple OneOff Events visible and labels manager-only availability", async () => {
    mocks.getParticipantProgramDetail.mockResolvedValue(
      detailFixture({
        program: program("program-1", "特別聚會", {
          behavior_type: "OneOff",
          lifecycle: "Draft",
          enrollment_mode: "ManagerOnly",
        }),
        schedule_rules: [],
        events: [
          {
            event_id: "event-1",
            program_id: "program-1",
            starts_at: "2099-04-01T10:00:00.000Z",
            ends_at: "2099-04-01T11:00:00.000Z",
            status: "Active",
            source: "MANUAL",
          },
          {
            event_id: "event-2",
            program_id: "program-1",
            starts_at: "2099-04-08T10:00:00.000Z",
            ends_at: "2099-04-08T11:00:00.000Z",
            status: "Active",
            source: "MANUAL",
          },
        ],
      })
    );
    renderDetail();

    await screen.findByRole("heading", { name: "特別聚會" });
    expect(screen.getByText(/OneOff/u)).toBeInTheDocument();
    expect(screen.getByText(/Draft/u)).toBeInTheDocument();
    expect(screen.getByText(/ManagerOnly/u)).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: COPY.programs.detailEvents })
      ).getAllByRole("listitem")
    ).toHaveLength(2);
    expect(
      screen.getByText(COPY.programs.detailScheduleNone)
    ).toBeInTheDocument();
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
