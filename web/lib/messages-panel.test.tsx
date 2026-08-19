/* oxlint-disable vitest/prefer-import-in-mock, vitest/prefer-mock-promise-shorthand, vitest/require-mock-type-parameters, vitest/require-top-level-describe */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";
import { MessagesPanel } from "@/lib/messages-panel";

const mocks = vi.hoisted(() => {
  const push = vi.fn<(href: string) => void>();
  const searchParams = vi.fn(() => new URLSearchParams());
  return {
    listAnnouncements: vi.fn(),
    push,
    searchParams,
    router: { push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams(),
}));

vi.mock("@/lib/home-api", () => ({
  listAnnouncements: mocks.listAnnouncements,
}));

const SAMPLE = {
  contentId: "church-msg-1",
  version: 1,
  title: "本週崇拜",
  summary: "禮堂改期",
  bodyMarkdown: null,
  ctaLabel: null,
  ctaUrl: null,
  imageUrl: null,
  imageAlt: null,
  publishedAt: "2026-08-15T04:00:00.000Z",
};

beforeEach(() => {
  mocks.listAnnouncements.mockReset();
  mocks.push.mockReset();
  mocks.searchParams.mockReturnValue(new URLSearchParams());
});

afterEach(() => cleanup());

describe(MessagesPanel, () => {
  test("renders the empty Notices-style chrome", async () => {
    mocks.listAnnouncements.mockResolvedValue({ announcements: [] });
    render(<MessagesPanel />);
    await expect(screen.findByText(COPY.home.messagesEmpty)).resolves.toBeInTheDocument();
    expect(screen.getByText(COPY.home.messagesEmptyHint)).toBeInTheDocument();
  });

  test("lists published messages", async () => {
    mocks.listAnnouncements.mockResolvedValue({ announcements: [SAMPLE] });
    render(<MessagesPanel />);
    const row = await screen.findByRole("link", { name: /本週崇拜/u });
    expect(row).toHaveAttribute("href", "/messages?content=church-msg-1");
  });

  test("opens detail from the content URL and backs to the list", async () => {
    mocks.listAnnouncements.mockResolvedValue({ announcements: [SAMPLE] });
    mocks.searchParams.mockReturnValue(
      new URLSearchParams("content=church-msg-1")
    );
    render(<MessagesPanel />);
    await expect(screen.findByTestId("announcement-detail")).resolves.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: COPY.home.churchNews })
    );
    expect(mocks.push).toHaveBeenCalledWith("/messages");
  });
});
