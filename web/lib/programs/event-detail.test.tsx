/* oxlint-disable vitest/max-expects, vitest/require-mock-type-parameters, vitest/require-top-level-describe, vitest/prefer-called-with, vitest/prefer-mock-promise-shorthand, eslint/require-await */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";
import { COPY } from "@/lib/copy";
import { EventDetail } from "@/lib/programs/event-detail";
import type { EventDetail as EventDetailData } from "@/lib/programs/program-api";

const mocks = vi.hoisted(() => ({
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  setEventAvailability: vi.fn(),
  cancelEvent: vi.fn(),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  getEvent: mocks.getEvent,
  updateEvent: mocks.updateEvent,
  setEventAvailability: mocks.setEventAvailability,
  cancelEvent: mocks.cancelEvent,
}));

const detailFixture = (
  overrides: Partial<EventDetailData> = {}
): EventDetailData => ({
  event: {
    event_id: "event-1",
    program_id: "program-1",
    program_name: "顯恩堂主日學",
    starts_at: "2026-09-12T10:00:00.000Z",
    ends_at: "2026-09-12T11:30:00.000Z",
    status: "Active",
    availability: "Active",
    source: "MANUAL",
    name: "迎新聚會",
    location: "教會禮堂",
    manual_check_in_code: "ABCD1234",
    check_in_window_opens_at: "2026-09-12T09:30:00.000Z",
    check_in_window_closes_at: "2026-09-12T12:00:00.000Z",
    cancel_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    exception: null,
  },
  leaders: [
    {
      program_id: "program-1",
      user_id: "U001",
      role_definition_id: "role-1",
      label: "課程管理身份組",
      scope_kind: "Program",
      scope_id: "program-1",
      granted_by: "U000",
      granted_at: "2026-01-01T00:00:00.000Z",
      revoked_by: null,
      revoked_at: null,
      user_name: "陳大文",
      username: "taiwan",
    },
    {
      program_id: "program-1",
      user_id: "U001",
      role_definition_id: "role-2",
      label: "另一個課程身份組",
      scope_kind: "Program",
      scope_id: "program-1",
      granted_by: "U000",
      granted_at: "2026-01-02T00:00:00.000Z",
      revoked_by: null,
      revoked_at: null,
      user_name: "陳大文",
      username: "taiwan",
    },
  ],
  participant_summary: { active_enrollments: 3, checked_in: 2 },
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EVT-01 event detail", () => {
  test("loads and projects identity, participant summary, and leaders", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await expect(
      screen.findByRole("heading", { name: "迎新聚會" })
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("教會禮堂")).toBeInTheDocument();
    expect(
      screen.getByText(
        COPY.programs.eventActiveEnrollments.replace("{count}", "3")
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.eventCheckedIn.replace("{count}", "2"))
    ).toBeInTheDocument();
    expect(screen.getAllByText("陳大文")).toHaveLength(2);
    expect(screen.getByText("課程管理身份組")).toBeInTheDocument();
    expect(screen.getByText("另一個課程身份組")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("listitem", {
        name: "陳大文，身份組：課程管理身份組",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", {
        name: "陳大文，身份組：另一個課程身份組",
      })
    ).toBeInTheDocument();
    expect(mocks.getEvent).toHaveBeenCalledWith("program-1", "event-1");
  });
  test("renders the server-projected schedule exception", async () => {
    const exception = {
      exception_id: "exception-1",
      rule_id: "rule-1",
      override_date: "2026-08-11",
      action: "RESCHEDULE" as const,
      new_start_time: "20:30",
      new_end_time: "22:00",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    mocks.getEvent.mockResolvedValue(
      detailFixture({ event: { ...detailFixture().event, exception } })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        backHref="/programs"
      />
    );
    await screen.findByRole("heading", { name: "迎新聚會" });
    expect(
      screen.getByText(
        COPY.programs.eventRescheduledBadge.replace("{time}", "20:30")
      )
    ).toBeInTheDocument();
  });

  test("back button returns to the list", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    const onBack = vi.fn();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={onBack}
        backHref="/programs"
      />
    );
    const back = await screen.findByRole("link", {
      name: COPY.programs.eventDetailBack,
    });
    expect(back).toHaveAttribute("href", "/programs");
    await userEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("edit form saves identity, schedule, and check-in window changes", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.updateEvent.mockResolvedValue({
      event: { ...detailFixture().event, name: "改名聚會" },
    });
    const user = userEvent.setup();
    const onAttentionRefresh = vi.fn();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
        onAttentionRefresh={onAttentionRefresh}
      />
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.eventEditTitle })
    );
    const nameInput = await screen.findByLabelText(COPY.programs.eventName);
    await user.clear(nameInput);
    await user.type(nameInput, "改名聚會");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditSave })
    );
    await expect(
      screen.findByText(COPY.programs.editWithAttendanceNotice)
    ).resolves.toBeInTheDocument();
    expect(onAttentionRefresh).toHaveBeenCalledOnce();
    expect(mocks.updateEvent).toHaveBeenCalledWith("program-1", "event-1", {
      name: "改名聚會",
      location: "教會禮堂",
      starts_at: "2026-09-12T10:00:00.000Z",
      ends_at: "2026-09-12T11:30:00.000Z",
      check_in_window_opens_at: "2026-09-12T09:30:00.000Z",
      check_in_window_closes_at: "2026-09-12T12:00:00.000Z",
      event_type: "崇拜",
    });
  });

  test("a window-less event can be edited without inventing a check-in window", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          name: null,
          location: null,
          check_in_window_opens_at: null,
          check_in_window_closes_at: null,
        },
      })
    );
    mocks.updateEvent.mockResolvedValue({
      event: { ...detailFixture().event, name: "改名聚會" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.eventEditTitle })
    );
    const nameInput = await screen.findByLabelText(COPY.programs.eventName);
    await user.clear(nameInput);
    await user.type(nameInput, "改名聚會");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditSave })
    );
    await expect(
      screen.findByText(COPY.programs.editWithAttendanceNotice)
    ).resolves.toBeInTheDocument();
    // Empty window inputs submit as an explicit null (clear), not as a
    // required-field block, so the edit reaches the server.
    expect(mocks.updateEvent).toHaveBeenCalledWith("program-1", "event-1", {
      name: "改名聚會",
      location: null,
      starts_at: "2026-09-12T10:00:00.000Z",
      ends_at: "2026-09-12T11:30:00.000Z",
      check_in_window_opens_at: null,
      check_in_window_closes_at: null,
      event_type: "崇拜",
    });
  });

  test("deactivation requires inline confirmation and offers Undo", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.setEventAvailability.mockResolvedValue({
      event: { ...detailFixture().event, availability: "Inactive" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    const deactivate = await screen.findByRole("button", {
      name: COPY.programs.eventAvailabilityDeactivate,
    });
    await user.click(deactivate);
    // Inline confirmation replaces the button and takes focus. The count
    // names THIS event's open operations (active check-ins), not the
    // Program-wide enrollment count (3 in the fixture).
    const confirm = await screen.findByRole("button", {
      name: COPY.programs.eventAvailabilityConfirmProceed,
    });
    expect(document.activeElement).toBe(confirm);
    expect(
      screen.getByText(
        COPY.programs.eventAvailabilityConfirmBody.replace("{count}", "2")
      )
    ).toBeInTheDocument();
    await user.click(confirm);
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.setEventAvailability).toHaveBeenCalledWith(
      "program-1",
      "event-1",
      "Inactive",
      true
    );
    const undo = screen.getByRole("button", {
      name: COPY.programs.eventAvailabilityUndo,
    });
    await user.click(undo);
    expect(mocks.setEventAvailability).toHaveBeenLastCalledWith(
      "program-1",
      "event-1",
      "Active"
    );
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityRestoredNotice)
    ).resolves.toBeInTheDocument();
  });

  test("deactivates immediately with Undo when no event operations are affected", async () => {
    // Program-wide enrollments are NOT this event's operations: with zero
    // event check-ins the deactivation is immediate even when the Program
    // has unrelated active enrollments.
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        participant_summary: { active_enrollments: 3, checked_in: 0 },
      })
    );
    mocks.setEventAvailability.mockResolvedValue({
      event: { ...detailFixture().event, availability: "Inactive" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );

    await user.click(
      await screen.findByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    );
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityConfirmProceed,
      })
    ).not.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.setEventAvailability).toHaveBeenCalledWith(
      "program-1",
      "event-1",
      "Inactive",
      false
    );
    expect(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).toBeInTheDocument();
  });

  test("an unrelated edit retires a stale availability Undo", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.setEventAvailability.mockResolvedValue({
      event: { ...detailFixture().event, availability: "Inactive" },
    });
    mocks.updateEvent.mockResolvedValue({
      event: { ...detailFixture().event, name: "改名聚會" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityConfirmProceed,
      })
    );
    expect(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).toBeInTheDocument();

    // An unrelated identity edit must not leave the stale Undo clickable —
    // it would silently re-open availability the user never asked for.
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditTitle })
    );
    const nameInput = await screen.findByLabelText(COPY.programs.eventName);
    await user.clear(nameInput);
    await user.type(nameInput, "改名聚會");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditSave })
    );
    await expect(
      screen.findByText(COPY.programs.editWithAttendanceNotice)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).not.toBeInTheDocument();
  });

  test("cancel without attendance shows the explicit confirmation and commits", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          has_attendance: false,
        } as EventDetailData["event"],
        participant_summary: { active_enrollments: 0, checked_in: 0 },
      })
    );
    mocks.cancelEvent.mockResolvedValue({
      event: { ...detailFixture().event, status: "Cancelled" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.cancelEvent })
    );
    await expect(
      screen.findByText(COPY.programs.cancelMeetingConfirmTitle)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cancelMeetingConfirmBody)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmCancel })
    );
    await expect(
      screen.findByText(COPY.programs.eventCancelledNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.cancelEvent).toHaveBeenCalledWith(
      "program-1",
      "event-1",
      null
    );
  });

  test("a cancelled detail shows the reason and stops offering management controls", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          status: "Cancelled",
          cancel_reason: "場地維修",
        },
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await expect(
      screen.findByText(
        COPY.programs.cancelledReason.replace("{reason}", "場地維修")
      )
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelEvent })
    ).not.toBeInTheDocument();
  });

  test("server confirmation refusal surfaces copy and keeps the detail", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.setEventAvailability.mockRejectedValue(
      new RpcError({
        code: "CONFIRMATION_REQUIRED",
        status: 409,
        title: "Confirmation required",
      })
    );
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityConfirmProceed,
      })
    );
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityConfirmRequired)
    ).resolves.toBeInTheDocument();
  });

  test("a server confirmation refusal on a safe-looking summary surfaces the inline confirm", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        participant_summary: { active_enrollments: 0, checked_in: 0 },
      })
    );
    mocks.setEventAvailability
      .mockRejectedValueOnce(
        new RpcError({
          code: "CONFIRMATION_REQUIRED",
          status: 409,
          title: "Confirmation required",
          open_operations: 2,
        } as ProblemDetails)
      )
      .mockResolvedValueOnce({
        event: { ...detailFixture().event, availability: "Inactive" },
      });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    );
    // The loaded summary looked safe, so the first attempt went out
    // without confirmation; the server's fresh count says otherwise.
    expect(mocks.setEventAvailability).toHaveBeenNthCalledWith(
      1,
      "program-1",
      "event-1",
      "Inactive",
      false
    );
    // The refusal must surface the inline confirm with the server's
    // fresh operation count — not a dead-end error.
    await expect(
      screen.findByText(
        COPY.programs.eventAvailabilityConfirmBody.replace("{count}", "2")
      )
    ).resolves.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.eventAvailabilityConfirmProceed,
      })
    );
    await expect(
      screen.findByText(COPY.programs.eventAvailabilityNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.setEventAvailability).toHaveBeenNthCalledWith(
      2,
      "program-1",
      "event-1",
      "Inactive",
      true
    );
    expect(
      screen.queryByText(COPY.programs.eventAvailabilityConfirmRequired)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.eventAvailabilityUndo })
    ).toBeInTheDocument();
  });

  test("undo is retired when the event is cancelled", async () => {
    let cancelled = false;
    mocks.getEvent.mockImplementation(() =>
      Promise.resolve(
        cancelled
          ? detailFixture({
              event: {
                ...detailFixture().event,
                status: "Cancelled",
                cancel_reason: "場地維修",
              },
            })
          : detailFixture({
              participant_summary: { active_enrollments: 0, checked_in: 0 },
            })
      )
    );
    mocks.setEventAvailability.mockResolvedValue({
      event: { ...detailFixture().event, availability: "Inactive" },
    });
    mocks.cancelEvent.mockImplementation(async () => {
      cancelled = true;
      return { event: { ...detailFixture().event, status: "Cancelled" } };
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    );
    await expect(
      screen.findByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).resolves.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.cancelEvent })
    );
    await user.type(
      screen.getByLabelText(COPY.programs.cancelReason),
      "場地維修"
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.confirmCancelEvent,
      })
    );
    await expect(
      screen.findByText(COPY.programs.eventCancelledNotice)
    ).resolves.toBeInTheDocument();
    // The retired record must not keep offering availability Undo.
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    ).not.toBeInTheDocument();
  });

  test("missing detail shows the load error with retry", async () => {
    mocks.getEvent.mockRejectedValue(
      new RpcError({ code: "NOT_FOUND", status: 404, title: "Not found" })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="missing"
        canManage={false}
        hash="#overview"
        onBack={() => {}}
        backHref="/programs#overview"
      />
    );
    await expect(
      screen.findByText(COPY.error.notFound)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: COPY.programs.eventDetailRecoveryTitle,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: COPY.programs.eventDetailViewProgram,
      })
    ).toHaveAttribute("href", "/programs?program=program-1#overview");
    expect(
      screen.getByRole("link", {
        name: COPY.programs.eventDetailBackToCatalog,
      })
    ).toHaveAttribute("href", "/programs");
    mocks.getEvent.mockResolvedValue(detailFixture());
    await userEvent.click(
      screen.getByRole("button", { name: COPY.error.retry })
    );
    await expect(
      screen.findByRole("heading", { name: "迎新聚會" })
    ).resolves.toBeInTheDocument();
  });
  test("management recovery preserves the scoped Program return", async () => {
    mocks.getEvent.mockRejectedValue(
      new RpcError({ code: "NOT_FOUND", status: 404, title: "Not found" })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="missing"
        canManage
        departmentId="dept-1"
        hash="#events"
        onBack={() => {}}
        backHref="/programs?mode=management&department=dept-1&program=program-1&task=events#events"
      />
    );

    await expect(
      screen.findByRole("link", {
        name: COPY.programs.eventDetailViewProgram,
      })
    ).resolves.toHaveAttribute(
      "href",
      "/programs?mode=management&department=dept-1&program=program-1&task=events#events"
    );
  });

  test("non-managers see the read-only projection without action controls", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await screen.findByRole("heading", { name: "迎新聚會" });
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelEvent })
    ).not.toBeInTheDocument();
  });

  test("a nameless event falls back to the COPY-composed program title", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: { ...detailFixture().event, name: null },
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await expect(
      screen.findByRole("heading", { name: "顯恩堂主日學 聚會" })
    ).resolves.toBeInTheDocument();
  });

  // 085-04 (#323) participant projection — Spec 085 US 23-24.
  test("participant projection shows badge + title/program/when/where + instructions + CTA", async () => {
    const now = Date.now();
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          check_in_window_opens_at: new Date(now - 30 * 60_000).toISOString(),
          check_in_window_closes_at: new Date(now + 90 * 60_000).toISOString(),
        } as EventDetailData["event"],
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );

    // 可簽到 badge when the check-in window is currently open.
    await expect(
      screen.findByRole("status", {
        name: COPY.programs.checkInAvailable,
      })
    ).resolves.toBeInTheDocument();

    // Title + program name.
    expect(
      screen.getByRole("heading", { name: "迎新聚會" })
    ).toBeInTheDocument();
    expect(screen.getByText("顯恩堂主日學")).toBeInTheDocument();

    // When / where — icon-led card using the shared short HK formatter.
    expect(screen.getByText("9月12日（六）晚上 6:00–7:30")).toBeInTheDocument();
    expect(screen.getByText("教會禮堂")).toBeInTheDocument();
    const infoCard = screen.getByText("教會禮堂").closest("article");
    expect(infoCard).not.toBeNull();
    const icons = infoCard?.querySelectorAll("svg") ?? [];
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon).toHaveAttribute("viewBox", "0 0 24 24");
      expect(icon.querySelector("[stroke-width='1.8']")).not.toBeNull();
    }
    expect(
      screen.queryByText(COPY.programs.detailEventTime)
    ).not.toBeInTheDocument();

    // Check-in instructions heading + body.
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: COPY.programs.checkInInstructionsHeading,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.eventInstructions)
    ).toBeInTheDocument();

    // 前往掃描 CTA is sticky, full-width, and points at this event.
    const cta = screen.getByRole("link", {
      name: COPY.programs.goToScan,
    });
    expect(cta).toHaveAttribute("href", "/scanner?event=event-1");
    expect(cta).toHaveAttribute("data-action-state", "available");
    expect(cta.parentElement).toHaveAttribute("data-action-bar");

    // No management controls.
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityDeactivate,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelEvent })
    ).not.toBeInTheDocument();
  });

  test("participant projection omits the 可簽到 badge when the window is closed", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          check_in_window_opens_at: "2027-01-01T09:30:00.000Z",
          check_in_window_closes_at: "2027-01-01T12:00:00.000Z",
        } as EventDetailData["event"],
      })
    );
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await screen.findByRole("heading", { name: "迎新聚會" });
    expect(
      screen.queryByRole("status", { name: COPY.programs.checkInAvailable })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/簽到時間尚未開始/u)).toBeInTheDocument();
    const closedCta = screen.getByRole("link", {
      name: COPY.programs.goToScan,
    });
    expect(closedCta).toHaveAttribute("data-action-state", "closed");
  });

  test("participant projection back uses the supplied onBack callback (history.back wrapper)", async () => {
    const onBack = vi.fn<() => void>();
    mocks.getEvent.mockResolvedValue(detailFixture());
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={onBack}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("link", { name: COPY.programs.backToOrigin })
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("086-03 editing a meeting with attendance succeeds and acknowledges the recorded change", async () => {
    const meeting = {
      ...detailFixture().event,
      has_attendance: true,
      name: "已有出席聚會",
    } as EventDetailData["event"];
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: meeting,
        participant_summary: { active_enrollments: 2, checked_in: 1 },
      })
    );
    mocks.updateEvent.mockResolvedValue({
      event: { ...meeting, name: "更正後聚會" },
    });
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(await screen.findByRole("button", { name: /編輯聚會/u }));
    const nameInput = screen.getByLabelText(COPY.programs.eventName);
    await user.clear(nameInput);
    await user.type(nameInput, "更正後聚會");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventEditSave })
    );
    await expect(
      screen.findByText(COPY.programs.editWithAttendanceNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.updateEvent).toHaveBeenCalled();
  });

  test("086-03 cancelling a meeting with attendance is refused without calling cancel", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          has_attendance: true,
        } as EventDetailData["event"],
        participant_summary: { active_enrollments: 2, checked_in: 1 },
      })
    );
    const user = userEvent.setup();
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.cancelEvent })
    );
    await expect(
      screen.findByText(COPY.programs.cancelBlockedWithAttendance)
    ).resolves.toBeInTheDocument();
    expect(mocks.cancelEvent).not.toHaveBeenCalled();
  });

  test("086-03 cancelling a meeting without attendance shows explicit confirm and supports keep or commit", async () => {
    let cancelled = false;
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        event: {
          ...detailFixture().event,
          has_attendance: false,
          status: cancelled ? "Cancelled" : "Active",
        } as EventDetailData["event"],
        participant_summary: {
          active_enrollments: 0,
          checked_in: 0,
        },
      })
    );
    mocks.cancelEvent.mockImplementation(async () => {
      cancelled = true;
      return { event: { ...detailFixture().event, status: "Cancelled" } };
    });
    const user = userEvent.setup();
    const { rerender } = render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.cancelEvent })
    );
    await expect(
      screen.findByText(COPY.programs.cancelMeetingConfirmTitle)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cancelMeetingConfirmBody)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.keepMeeting })
    );
    expect(mocks.cancelEvent).not.toHaveBeenCalled();
    rerender(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
        backHref="/programs"
      />
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.cancelEvent })
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmCancel })
    );
    await expect(
      screen.findByText(COPY.programs.eventCancelledNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.cancelEvent).toHaveBeenCalledWith(
      "program-1",
      "event-1",
      null
    );
    expect(cancelled).toBeTruthy();
  });
});
