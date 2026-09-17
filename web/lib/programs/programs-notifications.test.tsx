import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";
import type { ManagementNotifications } from "@/lib/programs/program-api";
import { ProgramsNotifications } from "@/lib/programs/programs-notifications";
import type {
  ManagementNotificationState,
  ProgramsNotificationsProps,
} from "@/lib/programs/programs-notifications";

const notification: ManagementNotifications["items"][number] = {
  kind: "enrollment",
  source_key: "enrollment:program-1",
  source_revision: "v1:2:2026-08-14T10:00:00.000Z",
  read: false,
  actionable: true,
  count: 2,
  latest_submitted_at: "2026-08-14T10:00:00.000Z",
  program_id: "program-1",
  program_name: "青年團契",
  department_id: "dept-1",
  department_name: "青年事工",
};

const eventNotification: ManagementNotifications["items"][number] = {
  kind: "event",
  source_key: "event:event-1",
  source_revision: "v1:Active:Inactive:2026-08-14T11:00:00.000Z",
  read: false,
  actionable: true,
  event_id: "event-1",
  program_id: "program-1",
  program_name: "青年團契",
  department_id: "dept-1",
  department_name: "青年事工",
  starts_at: "2026-08-21T11:30:00.000Z",
  status: "Active",
  availability: "Inactive",
  name: "青年團契週會",
  updated_at: "2026-08-14T11:00:00.000Z",
};

const readyState = (
  overrides: Partial<ManagementNotifications> = {}
): ManagementNotificationState => ({
  kind: "ready",
  notifications: {
    items: [notification],
    unread_count: 1,
    has_more: false,
    ...overrides,
  },
});

