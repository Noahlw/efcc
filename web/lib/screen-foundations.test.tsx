import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ScreenCard,
  ScreenEditor,
  ScreenField,
  ScreenFilterChip,
  ScreenFilters,
  ScreenHeader,
  ScreenIconButton,
  ScreenLoadingRows,
  ScreenPageFrame,
  ScreenRow,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenState,
  ScreenStatus,
  ScreenStickyActions,
  ScreenTab,
  ScreenTabs,
  ScreenTaskGrid,
  ScreenTaskSurface,
} from "@/lib/screen-foundations";

describe("Screen Foundations public contracts", () => {
  afterEach(() => cleanup());

  test("composes a token-owned page frame and child header with an icon-only Back", () => {
    render(
      <ScreenPageFrame width="compact">
        <ScreenHeader
          backHref="/programs"
          backLabel="返回課程"
          level="child"
          lead="保留 route owner 提供嘅目的地。"
          title="課程詳情"
        />
      </ScreenPageFrame>
    );

    const frame = document.querySelector<HTMLElement>(
      '[data-screen-foundation="page-frame"]'
    );
    if (!frame) {
      throw new Error("missing ScreenPageFrame");
    }
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "課程詳情",
    });
    const back = screen.getByRole("link", { name: "返回課程" });
    expect({
      frame: {
        foundation: frame.dataset.screenFoundation,
        gutter: frame.className.includes("px-[var(--screen-gutter)]"),
        width: frame.dataset.screenWidth,
        maxWidth: frame.className.includes("max-w-[760px]"),
      },
      heading: {
        foundation: heading.dataset.screenHeading,
        childTitle: heading.className.includes(
          "text-[length:var(--screen-child-title-size)]"
        ),
      },
      back: {
        href: back.getAttribute("href"),
        iconButton: back.dataset.screenIconButton,
        hitTarget: back.className.includes("size-11"),
      },
    }).toStrictEqual({
      frame: {
        foundation: "page-frame",
        gutter: true,
        width: "compact",
        maxWidth: true,
      },
      heading: { foundation: "child", childTitle: true },
      back: {
        href: "/programs",
        iconButton: "true",
        hitTarget: true,
      },
    });
  });

  test("keeps collection and settings rows content-responsive with semantic state", () => {
    render(
      <div>
        <ScreenRow asChild density="collection" selected>
          <a href="/programs/one">
            <ScreenRowMain>
              <ScreenRowTitle>較長嘅課程名稱可以自然換行</ScreenRowTitle>
              <ScreenRowMeta>培育部 · 進行中</ScreenRowMeta>
            </ScreenRowMain>
            <ScreenStatus tone="success">進行中</ScreenStatus>
          </a>
        </ScreenRow>
        <ScreenRow density="settings" tone="danger">
          <ScreenRowMain>
            <ScreenRowTitle>封存課程</ScreenRowTitle>
            <ScreenRowMeta>保留歷史紀錄</ScreenRowMeta>
          </ScreenRowMain>
        </ScreenRow>
      </div>
    );

    const collection = screen.getByRole("link", { name: /較長嘅課程名稱/u });
    const settings = screen
      .getByText("封存課程")
      .closest<HTMLElement>("div[data-screen-row]");
    expect({
      collection: {
        row: collection.dataset.screenRow,
        density: collection.dataset.density,
        selected: collection.dataset.selected,
        minHeight: collection.className.includes(
          "min-h-[var(--screen-row-min-height)]"
        ),
        padding: collection.className.includes(
          "py-[var(--screen-row-padding-block)]"
        ),
        flat: !collection.className.includes("shadow"),
      },
      settings: settings
        ? {
            density: settings.dataset.density,
            tone: settings.dataset.tone,
            minHeight: settings.className.includes(
              "min-h-[var(--screen-settings-row-min-height)]"
            ),
          }
        : null,
    }).toStrictEqual({
      collection: {
        row: "true",
        density: "collection",
        selected: "true",
        minHeight: true,
        padding: true,
        flat: true,
      },
      settings: { density: "settings", tone: "danger", minHeight: true },
    });
  });

  test("exposes selected tabs and filters as keyboard-operable controls", async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn<(filter: "all" | "joined") => void>();
    render(
      <div>
        <ScreenTabs aria-label="課程工作區">
          <ScreenTab asChild selected>
            <a href="/programs/one">概覽</a>
          </ScreenTab>
          <ScreenTab asChild>
            <a href="/programs/one/events">聚會</a>
          </ScreenTab>
        </ScreenTabs>
        <ScreenFilters aria-label="課程篩選">
          <ScreenFilterChip onClick={() => onFilterChange("all")} selected>
            全部
          </ScreenFilterChip>
          <ScreenFilterChip onClick={() => onFilterChange("joined")}>
            已參加
          </ScreenFilterChip>
        </ScreenFilters>
      </div>
    );

    expect(screen.getByRole("link", { name: "概覽" })).toHaveAttribute(
      "data-selected",
      "true"
    );
    expect(screen.getByRole("link", { name: "概覽" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("button", { name: "已參加" }));
    expect(onFilterChange).toHaveBeenCalledWith("joined");
  });

  test("keeps task surfaces and semantic cards flat by default", () => {
    render(
      <ScreenTaskGrid>
        <ScreenTaskSurface asChild>
          <a href="/programs/one/events">
            <strong>聚會</strong>
            <span>管理課程活動</span>
          </a>
        </ScreenTaskSurface>
        <ScreenCard tone="emphasis">下一個聚會</ScreenCard>
      </ScreenTaskGrid>
    );

    const task = screen.getByRole("link", { name: /聚會管理課程活動/u });
    expect(task).toHaveAttribute("data-screen-task-surface", "true");
    expect(task.className).toContain("min-h-[92px]");
    expect(task.className).toContain("rounded-[var(--screen-radius-surface)]");
    expect(task.className).not.toContain("shadow");
    expect(screen.getByText("下一個聚會")).toHaveAttribute(
      "data-screen-card-tone",
      "emphasis"
    );
  });

  test("renders natural-locus loading and recoverable error states", () => {
    render(
      <div>
        <ScreenLoadingRows density="settings" />
        <ScreenState
          action={<button type="button">重試</button>}
          description="稍後再試。"
          kind="error"
          title="載入失敗"
        />
        <ScreenState
          description="目前沒有符合條件嘅資料。"
          kind="empty"
          title="暫時未有資料"
        />
      </div>
    );

    expect(screen.getByRole("status", { name: "載入中" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByRole("alert")).toHaveTextContent("載入失敗");
    expect(screen.getByRole("button", { name: "重試" })).toBeEnabled();
    expect(screen.getByText("暫時未有資料")).toBeInTheDocument();
  });

  test("keeps focused editor fields, sticky actions, and icon names accessible", () => {
    render(
      <ScreenEditor aria-label="課程編輯">
        <ScreenField
          help="使用清晰嘅課程名稱。"
          htmlFor="program-name"
          label="課程名稱"
        >
          <input id="program-name" />
        </ScreenField>
        <ScreenStickyActions>
          <button type="button">取消變更</button>
          <button type="submit">儲存</button>
        </ScreenStickyActions>
        <ScreenIconButton aria-label="通知">
          <span aria-hidden="true">!</span>
        </ScreenIconButton>
      </ScreenEditor>
    );

    expect(screen.getByRole("form", { name: "課程編輯" })).toHaveAttribute(
      "data-screen-foundation",
      "editor"
    );
    expect(screen.getByLabelText("課程名稱")).toHaveAttribute(
      "id",
      "program-name"
    );
    expect(screen.getByTestId("screen-sticky-actions")).toHaveAttribute(
      "data-screen-foundation",
      "sticky-actions"
    );
    expect(screen.getByRole("button", { name: "通知" })).toHaveAttribute(
      "data-screen-icon-button",
      "true"
    );
  });
});
