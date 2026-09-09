import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  DirectoryFrame,
  type DirectoryListSlotContext,
} from "@/app/management/directory-frame";

const header = <h1 id="directory-title">名錄</h1>;
const search = <label htmlFor="directory-search">搜尋</label>;

function listSlot(onSelect: (id: string) => void) {
  return ({
    selection,
  }: {
    selection: {
      selectedId: string | null;
      onSelect: (id: string) => void;
    };
  }) => (
    <button
      aria-pressed={selection.selectedId === "row-1"}
      onClick={() => onSelect("row-1")}
      type="button"
    >
      Row one
    </button>
  );
}

afterEach(() => cleanup());

describe("DirectoryFrame", () => {
  test("renders typed state slots and delegates selection through the list adapter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const selection = { onSelect, selectedId: null };

    render(
      <DirectoryFrame
        ariaLabelledBy="directory-title"
        header={header}
        hasResults
        list={listSlot(onSelect)}
        search={search}
        selection={selection}
        state="ready"
      />
    );

    expect(screen.getByRole("region", { name: "名錄" })).toHaveAttribute(
      "data-directory-state",
      "ready"
    );
    await user.click(screen.getByRole("button", { name: "Row one" }));
    expect(onSelect).toHaveBeenCalledWith("row-1");
  });

  test("passes typed selection and virtualization hooks to the list adapter", () => {
    const onSelect = vi.fn();
    const onVisibleRangeChange = vi.fn();
    let context: DirectoryListSlotContext | undefined;

    render(
      <DirectoryFrame
        header={header}
        list={(nextContext) => {
          context = nextContext;
          return <p>列表</p>;
        }}
        search={search}
        selection={{ onSelect, selectedId: "row-1" }}
        state="ready"
        virtualization={{ onVisibleRangeChange, overscan: 8 }}
      />
    );

    expect(context?.selection.selectedId).toBe("row-1");
    expect(context?.virtualization.overscan).toBe(8);
    context?.virtualization.onVisibleRangeChange?.({ end: 12, start: 4 });
    expect(onVisibleRangeChange).toHaveBeenCalledWith({ end: 12, start: 4 });
  });

  test("keeps forbidden separate from recoverable error slots", () => {
    render(
      <DirectoryFrame
        error={<p>可重試錯誤</p>}
        forbidden={<p>禁止存取</p>}
        header={header}
        search={search}
        state="forbidden"
      />
    );

    expect(screen.getByText("禁止存取")).toBeInTheDocument();
    expect(screen.queryByText("可重試錯誤")).toBeNull();
  });

  test("restores focus to the state target after a failed retry", async () => {
    const stateRef = createRef<HTMLElement>();
    const { rerender } = render(
      <DirectoryFrame
        error={
          <section ref={stateRef} tabIndex={-1}>
            載入失敗
          </section>
        }
        focus={{ retryKey: 0, stateRef }}
        header={header}
        search={search}
        state="error"
      />
    );

    rerender(
      <DirectoryFrame
        focus={{ retryKey: 1, stateRef }}
        header={header}
        loading={<output>載入中</output>}
        search={search}
        state="loading"
      />
    );
    await waitFor(() => expect(screen.getByText("載入中")).toBeInTheDocument());
    rerender(
      <DirectoryFrame
        error={
          <section ref={stateRef} tabIndex={-1}>
            載入失敗
          </section>
        }
        focus={{ retryKey: 1, stateRef }}
        header={header}
        search={search}
        state="error"
      />
    );

    await waitFor(() => expect(stateRef.current).toHaveFocus());
  });

  test("restores focus to the results target after a successful retry", async () => {
    const resultsRef = createRef<HTMLElement>();
    const stateRef = createRef<HTMLElement>();
    const { rerender } = render(
      <DirectoryFrame
        error={
          <section ref={stateRef} tabIndex={-1}>
            載入失敗
          </section>
        }
        focus={{ retryKey: 0, resultsRef, stateRef }}
        header={header}
        search={search}
        state="error"
      />
    );

    rerender(
      <DirectoryFrame
        focus={{ retryKey: 1, resultsRef, stateRef }}
        header={header}
        loading={<output>載入中</output>}
        search={search}
        state="loading"
      />
    );
    await waitFor(() => expect(screen.getByText("載入中")).toBeInTheDocument());
    rerender(
      <DirectoryFrame
        focus={{ retryKey: 1, resultsRef, stateRef }}
        header={header}
        hasResults
        list={
          <h2
            ref={(node) => {
              resultsRef.current = node;
            }}
            tabIndex={-1}
          >
            結果
          </h2>
        }
        search={search}
        state="ready"
      />
    );

    await waitFor(() => expect(resultsRef.current).toHaveFocus());
  });

  test("renders load-more and recovery hooks without replacing the list", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const onRetry = vi.fn();

    render(
      <DirectoryFrame
        header={header}
        hasResults
        list={<p>既有結果</p>}
        pagination={{
          error: <span>載入更多失敗</span>,
          hasMore: true,
          label: "載入更多",
          onLoadMore,
          onRetry,
          retryLabel: "重試",
        }}
        search={search}
        state="ready"
      />
    );

    expect(screen.getByText("既有結果")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "載入更多" }));
    await user.click(screen.getByRole("button", { name: "重試" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
