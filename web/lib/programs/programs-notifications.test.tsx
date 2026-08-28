import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

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
        onViewAll={vi.fn<ProgramsNotificationsProps["onViewAll"]>()}
      />
    );

    const trigger = screen.getByRole("button", {
      name: COPY.programs.notificationBellTitle,
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
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

  test("renders empty and error states in the same bounded surface", () => {
    const onRetry = vi.fn<ProgramsNotificationsProps["onRetry"]>();
    const { rerender } = render(
      <ProgramsNotifications
        state={readyState({ items: [], unread_count: 0 })}
        onRetry={onRetry}
        onMarkRead={vi.fn<ProgramsNotificationsProps["onMarkRead"]>()}
        onViewAll={vi.fn<ProgramsNotificationsProps["onViewAll"]>()}
        full
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      COPY.programs.notificationsEmpty
    );

    rerender(
      <ProgramsNotifications
        state={{ kind: "error", message: "暫時無法載入" }}
        onRetry={onRetry}
        onMarkRead={vi.fn<ProgramsNotificationsProps["onMarkRead"]>()}
        onViewAll={vi.fn<ProgramsNotificationsProps["onViewAll"]>()}
        full
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("暫時無法載入");
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
        onViewAll={vi.fn<ProgramsNotificationsProps["onViewAll"]>()}
        full
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
    await user.click(scoped.getByRole("link", { name: /青年團契/u }));
    expect(onMarkRead).toHaveBeenCalled();
  });
});
