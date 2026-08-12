import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RpcError, type ProblemDetails } from "@/lib/api";
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
      granted_by: "U000",
      granted_at: "2026-01-01T00:00:00.000Z",
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
    expect(screen.getByText("陳大文")).toBeInTheDocument();
    expect(mocks.getEvent).toHaveBeenCalledWith("program-1", "event-1");
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
      />
    );
    const back = await screen.findByRole("button", {
      name: COPY.programs.eventDetailBack,
    });
    await userEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("edit form saves identity, schedule, and check-in window changes", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
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
      screen.findByText(COPY.programs.eventSavedNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.updateEvent).toHaveBeenCalledWith("program-1", "event-1", {
      name: "改名聚會",
      location: "教會禮堂",
      starts_at: "2026-09-12T10:00:00.000Z",
      ends_at: "2026-09-12T11:30:00.000Z",
      check_in_window_opens_at: "2026-09-12T09:30:00.000Z",
      check_in_window_closes_at: "2026-09-12T12:00:00.000Z",
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
      />
    );
    const deactivate = await screen.findByRole("button", {
      name: COPY.programs.eventAvailabilityDeactivate,
    });
    await user.click(deactivate);
    // Inline confirmation replaces the button and takes focus.
    const confirm = await screen.findByRole("button", {
      name: COPY.programs.eventAvailabilityConfirmProceed,
    });
    expect(document.activeElement).toBe(confirm);
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
  test("deactivates immediately with Undo when no operations are affected", async () => {
    mocks.getEvent.mockResolvedValue(
      detailFixture({
        participant_summary: { active_enrollments: 0, checked_in: 0 },
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
      screen.findByText(COPY.programs.eventSavedNotice)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.eventAvailabilityUndo,
      })
    ).not.toBeInTheDocument();
  });

  test("cancel requires a reason and shows the cancelled state", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    mocks.cancelEvent.mockResolvedValue({
      event: { ...detailFixture().event, status: "Cancelled" },
    });
    const user = userEvent.setup();
    const { rerender } = render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage
        onBack={() => {}}
      />
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.cancelEvent })
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmCancelEvent })
    );
    // Empty reason is refused client-side before any server call.
    expect(mocks.cancelEvent).not.toHaveBeenCalled();
    const reason = await screen.findByLabelText(COPY.programs.cancelReason);
    await user.type(reason, "場地維修");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmCancelEvent })
    );
    await expect(
      screen.findByText(COPY.programs.eventCancelledNotice)
    ).resolves.toBeInTheDocument();
    expect(mocks.cancelEvent).toHaveBeenCalledWith(
      "program-1",
      "event-1",
      "場地維修"
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
        canManage
        onBack={() => {}}
      />
    );
    await expect(
      screen.findByText(COPY.error.notFound)
    ).resolves.toBeInTheDocument();
    mocks.getEvent.mockResolvedValue(detailFixture());
    await userEvent.click(
      screen.getByRole("button", { name: COPY.error.retry })
    );
    await expect(
      screen.findByRole("heading", { name: "迎新聚會" })
    ).resolves.toBeInTheDocument();
  });

  test("non-managers see the read-only projection without action controls", async () => {
    mocks.getEvent.mockResolvedValue(detailFixture());
    render(
      <EventDetail
        programId="program-1"
        eventId="event-1"
        canManage={false}
        onBack={() => {}}
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
});