describe("management notification control", () => {
  afterEach(cleanup);

  test("keeps the compact bell small without marking unread sources on open", async () => {
    const user = userEvent.setup();
    const onMarkRead = vi.fn<ProgramsNotificationsProps["onMarkRead"]>();

    render(
      <ProgramsNotifications
        state={readyState()}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={onMarkRead}
      />
    );

    const trigger = screen.getByRole("button", {
      name: COPY.programs.notificationBellTitle,
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: COPY.programs.notificationsTitle,
      })
    ).toHaveAttribute("data-feed-state", "ready");
    expect(onMarkRead).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText(COPY.programs.notificationsUnread)
    ).toBeInTheDocument();
  });

  test("marks only loaded unread items after an explicit Mark All action", async () => {
    const user = userEvent.setup();
    const onMarkRead = vi
      .fn<ProgramsNotificationsProps["onMarkRead"]>()
      .mockResolvedValue();
    render(
      <ProgramsNotifications
        state={readyState({
          items: [notification, eventNotification],
          unread_count: 2,
        })}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={onMarkRead}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.notificationBellTitle,
      })
    );
    expect(onMarkRead).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: COPY.notices.noticesMarkAllRead })
    );

    await waitFor(() => expect(onMarkRead).toHaveBeenCalledOnce());
    expect(onMarkRead).toHaveBeenCalledWith([
      expect.objectContaining({
        source_key: notification.source_key,
        source_revision: notification.source_revision,
      }),
      expect.objectContaining({
        source_key: eventNotification.source_key,
        source_revision: eventNotification.source_revision,
      }),
    ]);
    expect(
      screen.queryAllByLabelText(COPY.programs.notificationsUnread)
    ).toHaveLength(0);
  });

  test("keeps Mark All busy until the read write settles", async () => {
    const user = userEvent.setup();
    const { promise: pendingRead, resolve: resolveRead } =
      Promise.withResolvers<void>();
    const onMarkRead = vi
      .fn<ProgramsNotificationsProps["onMarkRead"]>()
      .mockReturnValue(pendingRead);

    render(
      <ProgramsNotifications
        state={readyState()}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={onMarkRead}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.notificationBellTitle,
      })
    );
    const markAll = screen.getByRole("button", {
      name: COPY.notices.noticesMarkAllRead,
    });
    await user.click(markAll);

    expect(markAll).toBeDisabled();
    expect(markAll).toHaveAttribute("aria-busy", "true");
    resolveRead();
    await waitFor(() => {
      expect(markAll).toBeDisabled();
      expect(markAll).toHaveAttribute("aria-busy", "false");
    });
  });

  test("keeps the unread badge when marking read fails", async () => {
    const user = userEvent.setup();
    const onMarkRead = vi
      .fn<ProgramsNotificationsProps["onMarkRead"]>()
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValueOnce();
    render(
      <ProgramsNotifications
        state={readyState()}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={onMarkRead}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.notificationBellTitle,
      })
    );
    await user.click(
      screen.getByRole("button", { name: COPY.notices.noticesMarkAllRead })
    );
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledOnce());
    const readAlert = screen.getByRole("alert");
    expect(readAlert).toHaveTextContent(COPY.programs.notificationsReadError);
    expect(
      screen.getByLabelText(COPY.programs.notificationsUnread)
    ).toBeInTheDocument();
    await user.click(
      within(readAlert).getByRole("button", {
        name: COPY.programs.notificationsRetry,
      })
    );
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByLabelText(COPY.programs.notificationsUnread)
    ).not.toBeInTheDocument();
  });

  test("waits for an item read to settle before closing the compact panel", async () => {
    const user = userEvent.setup();
    const { promise: pendingRead, resolve: resolveRead } =
      Promise.withResolvers<void>();
    const onMarkRead = vi
      .fn<ProgramsNotificationsProps["onMarkRead"]>()
      .mockReturnValue(pendingRead);

    render(
      <ProgramsNotifications
        state={readyState()}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={onMarkRead}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.notificationBellTitle,
      })
    );
    await user.click(screen.getByRole("link", { name: /青年團契/u }));

    expect(onMarkRead).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    resolveRead();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  test("records modifier-click read failures and retries without blocking navigation", async () => {
    const onMarkRead = vi
      .fn<ProgramsNotificationsProps["onMarkRead"]>()
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValueOnce();
    render(
      <ProgramsNotifications
        state={readyState()}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={onMarkRead}
      />
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: COPY.programs.notificationBellTitle,
      })
    );
    const link = screen.getByRole("link", { name: /青年團契/u });
    expect(fireEvent.click(link, { metaKey: true })).toBeTruthy();
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledOnce());
    const readAlert = screen.getByRole("alert");
    expect(readAlert).toHaveTextContent(COPY.programs.notificationsReadError);

    await userEvent.click(
      within(readAlert).getByRole("button", {
        name: COPY.programs.notificationsRetry,
      })
    );
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByLabelText(COPY.programs.notificationsUnread)
    ).not.toBeInTheDocument();
  });

  test("keeps a normal-click read failure actionable before navigating", async () => {
    const user = userEvent.setup();
    const onMarkRead = vi
      .fn<ProgramsNotificationsProps["onMarkRead"]>()
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValueOnce();
    render(
      <ProgramsNotifications
        state={readyState()}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={onMarkRead}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.notificationBellTitle,
      })
    );
    await user.click(screen.getByRole("link", { name: /青年團契/u }));
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const readAlert = screen.getByRole("alert");
    await user.click(
      within(readAlert).getByRole("button", {
        name: COPY.programs.notificationsRetry,
      })
    );
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  test("renders empty and error states in the same bounded surface", () => {
    const onRetry = vi.fn<ProgramsNotificationsProps["onRetry"]>();
    const { rerender } = render(
      <ProgramsNotifications
        state={readyState({ items: [], unread_count: 0 })}
        onRetry={onRetry}
        onMarkRead={vi.fn<ProgramsNotificationsProps["onMarkRead"]>()}
        full
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      COPY.programs.notificationsEmpty
    );
    expect(
      document.querySelector<HTMLElement>('[data-feed-state="empty"]')
    ).not.toBeNull();

    rerender(
      <ProgramsNotifications
        state={{ kind: "error", message: "暫時無法載入" }}
        onRetry={onRetry}
        onMarkRead={vi.fn<ProgramsNotificationsProps["onMarkRead"]>()}
        full
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("暫時無法載入");
    expect(
      document.querySelector<HTMLElement>('[data-feed-state="error"]')
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: COPY.programs.notificationsRetry })
    ).toBeInTheDocument();
  });

  test("full Notifications task preserves unread items until activation", async () => {
    const user = userEvent.setup();
    const onMarkRead = vi.fn<ProgramsNotificationsProps["onMarkRead"]>();

    const { container } = render(
      <ProgramsNotifications
        state={readyState({
          items: [notification, eventNotification],
          unread_count: 2,
        })}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={onMarkRead}
        full
        departmentId="dept-current"
        hash="#overview"
      />
    );

    const fullSurface = container.querySelector<HTMLElement>(
      'section[aria-labelledby="programs-notifications-title"]'
    );
    if (!fullSurface) {
      throw new Error("full Notifications task surface is missing");
    }
    const scoped = within(fullSurface);
    expect(
      scoped.getByRole("heading", {
        name: COPY.programs.notificationsScreenTitle,
      })
    ).toBeInTheDocument();
    expect(
      scoped.getByRole("heading", {
        name: COPY.programs.notificationsUnreadSection,
      })
    ).toBeInTheDocument();
    expect(onMarkRead).not.toHaveBeenCalled();
    const enrollmentLink = scoped.getByRole("link", {
      name: new RegExp(COPY.programs.notificationsEnrollmentLabel, "u"),
    });
    expect(enrollmentLink).toHaveAttribute(
      "href",
      "/programs?mode=management&department=dept-1&program=program-1&task=participants#overview"
    );
    await user.click(enrollmentLink);
    await waitFor(() => {
      expect(onMarkRead).toHaveBeenCalledOnce();
      expect(onMarkRead).toHaveBeenCalledWith([
        expect.objectContaining({
          source_key: notification.source_key,
          source_revision: notification.source_revision,
        }),
      ]);
    });
    expect(
      scoped.getAllByLabelText(COPY.programs.notificationsUnread)
    ).toHaveLength(1);
  });

  test("uses a semantic canonical link for the compact view-all action", async () => {
    const user = userEvent.setup();
    render(
      <ProgramsNotifications
        state={readyState({ has_more: true })}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={vi.fn<ProgramsNotificationsProps["onMarkRead"]>()}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.notificationBellTitle,
      })
    );
    const viewAll = screen.getByRole("link", {
      name: COPY.programs.notificationsViewAll,
    });
    expect(viewAll).toHaveAttribute(
      "href",
      "/programs?mode=management&task=notifications"
    );
    await user.click(viewAll);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("forwards Feed Presentation status and announcement slots", () => {
    render(
      <ProgramsNotifications
        state={readyState()}
        onRetry={vi.fn<ProgramsNotificationsProps["onRetry"]>()}
        onMarkRead={vi.fn<ProgramsNotificationsProps["onMarkRead"]>()}
        status={<output>通知已更新</output>}
        announcement={{ key: "revision-2", message: "通知已更新" }}
        full
      />
    );

    expect(screen.getByText("通知已更新")).toBeInTheDocument();
    expect(
      document.querySelector(
        '[data-feed-announcement-owner="global-live-region"]'
      )
    ).toBeInTheDocument();
  });
});
