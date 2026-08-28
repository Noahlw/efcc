/* oxlint-disable vitest/require-mock-type-parameters, import/first, vitest/require-top-level-describe, eslint/require-unicode-regexp -- hoisted vi.mock before imports; shared hooks cover all describes */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listNotices: vi.fn(),
  markAllNoticesRead: vi.fn(),
  announce: vi.fn(),
}));

vi.mock(import("@/lib/notices-api"), () => ({
  listNotices: mocks.listNotices,
  markAllNoticesRead: mocks.markAllNoticesRead,
}));
vi.mock(import("@/lib/live-region"), () => ({ announce: mocks.announce }));

import { COPY } from "@/lib/copy";
import type { Notice } from "@/lib/notices-api";
import { NoticesPanel } from "@/lib/notices-panel";


const unreadEvent: Notice = {
  notice_id: "notice-event",
  kind: "event",
  title: "聚會提醒",
  body: "你已報名的聚會即將開始。",
  program_id: "program-adult",
  event_id: "event-1",
  read_at: null,
  created_at: Date.parse("2026-08-16T11:00:00.000Z"),
};

const readAccount: Notice = {
  notice_id: "notice-account",
  kind: "account",
  title: "帳戶更新",
  body: "你的帳戶資料已更新。",
  program_id: null,
  event_id: null,
  read_at: Date.parse("2026-08-15T02:00:00.000Z"),
  created_at: Date.parse("2026-08-15T02:00:00.000Z"),
};

