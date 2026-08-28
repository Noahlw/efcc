import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FeedPresentation } from "@/lib/feed-presentation";

afterEach(() => cleanup());

function renderFeed(
  state: React.ComponentProps<typeof FeedPresentation>["state"],
  announcement?: { key: string | number; message: string }
) {
  return render(
    <FeedPresentation
      state={state}
      list={<p>列表內容</p>}
      detail={<p>詳細內容</p>}
      loading={<output>載入中</output>}
      error={<div role="alert">載入失敗</div>}
      empty={<p>暫時沒有內容</p>}
      announcement={announcement}
      onAnnounce={vi.fn()}
      aria-label="測試清單"
    />
  );
}

describe(FeedPresentation, () => {
  test.each([
    ["loading", "載入中"],
    ["ready", "列表內容"],
    ["empty", "暫時沒有內容"],
    ["error", "載入失敗"],
    ["detail", "詳細內容"],
  ] as const)("renders the %s slot", (state, content) => {
    renderFeed(state);
    expect(screen.getByText(content)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "測試清單" })).toHaveAttribute(
      "data-feed-state",
      state
    );
  });

  test("exposes busy semantics only while loading", () => {
    const { rerender } = renderFeed("loading");
    const feed = screen.getByRole("region", { name: "測試清單" });
    expect(feed).toHaveAttribute("aria-busy", "true");

    rerender(
      <FeedPresentation
        state="ready"
        list={<p>列表內容</p>}
        loading={<output>載入中</output>}
        error={<div role="alert">載入失敗</div>}
        empty={<p>暫時沒有內容</p>}
        aria-label="測試清單"
      />
    );
    expect(feed).not.toHaveAttribute("aria-busy");
  });

  test("announces a keyed transition once through the supplied owner", () => {
    const onAnnounce = vi.fn();
    const { rerender } = render(
      <FeedPresentation
        state="loading"
        list={<p>列表內容</p>}
        loading={<output>載入中</output>}
        error={<p>載入失敗</p>}
        empty={<p>暫時沒有內容</p>}
        announcement={{ key: "load-1", message: "正在載入" }}
        onAnnounce={onAnnounce}
      />
    );
    expect(onAnnounce).toHaveBeenCalledTimes(1);

    rerender(
      <FeedPresentation
        state="loading"
        list={<p>列表內容</p>}
        loading={<output>載入中</output>}
        error={<p>載入失敗</p>}
        empty={<p>暫時沒有內容</p>}
        announcement={{ key: "load-1", message: "正在載入" }}
        onAnnounce={onAnnounce}
      />
    );
    expect(onAnnounce).toHaveBeenCalledTimes(1);

    rerender(
      <FeedPresentation
        state="error"
        list={<p>列表內容</p>}
        loading={<output>載入中</output>}
        error={<p>載入失敗</p>}
        empty={<p>暫時沒有內容</p>}
        announcement={{ key: "error-1", message: "載入失敗" }}
        onAnnounce={onAnnounce}
      />
    );
    expect(onAnnounce).toHaveBeenCalledTimes(2);
    expect(onAnnounce).toHaveBeenLastCalledWith("載入失敗");
  });

  test("focuses a caller target after state changes without adding a live region", () => {
    function Harness() {
      const targetRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={targetRef} type="button">
            返回清單
          </button>
          <FeedPresentation
            state="ready"
            list={<p>列表內容</p>}
            loading={<output>載入中</output>}
            error={<div role="alert">載入失敗</div>}
            empty={<p>暫時沒有內容</p>}
            focusTargetRef={targetRef}
          />
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole("button", { name: "返回清單" })).toHaveFocus();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(0);
    expect(
      document.querySelectorAll('[data-feed-announcement-owner="global-live-region"]')
    ).toHaveLength(1);
  });
});
