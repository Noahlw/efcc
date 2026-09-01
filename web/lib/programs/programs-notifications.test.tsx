import {
  cleanup,
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
afterEach(cleanup);

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
  test("keeps the compact bell small and marks visible unread sources on open", async () => {
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
    await waitFor(() => {
      expect(onMarkRead).toHaveBeenCalledWith([
        expect.objectContaining({
          source_key: notification.source_key,
          source_revision: notification.source_revision,
        }),
      ]);
    });
    expect(
      screen.queryByText(COPY.programs.notificationsUnread)
    ).not.toBeInTheDocument();
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
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledOnce());
    const readAlert = screen.getByRole("alert");
    expect(readAlert).toHaveTextContent(COPY.programs.notificationsReadError);
    await user.click(
      within(readAlert).getByRole("button", {
        name: COPY.programs.notificationsRetry,
      })
    );
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByText(COPY.programs.notificationsUnread)
    ).not.toBeInTheDocument();
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
  test("full Notifications task marks unread items without rendering the compact bell", async () => {
    const user = userEvent.setup();
    const onMarkRead = vi.fn<ProgramsNotificationsProps["onMarkRead"]>();

    const { container } = render(
      <ProgramsNotifications
        state={readyState()}
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
    expect(fullSurface).not.toBeNull();
    if (!fullSurface) {
      throw new Error("full Notifications task surface is missing");
    }
    const scoped = within(fullSurface);
    expect(
      scoped.getByRole("heading", { name: COPY.programs.notificationsTitle })
    ).toBeInTheDocument();
    expect(
      scoped.queryByRole("button", {
        name: COPY.programs.notificationBellTitle,
      })
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onMarkRead).toHaveBeenCalledWith([
        expect.objectContaining({
          source_key: notification.source_key,
          source_revision: notification.source_revision,
        }),
      ]);
    });
    expect(scoped.getByRole("link", { name: /青年團契/u })).toHaveAttribute(
      "href",
      "/programs?mode=management&department=dept-1&program=program-1&task=participants#overview"
    );
    await user.click(scoped.getByRole("link", { name: /青年團契/u }));
    expect(onMarkRead).toHaveBeenCalled();
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
