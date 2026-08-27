import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { AttentionPanel } from "@/lib/attention-panel";
import type { AttentionData } from "@/lib/attention-panel";
import { COPY } from "@/lib/copy";

describe(AttentionPanel, () => {
  test("renders nothing when closed", () => {
    render(<AttentionPanel open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("renders open dialog with title and close button", () => {
    render(<AttentionPanel open onClose={() => {}} />);
    expect(
      screen.getByRole("dialog", { name: COPY.attention.title })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.attention.close })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: COPY.attention.pendingTab })
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: COPY.attention.noticesTab })
    ).toHaveAttribute("aria-selected", "false");
  });

  test("renders empty state for pending tab by default", () => {
    render(<AttentionPanel open onClose={() => {}} />);
    expect(
      screen.getByRole("heading", {
        name: COPY.attention.pendingEmptyTitle,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.attention.pendingEmptyHint)
    ).toBeInTheDocument();
  });

  test("switches between pending and notices tabs", async () => {
    const user = userEvent.setup();
    render(<AttentionPanel open onClose={() => {}} />);

    const noticesTab = screen.getByRole("tab", {
      name: COPY.attention.noticesTab,
    });
    await user.click(noticesTab);

    expect(noticesTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", {
        name: COPY.attention.noticesEmptyTitle,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.attention.noticesEmptyHint)
    ).toBeInTheDocument();
  });

  test("clicking close button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    render(<AttentionPanel open onClose={onClose} />);

    await user.click(
      screen.getByRole("button", { name: COPY.attention.close })
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("pressing Escape calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    render(<AttentionPanel open onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("focus returns to the caller-provided trigger on close", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    const trigger = document.createElement("button");
    trigger.textContent = "bell";
    document.body.append(trigger);
    try {
      const { unmount } = render(
        <AttentionPanel
          open
          onClose={onClose}
          onCloseAutoFocus={() => trigger.focus()}
        />
      );
      const dialog = screen.getByRole("dialog", {
        name: COPY.attention.title,
      });
      await user.click(
        within(dialog).getByRole("button", { name: COPY.attention.close })
      );
      expect(onClose).toHaveBeenCalledOnce();
      unmount();
      await waitFor(() => expect(trigger).toHaveFocus());
    } finally {
      trigger.remove();
    }
  });

  test("renders items when data is provided", async () => {
    const user = userEvent.setup();
    const customData: AttentionData = {
      pendingItems: [
        { id: "p1", title: "1 項註冊待審批", detail: "請前往審批隊列" },
      ],
      notices: [
        {
          id: "n1",
          title: "主日學即將開課",
          detail: "8月24日開課",
          unread: true,
        },
      ],
    };

    render(<AttentionPanel open onClose={() => {}} data={customData} />);
    expect(screen.getByText("1 項註冊待審批")).toBeInTheDocument();
    expect(screen.getByText("請前往審批隊列")).toBeInTheDocument();

    await user.click(
      screen.getByRole("tab", { name: COPY.attention.noticesTab })
    );
    expect(screen.getByText("主日學即將開課")).toBeInTheDocument();
  });
});