beforeEach(() => {
  mocks.listNotices.mockReset();
  mocks.markAllNoticesRead.mockReset();
  mocks.announce.mockReset();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-19T10:00:00.000Z"));
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe(NoticesPanel, () => {
  test("renders unread indicators and Hong Kong timestamps", async () => {
    mocks.listNotices.mockResolvedValue({
      notices: [unreadEvent, readAccount],
      unread_count: 1,
    });

    render(<NoticesPanel />);

    await expect(
      screen.findByText(unreadEvent.title)
    ).resolves.toBeInTheDocument();
    expect(screen.getByText(COPY.notices.noticesUnread)).toBeInTheDocument();
    // The HK wall label depends on ICU locale data (space vs narrow
    // no-break space differs across Node builds), so anchor the timestamp
    // assertion on the env-independent ISO dateTime attribute instead of
    // the exact localized string.
    const expectedIso = new Date(unreadEvent.created_at).toISOString();
    const timeLabel = screen.getByText(
      (_, element) =>
        element !== null &&
        element.tagName === "TIME" &&
        element.getAttribute("dateTime") === expectedIso
    );
    expect(timeLabel).toBeInTheDocument();
    expect(timeLabel).toHaveTextContent("8月16日");
    expect(screen.getByText(readAccount.title)).toBeInTheDocument();
  });

  test("labels notices as 今天 and 昨天 in Church Time", async () => {
    const todayNotice: Notice = {
      ...unreadEvent,
      notice_id: "notice-today",
      title: "今日提醒",
      created_at: Date.parse("2026-08-19T01:00:00.000Z"),
    };
    const yesterdayNotice: Notice = {
      ...readAccount,
      notice_id: "notice-yesterday",
      title: "昨日更新",
      created_at: Date.parse("2026-08-18T10:00:00.000Z"),
    };
    mocks.listNotices.mockResolvedValue({
      notices: [todayNotice, yesterdayNotice],
      unread_count: 1,
    });

    render(<NoticesPanel />);

    await expect(screen.findByText("今日提醒")).resolves.toBeInTheDocument();
    const todayIso = new Date(todayNotice.created_at).toISOString();
    const yesterdayIso = new Date(yesterdayNotice.created_at).toISOString();
    expect(
      screen.getByText(
        (_, element) =>
          element !== null &&
          element.tagName === "TIME" &&
          element.getAttribute("dateTime") === todayIso
      )
    ).toHaveTextContent("今天");
    expect(
      screen.getByText(
        (_, element) =>
          element !== null &&
          element.tagName === "TIME" &&
          element.getAttribute("dateTime") === yesterdayIso
      )
    ).toHaveTextContent("昨天");
  });

  test("marks all unread notices read and announces confirmation", async () => {
    const user = userEvent.setup();
    mocks.listNotices.mockResolvedValue({
      notices: [unreadEvent],
      unread_count: 1,
    });
    mocks.markAllNoticesRead.mockResolvedValue({ marked_count: 1 });

    render(<NoticesPanel />);
    await screen.findByText(unreadEvent.title);
    await user.click(
      screen.getByRole("button", { name: COPY.notices.noticesMarkAllRead })
    );

    await waitFor(() => {
      expect(mocks.markAllNoticesRead).toHaveBeenCalledOnce();
      expect(mocks.announce).toHaveBeenCalledWith(
        COPY.notices.noticesMarkedAllRead
      );
    });
    expect(
      screen.queryByText(COPY.notices.noticesUnread)
    ).not.toBeInTheDocument();
  });
  test("keeps read failure visible and leaves the action available", async () => {
    const user = userEvent.setup();
    mocks.listNotices.mockResolvedValue({
      notices: [unreadEvent],
      unread_count: 1,
    });
    mocks.markAllNoticesRead.mockRejectedValueOnce(new Error("offline"));

    render(<NoticesPanel />);
    await screen.findByText(unreadEvent.title);
    await user.click(
      screen.getByRole("button", { name: COPY.notices.noticesMarkAllRead })
    );

    await expect(
      screen.findByText(COPY.notices.noticesMarkAllReadError)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.notices.noticesMarkAllRead })
    ).toBeEnabled();
    expect(mocks.announce).not.toHaveBeenCalledWith(
      COPY.notices.noticesMarkAllReadError
    );
  });

  test("renders the honest empty state", async () => {
    mocks.listNotices.mockResolvedValue({ notices: [], unread_count: 0 });

    render(<NoticesPanel />);

    await expect(
      screen.findByText(COPY.notices.noticesEmpty)
    ).resolves.toBeInTheDocument();
    expect(screen.getByText(COPY.notices.noticesEmptyHint)).toBeInTheDocument();
  });

  test("renders the loading state while the request is pending", () => {
    const pending = Promise.withResolvers<{
      notices: Notice[];
      unread_count: number;
    }>();
    mocks.listNotices.mockReturnValue(pending.promise);

    render(<NoticesPanel />);

    expect(screen.getByText(COPY.notices.noticesLoading)).toBeInTheDocument();
  });
  test("keeps the global live region as the only announcement owner", async () => {
    mocks.listNotices.mockResolvedValue({ notices: [], unread_count: 0 });

    render(<NoticesPanel />);
    await screen.findByText(COPY.notices.noticesEmpty);

    expect(document.querySelectorAll("[aria-live]")).toHaveLength(0);
    expect(
      screen.getByRole("region", { name: COPY.notices.noticesListLabel })
    ).toHaveAttribute("data-feed-announcement-owner", "global-live-region");
  });

  test("renders an error and retries the request", async () => {
    const user = userEvent.setup();
    mocks.listNotices
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ notices: [], unread_count: 0 });

    render(<NoticesPanel />);

    await expect(
      screen.findByText(COPY.notices.noticesLoadError)
    ).resolves.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.notices.noticesRetry })
    );
    await expect(
      screen.findByText(COPY.notices.noticesEmpty)
    ).resolves.toBeInTheDocument();
    expect(mocks.listNotices).toHaveBeenCalledTimes(2);
  });

  test("routes event notices to the participant event detail", async () => {
    mocks.listNotices.mockResolvedValue({
      notices: [unreadEvent],
      unread_count: 1,
    });

    render(<NoticesPanel />);

    await expect(
      screen.findByRole("link", { name: /聚會提醒/ })
    ).resolves.toHaveAttribute(
      "href",
      "/programs?program=program-adult&from=notices&event=event-1"
    );
  });

  test("routes program notices to the participant program detail", async () => {
    const notice: Notice = {
      ...unreadEvent,
      notice_id: "notice-program",
      kind: "program",
      title: "報名結果",
      event_id: null,
    };
    mocks.listNotices.mockResolvedValue({ notices: [notice], unread_count: 1 });

    render(<NoticesPanel />);

    await expect(
      screen.findByRole("link", { name: /報名結果/ })
    ).resolves.toHaveAttribute(
      "href",
      "/programs?program=program-adult&from=notices"
    );
  });

  test("routes account notices to the profile page", async () => {
    mocks.listNotices.mockResolvedValue({
      notices: [readAccount],
      unread_count: 0,
    });

    render(<NoticesPanel />);

    await expect(
      screen.findByRole("link", { name: /帳戶更新/ })
    ).resolves.toHaveAttribute("href", "/profile");
  });

  test("keeps the toolbar pinned to unread chip and mark-all button for wrap", async () => {
    mocks.listNotices.mockResolvedValue({
      notices: [unreadEvent],
      unread_count: 120,
    });

    render(<NoticesPanel />);

    await expect(
      screen.findByText(unreadEvent.title)
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("120 未讀")).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.notices.noticesMarkAllRead })
    ).toBeVisible();
  });
});
